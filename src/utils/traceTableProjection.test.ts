import { describe, expect, it } from 'vitest'
import type {
  TraceBindingDelta,
  TraceExecutionEvent,
  TraceVariableDefinition,
  TraceWriteMarker,
} from '../types/traceTable'
import {
  createTraceSession,
  globalTraceVariableId,
  localTraceVariableId,
  mergeTraceBatch,
} from './traceLog'
import { projectTraceTable } from './traceTableProjection'

const primitive = (value: string | number) => ({ kind: 'primitive' as const, type: typeof value, value })
const x = globalTraceVariableId('x')
const y = globalTraceVariableId('y')

function definition(id: string, name: string, defaultLabel = name): TraceVariableDefinition {
  return {
    id,
    name,
    defaultLabel,
    scope: { kind: 'global' },
    firstSeenSequence: 0,
    lastSeenSequence: 99,
  }
}

function write(
  variableId: string,
  options: Partial<TraceWriteMarker> = {},
): TraceWriteMarker {
  return {
    variableId,
    callId: null,
    kind: 'assignment',
    changed: true,
    outcome: 'value',
    ...options,
  }
}

function delta(variableId: string, value: string | number, callId: number | null = null): TraceBindingDelta {
  return { variableId, callId, state: { status: 'value', value: primitive(value) } }
}

function event(
  sequence: number,
  options: Partial<TraceExecutionEvent> = {},
): TraceExecutionEvent {
  return {
    sequence,
    kind: 'line-completed',
    location: { path: 'main.py', line: sequence + 10 },
    callId: 1,
    callStack: [1],
    functionName: '<module>',
    bindingDeltas: [],
    writes: [],
    ...options,
  }
}

function session(events: TraceExecutionEvent[], variables: TraceVariableDefinition[] = [definition(x, 'x'), definition(y, 'y')]) {
  return mergeTraceBatch(
    createTraceSession({ id: 'trace-1', source: { path: 'main.py' }, startedAt: 1 }),
    {
      type: 'trace-event-batch',
      sessionId: 'trace-1',
      batchSequence: 0,
      variables,
      events,
    },
  )
}

describe('projectTraceTable every-line mode', () => {
  it('emits every completed line and leaves unchanged, unwritten cells blank', () => {
    const result = projectTraceTable(session([
      event(0, { bindingDeltas: [delta(x, 1)], writes: [write(x)] }),
      event(1),
      event(2, { kind: 'input-completed', location: { path: 'main.py', line: 30 } }),
    ]), { variableIds: [x], showLine: true })

    expect(result.rows.map(row => row.line)).toEqual([10, 11])
    expect(result.rows[0].cells[x]?.value).toEqual(primitive(1))
    expect(result.rows[1].cells[x]).toBeUndefined()
  })

  it('renders an explicit same-value assignment from reconstructed delta history', () => {
    const result = projectTraceTable(session([
      event(0, { bindingDeltas: [delta(x, 1)], writes: [write(x)] }),
      event(1, { writes: [write(x, { changed: false })] }),
    ]), { variableIds: [x], showLine: true })

    expect(result.rows[1].cells[x]).toMatchObject({
      callId: null,
      outcome: 'value',
      state: { status: 'value', value: primitive(1) },
      value: primitive(1),
      write: { changed: false },
    })
  })

  it('includes selected parameter writes from lifecycle events', () => {
    const n = localTraceVariableId('f', 'n')
    const nDefinition: TraceVariableDefinition = {
      id: n,
      name: 'n',
      defaultLabel: 'f.n',
      scope: { kind: 'local', owner: 'f', functionName: 'f' },
      firstSeenSequence: 0,
      lastSeenSequence: 0,
    }
    const result = projectTraceTable(session([
      event(0, {
        kind: 'call-entered',
        callId: 2,
        callStack: [1, 2],
        functionName: 'f',
        bindingDeltas: [delta(n, 4, 2)],
        writes: [write(n, { callId: 2, kind: 'parameter' })],
      }),
    ], [nDefinition]), { variableIds: [n], showLine: true })

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].cells[n]).toMatchObject({ callId: 2, value: primitive(4) })
  })
})

describe('projectTraceTable compact mode', () => {
  it('packs writes to x then y into the same row', () => {
    const result = projectTraceTable(session([
      event(0, { bindingDeltas: [delta(x, 1)], writes: [write(x)] }),
      event(1, { bindingDeltas: [delta(y, 2)], writes: [write(y)] }),
    ]), { variableIds: [x, y], showLine: false })

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].sequences).toEqual([0, 1])
    expect(Object.keys(result.rows[0].cells)).toEqual([x, y])
  })

  it('starts a new row when a selected variable repeats', () => {
    const result = projectTraceTable(session([
      event(0, { bindingDeltas: [delta(x, 1)], writes: [write(x)] }),
      event(1, { bindingDeltas: [delta(x, 2)], writes: [write(x)] }),
    ]), { variableIds: [x], showLine: false })

    expect(result.rows.map(row => row.cells[x].value)).toEqual([primitive(1), primitive(2)])
  })

  it('starts a new row at every loop-iteration boundary', () => {
    const result = projectTraceTable(session([
      event(0, { bindingDeltas: [delta(x, 1)], writes: [write(x)] }),
      event(1, {
        loopIteration: { loopId: 'for:1', iteration: 1, depth: 0 },
        bindingDeltas: [delta(y, 2)],
        writes: [write(y, { kind: 'loop-target' })],
      }),
    ]), { variableIds: [x, y], showLine: false })

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].cells[x]).toBeDefined()
    expect(result.rows[1].cells[y]).toBeDefined()
  })

  it('starts a new row on call-stack and lifecycle transitions', () => {
    const result = projectTraceTable(session([
      event(0, { bindingDeltas: [delta(x, 1)], writes: [write(x)] }),
      event(1, {
        kind: 'call-entered',
        callId: 2,
        callStack: [1, 2],
        functionName: 'f',
        bindingDeltas: [delta(y, 2, 2)],
        writes: [write(y, { callId: 2, kind: 'parameter' })],
      }),
    ]), { variableIds: [x, y], showLine: false })

    expect(result.rows).toHaveLength(2)
    expect(result.rows[1].cells[y].callId).toBe(2)
  })

  it('skips events with no selected visible write', () => {
    const result = projectTraceTable(session([
      event(0),
      event(1, { bindingDeltas: [delta(y, 2)], writes: [write(y)] }),
    ]), { variableIds: [x], showLine: false })

    expect(result.rows).toEqual([])
  })
})

describe('projectTraceTable cell identity and history', () => {
  it.each([true, false])('preserves repeated same-event values when showLine is %s', showLine => {
    const result = projectTraceTable(session([
      event(0, {
        bindingDeltas: [delta(x, 2)],
        writes: [
          write(x, { value: primitive(1) }),
          write(x, { value: primitive(2) }),
        ],
      }),
    ]), { variableIds: [x], showLine })

    expect(result.rows).toHaveLength(2)
    expect(result.rows.map(row => row.cells[x].value)).toEqual([primitive(1), primitive(2)])
    expect(new Set(result.rows.map(row => row.id)).size).toBe(2)
  })

  it('represents deletion explicitly', () => {
    const result = projectTraceTable(session([
      event(0, {
        bindingDeltas: [{ variableId: x, callId: null, state: { status: 'deleted' } }],
        writes: [write(x, { kind: 'deletion', outcome: 'deleted' })],
      }),
    ]), { variableIds: [x], showLine: false })

    expect(result.rows[0].cells[x]).toMatchObject({
      outcome: 'deleted',
      state: { status: 'deleted' },
      write: { kind: 'deletion' },
    })
    expect(result.rows[0].cells[x].value).toBeUndefined()
  })

  it('preserves recursive call IDs for the same source variable', () => {
    const n = localTraceVariableId('factorial', 'n')
    const nDefinition: TraceVariableDefinition = {
      id: n,
      name: 'n',
      defaultLabel: 'factorial.n',
      scope: { kind: 'local', owner: 'factorial', functionName: 'factorial' },
      firstSeenSequence: 0,
      lastSeenSequence: 1,
    }
    const result = projectTraceTable(session([
      event(0, {
        callId: 2,
        callStack: [1, 2],
        bindingDeltas: [delta(n, 3, 2)],
        writes: [write(n, { callId: 2, kind: 'parameter' })],
      }),
      event(1, {
        callId: 3,
        callStack: [1, 2, 3],
        bindingDeltas: [delta(n, 2, 3)],
        writes: [write(n, { callId: 3, kind: 'parameter' })],
      }),
    ], [nDefinition]), { variableIds: [n], showLine: false })

    expect(result.rows.map(row => row.cells[n].callId)).toEqual([2, 3])
    expect(result.rows.map(row => row.cells[n].value)).toEqual([primitive(3), primitive(2)])
  })

  it('reprojects all history when a column is selected late', () => {
    const recorded = session([
      event(0, { bindingDeltas: [delta(x, 1)], writes: [write(x)] }),
      event(1, { bindingDeltas: [delta(y, 2)], writes: [write(y)] }),
    ], [definition(x, 'x', 'X value'), definition(y, 'y', 'Y value')])

    const before = projectTraceTable(recorded, { variableIds: [x], showLine: false })
    const after = projectTraceTable(recorded, { variableIds: [y, x], showLine: false })

    expect(before.columns).toEqual([{ variableId: x, label: 'X value' }])
    expect(before.rows[0].cells[y]).toBeUndefined()
    expect(after.columns.map(column => column.variableId)).toEqual([y, x])
    expect(after.rows[0].cells[y].value).toEqual(primitive(2))
    expect(after.rows[0].sequences).toEqual([0, 1])
  })
})
