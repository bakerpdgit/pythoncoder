import { describe, expect, it } from 'vitest'
import type {
  TraceBindingDelta,
  TraceCallActivation,
  TraceEventBatch,
  TraceExecutionEvent,
  TraceVariableDefinition,
  TraceWriteMarker,
} from '../types/traceTable'
import {
  appendTraceCheckpoint,
  createTraceSession,
  globalTraceVariableId,
  localTraceVariableId,
  mergeTraceBatch,
  reconstructTraceState,
  reduceTraceLog,
  traceBindingKey,
} from './traceLog'

const primitive = (value: string | number) => ({ kind: 'primitive' as const, type: typeof value, value })

function event(
  sequence: number,
  bindingDeltas: TraceBindingDelta[] = [],
  writes: TraceWriteMarker[] = [],
  callId = 1,
): TraceExecutionEvent {
  return {
    sequence,
    kind: 'line-completed',
    location: { path: 'main.py', line: sequence + 1 },
    callId,
    callStack: [1, ...(callId === 1 ? [] : [callId])],
    functionName: callId === 1 ? '<module>' : 'factorial',
    bindingDeltas,
    writes,
  }
}

function batch(batchSequence: number, events: TraceExecutionEvent[], extras: Partial<TraceEventBatch> = {}): TraceEventBatch {
  return { type: 'trace-event-batch', sessionId: 'session-1', batchSequence, events, ...extras }
}

describe('trace variable identities', () => {
  it('separates globals, qualified locals, and recursive call bindings', () => {
    const global = globalTraceVariableId('x')
    const local = localTraceVariableId('factorial', 'x')

    expect(global).not.toBe(local)
    expect(traceBindingKey({ variableId: local, callId: 2 })).not.toBe(
      traceBindingKey({ variableId: local, callId: 3 }),
    )
  })
})

describe('mergeTraceBatch', () => {
  it('keeps explicit same-value writes even when there is no value delta', () => {
    const variableId = globalTraceVariableId('x')
    let session = createTraceSession({ id: 'session-1', source: { path: 'main.py' }, startedAt: 10 })
    session = mergeTraceBatch(session, batch(0, [
      event(0, [{ variableId, callId: null, state: { status: 'value', value: primitive(1) } }], [
        { variableId, callId: null, kind: 'assignment', changed: true, outcome: 'value' },
      ]),
      event(1, [], [
        { variableId, callId: null, kind: 'assignment', changed: false, outcome: 'value' },
      ]),
    ]))

    expect(session.events[1].bindingDeltas).toEqual([])
    expect(session.events[1].writes).toEqual([
      expect.objectContaining({ variableId, changed: false, kind: 'assignment' }),
    ])
    expect(reconstructTraceState(session).bindings.get(traceBindingKey({ variableId, callId: null }))).toEqual({
      status: 'value',
      value: primitive(1),
    })
  })

  it('preserves delete and mutation intent independently of state changes', () => {
    const variableId = globalTraceVariableId('items')
    const writes: TraceWriteMarker[] = [
      { variableId, callId: null, kind: 'mutation', changed: false, outcome: 'value', path: ['[0]'] },
      { variableId, callId: null, kind: 'deletion', changed: true, outcome: 'deleted' },
    ]
    const session = mergeTraceBatch(
      createTraceSession({ id: 'session-1', source: { path: 'main.py' } }),
      batch(0, [event(0, [{ variableId, callId: null, state: { status: 'deleted' } }], writes)]),
    )

    expect(session.events[0].writes).toEqual(writes)
    expect(reconstructTraceState(session).bindings.get(traceBindingKey({ variableId, callId: null }))).toEqual({
      status: 'deleted',
    })
  })

  it('copies mutable serialized values at the worker/UI boundary', () => {
    const variableId = globalTraceVariableId('items')
    const node = {
      kind: 'sequence' as const,
      type: 'list',
      items: [{ label: '0', value: primitive(1) }],
    }
    const sourceEvent = event(0, [{ variableId, callId: null, state: { status: 'value', value: node } }])
    const session = mergeTraceBatch(
      createTraceSession({ id: 'session-1', source: { path: 'main.py' } }),
      batch(0, [sourceEvent]),
    )

    node.items[0].value = primitive(99)
    expect(reconstructTraceState(session).bindings.get(traceBindingKey({ variableId, callId: null }))).toEqual({
      status: 'value',
      value: { kind: 'sequence', type: 'list', items: [{ label: '0', value: primitive(1) }] },
    })
  })

  it('upserts catalogue and call activation metadata across batches', () => {
    const variableId = localTraceVariableId('factorial', 'n')
    const variable: TraceVariableDefinition = {
      id: variableId,
      name: 'n',
      defaultLabel: 'factorial.n',
      scope: { kind: 'local', owner: 'factorial', functionName: 'factorial' },
      firstSeenSequence: 2,
      lastSeenSequence: 2,
    }
    const call: TraceCallActivation = {
      id: 2,
      parentId: 1,
      qualifiedName: 'factorial',
      functionName: 'factorial',
      depth: 1,
      startedAtSequence: 2,
    }
    let session = createTraceSession({ id: 'session-1', source: { path: 'main.py' } })
    session = mergeTraceBatch(session, batch(0, [], { variables: [variable], calls: [call] }))
    session = mergeTraceBatch(session, batch(1, [], {
      variables: [{ ...variable, firstSeenSequence: 1, lastSeenSequence: 5 }],
      calls: [{ ...call, endedAtSequence: 5, outcome: 'returned' }],
    }))

    expect(session.variables[variableId]).toMatchObject({ firstSeenSequence: 1, lastSeenSequence: 5 })
    expect(session.calls[2]).toMatchObject({ endedAtSequence: 5, outcome: 'returned' })
  })

  it('ignores replayed batches but rejects gaps and out-of-order events', () => {
    const initial = createTraceSession({ id: 'session-1', source: { path: 'main.py' } })
    const merged = mergeTraceBatch(initial, batch(0, [event(0)]))

    expect(mergeTraceBatch(merged, batch(0, [event(0)]))).toBe(merged)
    expect(() => mergeTraceBatch(merged, batch(2, []))).toThrow('Missing trace batch 1')
    expect(() => mergeTraceBatch(merged, batch(1, [event(0)]))).toThrow('not strictly increasing')
  })
})

describe('reconstruction and checkpoints', () => {
  it('reconstructs independent recursive bindings at an earlier sequence', () => {
    const variableId = localTraceVariableId('factorial', 'n')
    let session = createTraceSession({ id: 'session-1', source: { path: 'main.py' } })
    session = mergeTraceBatch(session, batch(0, [
      event(0, [{ variableId, callId: 2, state: { status: 'value', value: primitive(3) } }], [], 2),
      event(1, [{ variableId, callId: 3, state: { status: 'value', value: primitive(2) } }], [], 3),
      event(2, [{ variableId, callId: 3, state: { status: 'out-of-scope' } }], [], 3),
    ]))

    const state = reconstructTraceState(session, 1)
    expect(state.eventCount).toBe(2)
    expect(state.bindings.get(traceBindingKey({ variableId, callId: 2 }))).toEqual({ status: 'value', value: primitive(3) })
    expect(state.bindings.get(traceBindingKey({ variableId, callId: 3 }))).toEqual({ status: 'value', value: primitive(2) })
  })

  it('uses checkpoints without changing reconstructed results', () => {
    const variableId = globalTraceVariableId('x')
    let session = createTraceSession({ id: 'session-1', source: { path: 'main.py' } })
    session = mergeTraceBatch(session, batch(0, [
      event(0, [{ variableId, callId: null, state: { status: 'value', value: primitive(1) } }]),
      event(1, [{ variableId, callId: null, state: { status: 'value', value: primitive(2) } }]),
      event(2, [{ variableId, callId: null, state: { status: 'value', value: primitive(3) } }]),
    ]))
    session = appendTraceCheckpoint(session, 2)

    expect(session.checkpoints[0]).toMatchObject({ eventCount: 2, throughSequence: 1 })
    expect(reconstructTraceState(session).bindings.get(traceBindingKey({ variableId, callId: null }))).toEqual({
      status: 'value', value: primitive(3),
    })
  })

  it('creates a genuinely empty checkpoint before the first event', () => {
    const variableId = globalTraceVariableId('x')
    let session = createTraceSession({ id: 'session-1', source: { path: 'main.py' } })
    session = mergeTraceBatch(session, batch(0, [
      event(0, [{ variableId, callId: null, state: { status: 'value', value: primitive(1) } }]),
    ]))
    session = appendTraceCheckpoint(session, 0)

    expect(session.checkpoints[0]).toEqual({ eventCount: 0, throughSequence: null, bindings: [] })
  })
})

describe('reduceTraceLog', () => {
  it('resets all prior execution data for a new run', () => {
    let session = reduceTraceLog(null, {
      type: 'trace-session-reset',
      session: { id: 'session-1', source: { path: 'old.py' }, startedAt: 1 },
    })
    session = reduceTraceLog(session, batch(0, [event(0)]))
    session = reduceTraceLog(session, {
      type: 'trace-session-reset',
      session: { id: 'session-2', source: { path: 'new.py' }, startedAt: 2 },
    })

    expect(session).toMatchObject({ id: 'session-2', source: { path: 'new.py' }, startedAt: 2, lastBatchSequence: -1 })
    expect(session.events).toEqual([])
    expect(session.variables).toEqual({})
  })
})
