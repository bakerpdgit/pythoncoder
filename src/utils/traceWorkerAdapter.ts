import type { InspectorNode } from '../types'
import type {
  TraceBindingState,
  TraceCallActivation,
  TraceEventBatch,
  TraceExecutionEvent,
  TraceSession,
  TraceVariableDefinition,
  TraceWorkerBatchMessage,
  TraceWorkerDeletedValue,
  TraceWorkerEndMessage,
  TraceWorkerEvent,
  TraceWorkerLimitReachedMessage,
  TraceWorkerStopAckMessage,
  TraceWorkerVariableValue,
  TraceWriteKind,
  TraceWriteMarker,
} from '../types/traceTable'
import {
  globalTraceVariableId,
  localTraceVariableId,
  reconstructTraceState,
  traceBindingKey,
} from './traceLog'

const valuesEqual = (left: InspectorNode, right: InspectorNode): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const variableIdFor = (value: Pick<TraceWorkerVariableValue, 'scope' | 'function' | 'name'>): string =>
  value.scope === 'global'
    ? globalTraceVariableId(value.name)
    : localTraceVariableId(value.function, value.name)

const callIdFor = (value: Pick<TraceWorkerVariableValue, 'scope' | 'callId'>): number | null =>
  value.scope === 'global' ? null : value.callId

function variableDefinition(
  value: Pick<TraceWorkerVariableValue, 'scope' | 'function' | 'name' | 'defaultLabel' | 'category'>,
  sequence: number,
): TraceVariableDefinition {
  const owner = value.function || '<module>'
  return {
    id: variableIdFor(value as TraceWorkerVariableValue),
    name: value.name,
    defaultLabel: value.defaultLabel,
    scope: value.scope === 'global'
      ? { kind: 'global' }
      : { kind: 'local', owner, functionName: owner.split('.').at(-1) || owner },
    firstSeenSequence: sequence,
    lastSeenSequence: sequence,
    category: value.category ?? 'value',
  }
}

function writeKind(event: TraceWorkerEvent, value: TraceWorkerVariableValue): TraceWriteKind {
  if (value.operation === 'parameter') return 'parameter'
  if (value.operation === 'mutation') return 'mutation'
  const kinds = event.statementKinds ?? []
  if (kinds.includes('augmented-assignment')) return 'augmented-assignment'
  if (kinds.includes('loop-target')) return 'loop-target'
  if (kinds.includes('named-expression')) return 'walrus'
  if (kinds.includes('with-binding')) return 'with-target'
  if (kinds.includes('exception-binding')) return 'except-target'
  if (kinds.includes('import')) return 'import'
  return 'assignment'
}

function writeMarker(event: TraceWorkerEvent, value: TraceWorkerVariableValue): TraceWriteMarker {
  return {
    variableId: variableIdFor(value),
    callId: callIdFor(value),
    kind: writeKind(event, value),
    changed: value.changed ?? true,
    outcome: 'value',
    value: value.value,
  }
}

function deleteMarker(value: TraceWorkerDeletedValue): TraceWriteMarker {
  return {
    variableId: variableIdFor(value),
    callId: callIdFor(value),
    kind: 'deletion',
    changed: true,
    outcome: 'deleted',
  }
}

function executionKind(event: TraceWorkerEvent): TraceExecutionEvent['kind'] {
  if (event.type === 'function-entry') return 'call-entered'
  if (event.type === 'function-return') return 'call-returned'
  if (event.type === 'function-exception-exit') return 'call-exception-exit'
  if (event.type === 'generator-yield') return 'generator-yielded'
  if (event.type === 'generator-resume') return 'generator-resumed'
  if (event.type === 'exception') return 'exception'
  if (event.type === 'input-completed') return 'input-completed'
  return 'line-completed'
}

function rawSourceId(variable: TraceVariableDefinition): string {
  return variable.scope.kind === 'global'
    ? `global:${variable.name}`
    : `local:${variable.scope.owner}:${variable.name}`
}

function activeBindingKey(
  activationSourceId: string,
  rawSources: ReadonlyMap<string, string>,
): string | null {
  if (activationSourceId.startsWith('global:')) {
    const variableId = rawSources.get(activationSourceId)
    return variableId ? traceBindingKey({ variableId, callId: null }) : null
  }

  const separator = activationSourceId.lastIndexOf('@')
  if (separator < 0) return null
  const variableId = rawSources.get(activationSourceId.slice(0, separator))
  const callId = Number(activationSourceId.slice(separator + 1))
  return variableId && Number.isInteger(callId) ? traceBindingKey({ variableId, callId }) : null
}

/** Normalize one worker batch and delta-compress its full active snapshots. */
export function adaptTraceWorkerBatch(
  session: TraceSession,
  message: TraceWorkerBatchMessage,
  sourcePath: string,
): TraceEventBatch {
  const bindings = new Map(reconstructTraceState(session).bindings)
  const definitions = new Map<string, TraceVariableDefinition>()
  const calls = new Map<number, TraceCallActivation>()
  const rawSources = new Map<string, string>()

  for (const variable of Object.values(session.variables)) rawSources.set(rawSourceId(variable), variable.id)

  const rememberDefinition = (
    value: Pick<TraceWorkerVariableValue, 'scope' | 'function' | 'name' | 'defaultLabel' | 'category'> & { sourceId?: string },
    sequence: number,
  ) => {
    const next = variableDefinition(value, sequence)
    if (value.sourceId) rawSources.set(value.sourceId, next.id)
    const previous = definitions.get(next.id) ?? session.variables[next.id]
    definitions.set(next.id, previous
      ? {
          ...next,
          firstSeenSequence: Math.min(previous.firstSeenSequence, sequence),
          lastSeenSequence: Math.max(previous.lastSeenSequence, sequence),
        }
      : next)
  }

  for (const item of message.catalogue) rememberDefinition(item, item.firstSeenSequence)

  const events = message.events.map((event): TraceExecutionEvent => {
    const bindingDeltaMap = new Map<string, TraceExecutionEvent['bindingDeltas'][number]>()
    const activeKeys = new Set<string>()

    const putDelta = (delta: TraceExecutionEvent['bindingDeltas'][number]) => {
      bindingDeltaMap.set(traceBindingKey(delta), delta)
    }

    for (const value of event.variables ?? []) {
      rememberDefinition(value, event.sequence)
      const binding = { variableId: variableIdFor(value), callId: callIdFor(value) }
      const key = traceBindingKey(binding)
      activeKeys.add(key)
      const previous = bindings.get(key)
      if (previous?.status !== 'value' || !valuesEqual(previous.value, value.value)) {
        const state: TraceBindingState = { status: 'value', value: value.value }
        putDelta({ ...binding, state })
        bindings.set(key, state)
      }
    }

    if (event.activeBindings) {
      for (const activationSourceId of event.activeBindings) {
        const key = activeBindingKey(activationSourceId, rawSources)
        if (!key) continue
        activeKeys.add(key)
        const separator = key.lastIndexOf('@')
        const variableId = key.slice(0, separator)
        const definition = definitions.get(variableId) ?? session.variables[variableId]
        if (definition) definitions.set(variableId, {
          ...definition,
          lastSeenSequence: Math.max(definition.lastSeenSequence, event.sequence),
        })
      }
    }

    const activeCallIds = new Set(event.stack.map(frame => frame.callId))
    for (const [key, state] of bindings) {
      if (state.status === 'out-of-scope' || activeKeys.has(key)) continue
      const separator = key.lastIndexOf('@')
      const encodedCallId = key.slice(separator + 1)
      if (encodedCallId !== 'global' && !activeCallIds.has(Number(encodedCallId))) {
        const variableId = key.slice(0, separator)
        const callId = Number(encodedCallId)
        const call = calls.get(callId) ?? session.calls[callId]
        // A yielded generator is temporarily absent from the executing stack,
        // but its locals remain alive until it returns or exits exceptionally.
        if (call?.suspended) continue
        const nextState: TraceBindingState = { status: 'out-of-scope' }
        putDelta({ variableId, callId, state: nextState })
        bindings.set(key, nextState)
      } else if (event.activeBindings && state.status !== 'deleted') {
        const variableId = key.slice(0, separator)
        const callId = encodedCallId === 'global' ? null : Number(encodedCallId)
        const nextState: TraceBindingState = { status: 'deleted' }
        putDelta({ variableId, callId, state: nextState })
        bindings.set(key, nextState)
      }
    }

    for (const deleted of event.deletes ?? []) {
      rememberDefinition(deleted, event.sequence)
      const binding = {
        variableId: variableIdFor(deleted),
        callId: callIdFor(deleted),
      }
      const state: TraceBindingState = { status: 'deleted' }
      putDelta({ ...binding, state })
      bindings.set(traceBindingKey(binding), state)
    }

    for (const value of event.writes ?? []) rememberDefinition(value, event.sequence)

    event.stack.forEach((frame, index) => {
      const existing = calls.get(frame.callId) ?? session.calls[frame.callId]
      calls.set(frame.callId, {
        ...existing,
        id: frame.callId,
        parentId: index ? event.stack[index - 1].callId : null,
        qualifiedName: frame.qualifiedFunction,
        functionName: frame.function,
        depth: frame.depth,
        startedAtSequence: existing?.startedAtSequence ?? event.sequence,
        endedAtSequence: existing?.endedAtSequence,
        outcome: existing?.outcome,
      })
    })
    if (event.type === 'function-return') {
      const call = calls.get(event.callId) ?? session.calls[event.callId]
      if (call) calls.set(event.callId, { ...call, endedAtSequence: event.sequence, outcome: 'returned' })
    }
    if (event.type === 'function-exception-exit') {
      const call = calls.get(event.callId) ?? session.calls[event.callId]
      if (call) calls.set(event.callId, { ...call, endedAtSequence: event.sequence, outcome: 'exception', suspended: false })
    }
    if (event.type === 'generator-yield') {
      const call = calls.get(event.callId) ?? session.calls[event.callId]
      if (call) calls.set(event.callId, { ...call, suspended: true, lastYieldedAtSequence: event.sequence })
    }
    if (event.type === 'generator-resume') {
      const call = calls.get(event.callId) ?? session.calls[event.callId]
      if (call) calls.set(event.callId, { ...call, suspended: false, lastResumedAtSequence: event.sequence })
    }

    return {
      sequence: event.sequence,
      kind: executionKind(event),
      location: { path: sourcePath, line: event.line },
      callId: event.callId,
      callStack: event.stack.map(frame => frame.callId),
      functionName: event.function,
      loopIteration: event.loopBoundary
        ? { loopId: event.loopBoundary.loopId, iteration: event.loopBoundary.iteration, depth: event.callDepth }
        : undefined,
      bindingDeltas: [...bindingDeltaMap.values()],
      writes: [
        ...(event.writes ?? []).map(value => writeMarker(event, value)),
        ...(event.deletes ?? []).map(deleteMarker),
      ],
      returnValue: event.returnValue,
      exception: event.exception,
      inputValue: event.inputValue,
    }
  })

  return {
    type: 'trace-event-batch',
    sessionId: message.sessionId,
    batchSequence: message.batchSequence,
    variables: [...definitions.values()],
    calls: [...calls.values()],
    events,
  }
}

function batchCountError(session: TraceSession, actual: number): string | null {
  const expected = session.lastBatchSequence + 1
  return actual === expected
    ? null
    : `Trace table received ${expected} of ${actual} recording batches.`
}

function preservesFailure(status: TraceSession['status']): boolean {
  return status === 'error' || status === 'limit-reached'
}

function limitProtocolError(session: TraceSession, message: TraceWorkerLimitReachedMessage): string | null {
  const countError = batchCountError(session, message.batchCount)
  if (countError) return countError
  const configuredLimit = session.retention?.eventLimit ?? message.eventLimit
  if (message.eventLimit !== configuredLimit) {
    return `Trace table limit acknowledgement reported ${message.eventLimit} events; expected ${configuredLimit}.`
  }
  if (message.eventCount !== message.eventLimit || session.events.length !== message.eventCount) {
    return `Trace table retained ${session.events.length} of ${message.eventCount} acknowledged events at its ${message.eventLimit} event limit.`
  }
  if (message.droppedEventCount !== 0) {
    return `Trace table discarded ${message.droppedEventCount} events at its retention limit.`
  }
  const expectedLastSequence = message.eventCount === 0 ? null : message.eventCount - 1
  if (message.lastSequence !== expectedLastSequence) {
    return `Trace table limit acknowledgement ended at sequence ${String(message.lastSequence)}; expected ${String(expectedLastSequence)}.`
  }
  for (let index = 0; index < session.events.length; index += 1) {
    if (session.events[index].sequence !== index) {
      return `Trace table event history has a gap at sequence ${index}.`
    }
  }
  return null
}

/**
 * Validate the final flush and mark execution as deliberately stopped at the
 * retention bound. This is terminal and cannot be overwritten by completion.
 */
export function finalizeTraceWorkerLimitReached(
  session: TraceSession,
  message: TraceWorkerLimitReachedMessage,
  endedAt = Date.now(),
): TraceSession {
  if (message.sessionId !== session.id) return session
  if (preservesFailure(session.status) || session.status === 'stopped') return session
  const protocolError = limitProtocolError(session, message)
  if (protocolError) {
    return {
      ...session,
      status: 'error',
      error: protocolError,
      truncated: true,
      endedAt,
      retention: {
        eventLimit: session.retention?.eventLimit ?? message.eventLimit,
        retainedEventCount: session.events.length,
        droppedEventCount: message.droppedEventCount,
        limitReached: true,
      },
    }
  }
  return {
    ...session,
    status: 'limit-reached',
    error: `Trace event limit of ${message.eventLimit.toLocaleString()} reached; execution stopped with all recorded history retained.`,
    truncated: false,
    endedAt,
    retention: {
      eventLimit: message.eventLimit,
      retainedEventCount: message.eventCount,
      droppedEventCount: 0,
      limitReached: true,
    },
  }
}

/** Apply a terminal worker message without allowing success to erase data loss. */
export function finalizeTraceWorkerEnd(
  session: TraceSession,
  message: TraceWorkerEndMessage,
  endedAt = Date.now(),
): TraceSession {
  if (message.sessionId !== session.id) return session
  const countError = batchCountError(session, message.batchCount)
  if (countError) return { ...session, status: 'error', error: countError, truncated: true, endedAt }
  if (preservesFailure(session.status) || session.status === 'stopped') return session
  if (message.status === 'error') {
    return {
      ...session,
      status: 'error',
      error: message.error ?? 'Trace table recording failed.',
      truncated: message.traceDataIncomplete ? true : session.truncated,
      endedAt,
    }
  }
  if (message.status === 'stopped') return { ...session, status: 'stopped', error: undefined, endedAt }
  return { ...session, status: 'completed', error: undefined, endedAt }
}

/** Validate the final flush before marking a cooperatively stopped trace. */
export function finalizeTraceWorkerStop(
  session: TraceSession,
  message: TraceWorkerStopAckMessage,
  endedAt = Date.now(),
): TraceSession {
  if (message.sessionId !== session.id) return session
  const countError = batchCountError(session, message.batchCount)
  if (countError) return { ...session, status: 'error', error: countError, truncated: true, endedAt }
  if (preservesFailure(session.status)) return session
  return { ...session, status: 'stopped', error: undefined, endedAt }
}

/** Used by non-protocol fallbacks; completion may not erase a prior failure. */
export function finishTraceSessionSafely(
  session: TraceSession,
  status: TraceSession['status'],
  error?: string,
  endedAt = Date.now(),
): TraceSession {
  if (status === 'completed' && (preservesFailure(session.status) || session.status === 'stopped')) return session
  if (status === 'stopped' && preservesFailure(session.status)) return session
  return { ...session, status, error, endedAt }
}
