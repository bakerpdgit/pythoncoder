import { describe, expect, it } from 'vitest'
import type {
  TraceWorkerBatchMessage, TraceWorkerEvent, TraceWorkerVariableValue,
} from '../types/traceTable'
import { createTraceSession, mergeTraceBatch, reconstructTraceState, traceBindingKey } from './traceLog'
import {
  adaptTraceWorkerBatch, finalizeTraceWorkerEnd, finalizeTraceWorkerStop, finishTraceSessionSafely,
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
  it('retains same-value writes while delta-compressing snapshots', () => {
    let session = createTraceSession({ id: 'trace-1', source: { path: 'main.py' } })
    const first = value('x', 1, { operation: 'write', changed: true })
    const repeated = value('x', 1, { operation: 'write', changed: false })
    const normalized = adaptTraceWorkerBatch(session, message(0, [
      event(1, { line: 2, variables: [first], writes: [first], statementKinds: ['assignment'] }),
      event(2, { line: 3, variables: [repeated], writes: [repeated], statementKinds: ['assignment'] }),
    ]), 'main.py')
    session = mergeTraceBatch(session, normalized)

    expect(session.events[0].bindingDeltas).toHaveLength(1)
    expect(session.events[1].bindingDeltas).toHaveLength(0)
    expect(session.events[1].writes).toEqual([
      expect.objectContaining({ kind: 'assignment', changed: false, outcome: 'value' }),
    ])
  })

  it('creates recursive call metadata and marks returned bindings out of scope', () => {
    let session = createTraceSession({ id: 'trace-1', source: { path: 'main.py' } })
    const local = value('n', 3, { scope: 'local', function: 'factorial', callId: 2, operation: 'parameter' })
    const recursiveStack = [
      { callId: 1, function: '<module>', qualifiedFunction: '<module>', depth: 0 },
      { callId: 2, function: 'factorial', qualifiedFunction: 'factorial', depth: 1 },
    ]
    session = mergeTraceBatch(session, adaptTraceWorkerBatch(session, message(0, [
      event(1, {
        type: 'function-entry', function: 'factorial', qualifiedFunction: 'factorial', callId: 2, callDepth: 1,
        stack: recursiveStack, variables: [local], writes: [local],
      }),
      event(2, {
        type: 'function-return', function: 'factorial', qualifiedFunction: 'factorial', callId: 2, callDepth: 1,
        stack: recursiveStack, variables: [local], returnValue: primitive(6),
      }),
      event(3, { line: 8, variables: [] }),
    ]), 'main.py'))

    expect(session.calls[2]).toMatchObject({ parentId: 1, depth: 1, endedAtSequence: 2, outcome: 'returned' })
    const localId = Object.keys(session.variables).find(id => id.startsWith('local:factorial:'))!
    expect(reconstructTraceState(session).bindings.get(traceBindingKey({ variableId: localId, callId: 2 }))).toEqual({
      status: 'out-of-scope',
    })
  })

  it('normalizes deletion as both intent and state', () => {
    let session = createTraceSession({ id: 'trace-1', source: { path: 'main.py' } })
    const x = value('x', 1)
    session = mergeTraceBatch(session, adaptTraceWorkerBatch(session, message(0, [
      event(1, { variables: [x], writes: [{ ...x, operation: 'write', changed: true }] }),
      event(2, {
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
      event(1, { variables: [x], activeBindings: ['global:x'] }),
    ]), 'main.py'))
    session = mergeTraceBatch(session, adaptTraceWorkerBatch(session, message(1, [
      event(2, { variables: [], activeBindings: ['global:x'] }),
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
      event(1, { variables: [x], activeBindings: ['global:x'] }),
      event(2, { variables: [], activeBindings: [] }),
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
      event(1, { type: 'function-entry', callId: 2, function: 'numbers', qualifiedFunction: 'numbers', stack: childStack, variables: [local], activeBindings: [local.activationSourceId] }),
      event(2, { type: 'generator-yield', callId: 2, function: 'numbers', qualifiedFunction: 'numbers', stack: childStack, variables: [], activeBindings: [local.activationSourceId] }),
      event(3, { variables: [], activeBindings: [] }),
      event(4, { type: 'generator-resume', callId: 2, function: 'numbers', qualifiedFunction: 'numbers', stack: childStack, variables: [], activeBindings: [local.activationSourceId] }),
      event(5, { type: 'function-exception-exit', callId: 2, function: 'numbers', qualifiedFunction: 'numbers', stack: childStack, variables: [], activeBindings: [local.activationSourceId] }),
    ]), 'main.py'))

    expect(session.events.map(item => item.kind)).toContain('generator-yielded')
    expect(session.events.map(item => item.kind)).toContain('generator-resumed')
    expect(session.calls[2]).toMatchObject({
      startedAtSequence: 1,
      endedAtSequence: 5,
      outcome: 'exception',
      suspended: false,
      lastYieldedAtSequence: 2,
      lastResumedAtSequence: 4,
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
      message(0, [event(1)]),
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
})
