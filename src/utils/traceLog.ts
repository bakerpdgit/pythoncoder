import type { InspectorNode } from '../types'
import type {
  ReconstructedTraceState,
  TraceBinding,
  TraceBindingDelta,
  TraceBindingState,
  TraceCallActivation,
  TraceCheckpoint,
  TraceEventBatch,
  TraceExecutionEvent,
  TraceLogMessage,
  TraceSession,
  TraceSessionInit,
  TraceVariableDefinition,
  TraceVariableId,
} from '../types/traceTable'

const BINDING_SEPARATOR = '@'

function encodeIdPart(value: string): string {
  return encodeURIComponent(value)
}

export function globalTraceVariableId(name: string): TraceVariableId {
  return `global:${encodeIdPart(name)}`
}

export function localTraceVariableId(owner: string, name: string): TraceVariableId {
  return `local:${encodeIdPart(owner)}:${encodeIdPart(name)}`
}

export function traceBindingKey(binding: TraceBinding): string {
  return `${binding.variableId}${BINDING_SEPARATOR}${binding.callId ?? 'global'}`
}

function cloneInspectorNode(node: InspectorNode): InspectorNode {
  return {
    ...node,
    items: node.items?.map(item => ({ label: item.label, value: cloneInspectorNode(item.value) })),
    entries: node.entries?.map(entry => ({ label: entry.label, value: cloneInspectorNode(entry.value) })),
    attrs: node.attrs?.map(attr => ({ label: attr.label, value: cloneInspectorNode(attr.value) })),
  }
}

function cloneBindingState(state: TraceBindingState): TraceBindingState {
  return state.status === 'value'
    ? { status: 'value', value: cloneInspectorNode(state.value) }
    : { ...state }
}

function cloneBindingDelta(delta: TraceBindingDelta): TraceBindingDelta {
  return { variableId: delta.variableId, callId: delta.callId, state: cloneBindingState(delta.state) }
}

function cloneVariable(variable: TraceVariableDefinition): TraceVariableDefinition {
  return {
    ...variable,
    scope: { ...variable.scope },
  }
}

function cloneCall(call: TraceCallActivation): TraceCallActivation {
  return { ...call }
}

function cloneEvent(event: TraceExecutionEvent): TraceExecutionEvent {
  return {
    ...event,
    location: { ...event.location },
    callStack: [...event.callStack],
    loopIteration: event.loopIteration ? { ...event.loopIteration } : undefined,
    bindingDeltas: event.bindingDeltas.map(cloneBindingDelta),
    writes: event.writes.map(write => ({ ...write, path: write.path ? [...write.path] : undefined })),
    returnValue: event.returnValue ? cloneInspectorNode(event.returnValue) : undefined,
    exception: event.exception ? { ...event.exception } : undefined,
  }
}

function cloneCheckpoint(checkpoint: TraceCheckpoint): TraceCheckpoint {
  return { ...checkpoint, bindings: checkpoint.bindings.map(cloneBindingDelta) }
}

export function createTraceSession(init: TraceSessionInit): TraceSession {
  return {
    id: init.id,
    source: { ...init.source },
    startedAt: init.startedAt ?? Date.now(),
    status: 'recording',
    truncated: false,
    variables: {},
    calls: {},
    events: [],
    checkpoints: [],
    lastBatchSequence: -1,
  }
}

export function resetTraceSession(init: TraceSessionInit): TraceSession {
  return createTraceSession(init)
}

function validateBatch(session: TraceSession, batch: TraceEventBatch): void {
  if (batch.sessionId !== session.id) {
    throw new Error(`Trace batch belongs to session ${batch.sessionId}, expected ${session.id}`)
  }

  const expectedBatch = session.lastBatchSequence + 1
  if (batch.batchSequence > expectedBatch) {
    throw new Error(`Missing trace batch ${expectedBatch}; received ${batch.batchSequence}`)
  }

  let previousSequence = session.events.at(-1)?.sequence ?? -1
  for (const event of batch.events) {
    if (event.sequence <= previousSequence) {
      throw new Error(`Trace event sequence ${event.sequence} is not strictly increasing`)
    }
    previousSequence = event.sequence

    const deltaKeys = new Set<string>()
    for (const delta of event.bindingDeltas) {
      const key = traceBindingKey(delta)
      if (deltaKeys.has(key)) throw new Error(`Duplicate binding delta ${key} in event ${event.sequence}`)
      deltaKeys.add(key)
    }
  }
}

/**
 * Immutably merges a worker batch. Replayed batches are ignored, while gaps are
 * rejected so the UI never presents a silently incomplete trace.
 */
export function mergeTraceBatch(session: TraceSession, batch: TraceEventBatch): TraceSession {
  if (batch.sessionId === session.id && batch.batchSequence <= session.lastBatchSequence) return session
  validateBatch(session, batch)

  const variables = { ...session.variables }
  for (const variable of batch.variables ?? []) {
    const existing = variables[variable.id]
    variables[variable.id] = existing
      ? cloneVariable({
          ...existing,
          ...variable,
          firstSeenSequence: Math.min(existing.firstSeenSequence, variable.firstSeenSequence),
          lastSeenSequence: Math.max(existing.lastSeenSequence, variable.lastSeenSequence),
        })
      : cloneVariable(variable)
  }

  const calls = { ...session.calls }
  for (const call of batch.calls ?? []) calls[call.id] = cloneCall({ ...calls[call.id], ...call })

  const events = [...session.events, ...batch.events.map(cloneEvent)]
  const checkpoints = [...session.checkpoints, ...(batch.checkpoints ?? []).map(cloneCheckpoint)]
    .sort((a, b) => a.eventCount - b.eventCount)

  return {
    ...session,
    variables,
    calls,
    events,
    checkpoints,
    lastBatchSequence: batch.batchSequence,
    ...(batch.status
      ? {
          status: batch.status.status,
          endedAt: batch.status.endedAt,
          error: batch.status.error,
          truncated: batch.status.truncated ?? session.truncated,
        }
      : {}),
  }
}

export function reduceTraceLog(session: TraceSession | null, message: TraceLogMessage): TraceSession {
  if (message.type === 'trace-session-reset') return resetTraceSession(message.session)
  if (!session) throw new Error('Received a trace batch before a trace-session-reset')
  return mergeTraceBatch(session, message)
}

function applyDeltas(bindings: Map<string, TraceBindingState>, deltas: TraceBindingDelta[]): void {
  for (const delta of deltas) bindings.set(traceBindingKey(delta), cloneBindingState(delta.state))
}

function targetEventCount(session: TraceSession, throughSequence?: number): number {
  if (throughSequence === undefined) return session.events.length
  let low = 0
  let high = session.events.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (session.events[middle].sequence <= throughSequence) low = middle + 1
    else high = middle
  }
  return low
}

/** Reconstructs captured bindings after the requested execution sequence. */
export function reconstructTraceState(session: TraceSession, throughSequence?: number): ReconstructedTraceState {
  const eventCount = targetEventCount(session, throughSequence)
  return reconstructTraceStateAtEventCount(session, eventCount)
}

function reconstructTraceStateAtEventCount(session: TraceSession, eventCount: number): ReconstructedTraceState {
  let checkpoint: TraceCheckpoint | undefined
  for (const candidate of session.checkpoints) {
    if (candidate.eventCount > eventCount) break
    if (!checkpoint || candidate.eventCount >= checkpoint.eventCount) checkpoint = candidate
  }

  const bindings = new Map<string, TraceBindingState>()
  if (checkpoint) applyDeltas(bindings, checkpoint.bindings)
  for (let index = checkpoint?.eventCount ?? 0; index < eventCount; index += 1) {
    applyDeltas(bindings, session.events[index].bindingDeltas)
  }

  return {
    eventCount,
    throughSequence: eventCount ? session.events[eventCount - 1].sequence : null,
    bindings,
  }
}

/** Creates a transport-safe checkpoint after the requested number of events. */
export function createTraceCheckpoint(session: TraceSession, eventCount = session.events.length): TraceCheckpoint {
  if (!Number.isInteger(eventCount) || eventCount < 0 || eventCount > session.events.length) {
    throw new RangeError(`eventCount must be between 0 and ${session.events.length}`)
  }

  const reconstructed = reconstructTraceStateAtEventCount(session, eventCount)
  const bindings: TraceBindingDelta[] = []
  for (const [key, state] of reconstructed.bindings) {
    const separatorIndex = key.lastIndexOf(BINDING_SEPARATOR)
    const variableId = key.slice(0, separatorIndex)
    const encodedCallId = key.slice(separatorIndex + 1)
    bindings.push({
      variableId,
      callId: encodedCallId === 'global' ? null : Number(encodedCallId),
      state: cloneBindingState(state),
    })
  }

  return { eventCount, throughSequence: reconstructed.throughSequence, bindings }
}

export function appendTraceCheckpoint(session: TraceSession, eventCount = session.events.length): TraceSession {
  const checkpoint = createTraceCheckpoint(session, eventCount)
  const checkpoints = session.checkpoints
    .filter(existing => existing.eventCount !== checkpoint.eventCount)
    .concat(checkpoint)
    .sort((a, b) => a.eventCount - b.eventCount)
  return { ...session, checkpoints }
}
