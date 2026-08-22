import { describe, expect, it } from 'vitest'
import type {
  TraceWorkerBatchMessage, TraceWorkerEvent, TraceWorkerVariableValue,
} from '../types/traceTable'
import { createTraceSession, mergeTraceBatch, reconstructTraceState, traceBindingKey } from './traceLog'
import {
  adaptTraceWorkerBatch, finalizeTraceWorkerEnd, finalizeTraceWorkerLimitReached, finalizeTraceWorkerStop, finishTraceSessionSafely,
} from './traceWorkerAdapter'

const primitive = (value: number) => ({ kind: 'primitive' as const, type: 'int', value, summary: String(value) })

function value(
  name: string,
  number: number,
  options: Partial<TraceWorkerVariableValue> = {},
): TraceWorkerVariableValue {
  const scope = options.scope ?? 'global'
  const owner = options.function ?? (scope === 'global' ? '<module>' : 'factorial')
  const callId = scope === 'global' ? null : (options.callId ?? 2)
  return {
    sourceId: scope === 'global' ? `global:${name}` : `local:${owner}:${name}`,
    activationSourceId: scope === 'global' ? `global:${name}` : `local:${owner}:${name}@${callId}`,
    name,
    scope,
    function: owner,
    callId,
    defaultLabel: scope === 'global' ? name : `${owner}.${name}`,
    value: primitive(number),
    ...options,
  }
}

function event(sequence: number, overrides: Partial<TraceWorkerEvent> = {}): TraceWorkerEvent {
  return {
    sequence,
    type: 'statement',
    line: sequence,
    function: '<module>',
    qualifiedFunction: '<module>',
    callId: 1,
    callDepth: 0,
    stack: [{ callId: 1, function: '<module>', qualifiedFunction: '<module>', depth: 0 }],
    variables: [],
    activeBindings: [],
    writes: [],
    deletes: [],
    ...overrides,
  }
}

function message(batchSequence: number, events: TraceWorkerEvent[]): TraceWorkerBatchMessage {
  return {
    type: 'trace-table-batch',
    protocolVersion: 1,
    sessionId: 'trace-1',
    batchSequence,
    catalogue: [],
    events,
  }
}

describe('adaptTraceWorkerBatch', () => {
  it('retains complete output lines on their source event', () => {
    const normalized = adaptTraceWorkerBatch(
      createTraceSession({ id: 'trace-1', source: { path: 'main.py' } }),
      message(0, [event(0, { line: 4, output: ['first', 'second'] })]),
      'main.py',
    )

    expect(normalized.events[0]).toMatchObject({
      location: { line: 4 },
      output: ['first', 'second'],
    })
  })

  it('retains same-value writes while delta-compressing snapshots', () => {
    let session = createTraceSession({ id: 'trace-1', source: { path: 'main.py' } })
    const first = value('x', 1, { operation: 'write', changed: true })
    const repeated = value('x', 1, { operation: 'write', changed: false })
    const normalized = adaptTraceWorkerBatch(session, message(0, [
      event(0, { line: 2, variables: [first], writes: [first], statementKinds: ['assignment'] }),
      event(1, { line: 3, variables: [repeated], writes: [repeated], statementKinds: ['assignment'] }),
    ]), 'main.py')
    session = mergeTraceBatch(session, normalized)

    expect(session.events[0].bindingDeltas).toHaveLength(1)
    expect(session.events[1].bindingDeltas).toHaveLength(0)
    expect(session.events[1].writes).toEqual([
      expect.objectContaining({ kind: 'assignment', changed: false, outcome: 'value', value: primitive(1) }),
    ])
  })

  it('retains the immediate value of each write when one event writes a binding repeatedly', () => {
    const first = value('x', 1, { operation: 'write', changed: true })
    const second = value('x', 2, { operation: 'write', changed: true })
    const normalized = adaptTraceWorkerBatch(
      createTraceSession({ id: 'trace-1', source: { path: 'main.py' } }),
      message(0, [event(1, { variables: [second], writes: [first, second] })]),
      'main.py',
    )

    expect(normalized.events[0].bindingDeltas).toEqual([
      expect.objectContaining({ state: { status: 'value', value: primitive(2) } }),
    ])
    expect(normalized.events[0].writes.map(write => write.value)).toEqual([primitive(1), primitive(2)])
  })

  it('creates recursive call metadata and marks returned bindings out of scope', () => {
    let session = createTraceSession({ id: 'trace-1', source: { path: 'main.py' } })
    const local = value('n', 3, { scope: 'local', function: 'factorial', callId: 2, operation: 'parameter' })
    const recursiveStack = [
      { callId: 1, function: '<module>', qualifiedFunction: '<module>', depth: 0 },
      { callId: 2, function: 'factorial', qualifiedFunction: 'factorial', depth: 1 },
    ]
    session = mergeTraceBatch(session, adaptTraceWorkerBatch(session, message(0, [
      event(0, {
        type: 'function-entry', function: 'factorial', qualifiedFunction: 'factorial', callId: 2, callDepth: 1,
        stack: recursiveStack, variables: [local], writes: [local],
      }),
      event(1, {
        type: 'function-return', function: 'factorial', qualifiedFunction: 'factorial', callId: 2, callDepth: 1,
        stack: recursiveStack, variables: [local], returnValue: primitive(6),
      }),
      event(2, { line: 8, variables: [] }),
    ]), 'main.py'))

    expect(session.calls[2]).toMatchObject({ parentId: 1, depth: 1, endedAtSequence: 1, outcome: 'returned' })
    const localId = Object.keys(session.variables).find(id => id.startsWith('local:factorial:'))!
    expect(reconstructTraceState(session).bindings.get(traceBindingKey({ variableId: localId, callId: 2 }))).toEqual({
      status: 'out-of-scope',
    })
  })

  it('normalizes deletion as both intent and state', () => {
    let session = createTraceSession({ id: 'trace-1', source: { path: 'main.py' } })
    const x = value('x', 1)
    session = mergeTraceBatch(session, adaptTraceWorkerBatch(session, message(0, [
      event(0, { variables: [x], writes: [{ ...x, operation: 'write', changed: true }] }),
      event(1, {
        variables: [],
        deletes: [{ ...x, value: undefined, operation: 'delete' } as never],
        statementKinds: ['delete'],
      }),
    ]), 'main.py'))

    const id = Object.keys(session.variables)[0]
    expect(session.events[1].writes).toEqual([expect.objectContaining({ kind: 'deletion', outcome: 'deleted' })])
    expect(reconstructTraceState(session).bindings.get(traceBindingKey({ variableId: id, callId: null }))).toEqual({
      status: 'deleted',
    })
  })

  it('consumes worker-side deltas without deleting unchanged active bindings', () => {
    const x = value('x', 1)
    let session = createTraceSession({ id: 'trace-1', source: { path: 'main.py' } })
    session = mergeTraceBatch(session, adaptTraceWorkerBatch(session, message(0, [
      event(0, { variables: [x], activeBindings: ['global:x'] }),
    ]), 'main.py'))
    session = mergeTraceBatch(session, adaptTraceWorkerBatch(session, message(1, [
      event(1, { variables: [], activeBindings: ['global:x'] }),
    ]), 'main.py'))

    expect(session.events[1].bindingDeltas).toEqual([])
    const id = Object.keys(session.variables)[0]
    expect(reconstructTraceState(session).bindings.get(traceBindingKey({ variableId: id, callId: null }))).toEqual({
      status: 'value', value: primitive(1),
    })
  })

  it('marks a disappeared active-frame binding deleted instead of retaining a stale value', () => {
    const x = value('x', 1)
    let session = createTraceSession({ id: 'trace-1', source: { path: 'main.py' } })
    session = mergeTraceBatch(session, adaptTraceWorkerBatch(session, message(0, [
      event(0, { variables: [x], activeBindings: ['global:x'] }),
      event(1, { variables: [], activeBindings: [] }),
    ]), 'main.py'))

    const id = Object.keys(session.variables)[0]
    expect(session.events[1].bindingDeltas).toHaveLength(1)
    expect(reconstructTraceState(session).bindings.get(traceBindingKey({ variableId: id, callId: null }))).toEqual({
      status: 'deleted',
    })
  })

  it('uses the catalogue discovery sequence rather than the first sequence in a batch', () => {
    const x = value('x', 1)
    const raw = message(0, [event(1), event(5, { variables: [x], activeBindings: ['global:x'] })])
    raw.catalogue = [{
      sourceId: x.sourceId,
      activationSourceId: x.activationSourceId,
      name: x.name,
      scope: x.scope,
      function: x.function,
      callId: x.callId,
      defaultLabel: x.defaultLabel,
      firstSeenSequence: 5,
    }]

    const normalized = adaptTraceWorkerBatch(
      createTraceSession({ id: 'trace-1', source: { path: 'main.py' } }), raw, 'main.py',
    )
    expect(normalized.variables?.[0].firstSeenSequence).toBe(5)
  })

  it('normalizes imports as import writes', () => {
    const imported = value('sqrt', 1, { operation: 'write' })
    const normalized = adaptTraceWorkerBatch(
      createTraceSession({ id: 'trace-1', source: { path: 'main.py' } }),
      message(0, [event(1, { writes: [imported], statementKinds: ['import'] })]),
      'main.py',
    )

    expect(normalized.events[0].writes[0].kind).toBe('import')
  })

  it('preserves input completion as its own execution boundary', () => {
    const normalized = adaptTraceWorkerBatch(
      createTraceSession({ id: 'trace-1', source: { path: 'main.py' } }),
      message(0, [event(1, { type: 'input-completed', inputValue: 'Ada' })]),
      'main.py',
    )

    expect(normalized.events[0]).toMatchObject({ kind: 'input-completed', inputValue: 'Ada' })
  })

  it('tracks exception exits and generator suspension without ending a call on yield', () => {
    const local = value('n', 3, { scope: 'local', function: 'numbers', callId: 2 })
    const childStack = [
      { callId: 1, function: '<module>', qualifiedFunction: '<module>', depth: 0 },
      { callId: 2, function: 'numbers', qualifiedFunction: 'numbers', depth: 1 },
    ]
    let session = createTraceSession({ id: 'trace-1', source: { path: 'main.py' } })
    session = mergeTraceBatch(session, adaptTraceWorkerBatch(session, message(0, [
      event(0, { type: 'function-entry', callId: 2, function: 'numbers', qualifiedFunction: 'numbers', stack: childStack, variables: [local], activeBindings: [local.activationSourceId] }),
      event(1, { type: 'generator-yield', callId: 2, function: 'numbers', qualifiedFunction: 'numbers', stack: childStack, variables: [], activeBindings: [local.activationSourceId] }),
      event(2, { variables: [], activeBindings: [] }),
      event(3, { type: 'generator-resume', callId: 2, function: 'numbers', qualifiedFunction: 'numbers', stack: childStack, variables: [], activeBindings: [local.activationSourceId] }),
      event(4, { type: 'function-exception-exit', callId: 2, function: 'numbers', qualifiedFunction: 'numbers', stack: childStack, variables: [], activeBindings: [local.activationSourceId] }),
    ]), 'main.py'))

    expect(session.events.map(item => item.kind)).toContain('generator-yielded')
    expect(session.events.map(item => item.kind)).toContain('generator-resumed')
    expect(session.calls[2]).toMatchObject({
      startedAtSequence: 0,
      endedAtSequence: 4,
      outcome: 'exception',
      suspended: false,
      lastYieldedAtSequence: 1,
      lastResumedAtSequence: 3,
    })
    const id = Object.keys(session.variables).find(item => item.startsWith('local:'))!
    expect(reconstructTraceState(session, 3).bindings.get(traceBindingKey({ variableId: id, callId: 2 }))).toEqual({
      status: 'value', value: primitive(3),
    })
  })
})

describe('trace worker completion', () => {
  const recordedSession = () => mergeTraceBatch(
    createTraceSession({ id: 'trace-1', source: { path: 'main.py' } }),
    adaptTraceWorkerBatch(
      createTraceSession({ id: 'trace-1', source: { path: 'main.py' } }),
      message(0, [event(0)]),
      'main.py',
    ),
  )

  it('rejects an end acknowledgement whose batch count reveals data loss', () => {
    const result = finalizeTraceWorkerEnd(recordedSession(), {
      type: 'trace-table-end', sessionId: 'trace-1', status: 'done', batchCount: 2,
    }, 100)
    expect(result).toMatchObject({ status: 'error', truncated: true, endedAt: 100 })
    expect(result.error).toContain('received 1 of 2')
  })

  it('marks recorder transport failure as incomplete without truncating a fully captured runtime error', () => {
    const transportFailure = finalizeTraceWorkerEnd(recordedSession(), {
      type: 'trace-table-end', sessionId: 'trace-1', status: 'error', batchCount: 1,
      error: 'Trace table transport failed.', traceDataIncomplete: true,
    }, 100)
    const runtimeFailure = finalizeTraceWorkerEnd(recordedSession(), {
      type: 'trace-table-end', sessionId: 'trace-1', status: 'error', batchCount: 1,
      error: 'ValueError: bad input', traceDataIncomplete: false,
    }, 100)

    expect(transportFailure).toMatchObject({ status: 'error', truncated: true, error: 'Trace table transport failed.' })
    expect(runtimeFailure).toMatchObject({ status: 'error', truncated: false, error: 'ValueError: bad input' })
  })

  it('does not allow normal completion to erase a prior recorder error', () => {
    const failed = finishTraceSessionSafely(recordedSession(), 'error', 'bad batch', 50)
    const result = finalizeTraceWorkerEnd(failed, {
      type: 'trace-table-end', sessionId: 'trace-1', status: 'done', batchCount: 1,
    }, 100)

    expect(result).toBe(failed)
    expect(result).toMatchObject({ status: 'error', error: 'bad batch', endedAt: 50 })
    expect(finishTraceSessionSafely(result, 'completed', undefined, 150)).toBe(result)
  })

  it('marks a stop only after all flushed batches are acknowledged', () => {
    const complete = finalizeTraceWorkerStop(recordedSession(), {
      type: 'trace-table-stop-ack', sessionId: 'trace-1', batchCount: 1,
    }, 100)
    const incomplete = finalizeTraceWorkerStop(recordedSession(), {
      type: 'trace-table-stop-ack', sessionId: 'trace-1', batchCount: 2,
    }, 100)

    expect(complete).toMatchObject({ status: 'stopped', endedAt: 100, truncated: false })
    expect(incomplete).toMatchObject({ status: 'error', endedAt: 100, truncated: true })
  })

  it('marks an exactly retained contiguous prefix as limit-reached without truncation', () => {
    let session = createTraceSession({ id: 'trace-1', source: { path: 'main.py' }, eventLimit: 3 })
    session = mergeTraceBatch(session, adaptTraceWorkerBatch(session, message(0, [event(0), event(1)]), 'main.py'))
    session = mergeTraceBatch(session, adaptTraceWorkerBatch(session, message(1, [event(2)]), 'main.py'))

    const result = finalizeTraceWorkerLimitReached(session, {
      type: 'trace-table-limit-reached',
      sessionId: 'trace-1',
      batchCount: 2,
      eventCount: 3,
      eventLimit: 3,
      lastSequence: 2,
      droppedEventCount: 0,
    }, 100)

    expect(result).toMatchObject({
      status: 'limit-reached',
      truncated: false,
      endedAt: 100,
      retention: { eventLimit: 3, retainedEventCount: 3, droppedEventCount: 0, limitReached: true },
    })
    expect(result.error).toContain('execution stopped with all recorded history retained')
    expect(finalizeTraceWorkerEnd(result, {
      type: 'trace-table-end', sessionId: 'trace-1', status: 'done', batchCount: 2,
    }, 200)).toBe(result)
    expect(finalizeTraceWorkerLimitReached(result, {
      type: 'trace-table-limit-reached', sessionId: 'trace-1', batchCount: 999,
      eventCount: 3, eventLimit: 3, lastSequence: 2, droppedEventCount: 0,
    }, 300)).toBe(result)
  })

  it('rejects a limit acknowledgement with a missing batch or event gap', () => {
    let session = createTraceSession({ id: 'trace-1', source: { path: 'main.py' }, eventLimit: 3 })
    session = mergeTraceBatch(session, adaptTraceWorkerBatch(session, message(0, [event(0), event(1), event(2)]), 'main.py'))
    const acknowledgement = {
      type: 'trace-table-limit-reached' as const,
      sessionId: 'trace-1',
      batchCount: 1,
      eventCount: 3,
      eventLimit: 3,
      lastSequence: 2,
      droppedEventCount: 0 as const,
    }

    const corrupted = {
      ...session,
      events: session.events.map((item, index) => index === 1 ? { ...item, sequence: 2 } : item),
    }
    const gap = finalizeTraceWorkerLimitReached(corrupted, acknowledgement, 100)
    const missingBatch = finalizeTraceWorkerLimitReached(session, { ...acknowledgement, batchCount: 2 }, 100)

    expect(gap).toMatchObject({ status: 'error', truncated: true, retention: { limitReached: true } })
    expect(gap.error).toContain('gap at sequence 1')
    expect(missingBatch).toMatchObject({ status: 'error', truncated: true })
    expect(missingBatch.error).toContain('received 1 of 2')
  })
})
