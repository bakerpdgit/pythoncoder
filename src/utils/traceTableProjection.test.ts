import { describe, expect, it } from 'vitest'
import type {
  TraceBindingDelta,
  TraceCallActivation,
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

function session(
  events: TraceExecutionEvent[],
  variables: TraceVariableDefinition[] = [definition(x, 'x'), definition(y, 'y')],
  calls: TraceCallActivation[] = [],
) {
  return mergeTraceBatch(
    createTraceSession({ id: 'trace-1', source: { path: 'main.py' }, startedAt: 1 }),
    {
      type: 'trace-event-batch',
      sessionId: 'trace-1',
      batchSequence: 0,
      variables,
      calls,
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

describe('projectTraceTable execution metadata', () => {
  const activation = (
    id: number,
    parentId: number | null,
    qualifiedName: string,
    depth: number,
    startedAtSequence: number,
  ): TraceCallActivation => ({
    id,
    parentId,
    qualifiedName,
    functionName: qualifiedName.split('.').at(-1) ?? qualifiedName,
    depth,
    startedAtSequence,
  })

  it('preserves mixed custom column order after the fixed leading columns', () => {
    const result = projectTraceTable(session([
      event(0, { bindingDeltas: [delta(x, 1)], writes: [write(x)] }),
    ]), {
      variableIds: [x, y],
      metaColumnIds: ['meta:function', 'meta:call-depth'],
      columnOrder: [
        `variable:${x}`,
        'meta:function',
        `variable:${y}`,
        'meta:call-depth',
      ],
      showLine: false,
    })

    expect(result.displayColumns.map(column => column.key)).toEqual([
      `variable:${x}`,
      'meta:function',
      `variable:${y}`,
      'meta:call-depth',
    ])
    expect(result.columns.map(column => column.variableId)).toEqual([x, y])
    expect(result.metadataColumns.map(column => column.id)).toEqual(['meta:function', 'meta:call-depth'])
  })

  it('numbers user invocations by start order through recursion and unwind', () => {
    const calls = [
      activation(10, null, '<module>', 0, 0),
      activation(42, 10, 'factorial', 1, 1),
      activation(90, 42, 'factorial', 2, 3),
    ]
    const recorded = session([
      event(0, { callId: 10, callStack: [10], functionName: '<module>' }),
      event(1, { kind: 'call-entered', callId: 42, callStack: [10, 42], functionName: 'factorial' }),
      event(2, { callId: 42, callStack: [10, 42], functionName: 'factorial' }),
      event(3, { kind: 'call-entered', callId: 90, callStack: [10, 42, 90], functionName: 'factorial' }),
      event(4, { callId: 90, callStack: [10, 42, 90], functionName: 'factorial' }),
      event(5, { kind: 'call-returned', callId: 90, callStack: [10, 42, 90], functionName: 'factorial' }),
      event(6, { callId: 42, callStack: [10, 42], functionName: 'factorial' }),
      event(7, { kind: 'call-returned', callId: 42, callStack: [10, 42], functionName: 'factorial' }),
      event(8, { callId: 10, callStack: [10], functionName: '<module>' }),
    ], undefined, calls)

    const result = projectTraceTable(recorded, {
      variableIds: [],
      columnOrder: ['meta:function', 'meta:call-depth', 'meta:call-number'],
      showLine: true,
    })

    expect(result.rows.map(row => [
      row.metadata.functionName,
      row.metadata.callDepth,
      row.metadata.callNumber,
    ])).toEqual([
      ['<module>', 0, null],
      ['factorial', 1, 1],
      ['factorial', 2, 2],
      ['factorial', 1, 1],
      ['<module>', 0, null],
    ])
  })

  it('creates compact metadata-only rows for stable call regions', () => {
    const recorded = session([
      event(0, { callId: 1, callStack: [1] }),
      event(1, { callId: 1, callStack: [1] }),
      event(2, { kind: 'call-entered', callId: 2, callStack: [1, 2], functionName: 'outer' }),
      event(3, { callId: 2, callStack: [1, 2], functionName: 'outer' }),
      event(4, { kind: 'call-entered', callId: 3, callStack: [1, 2, 3], functionName: 'inner' }),
      event(5, { kind: 'call-returned', callId: 3, callStack: [1, 2, 3], functionName: 'inner' }),
      event(6, { callId: 2, callStack: [1, 2], functionName: 'outer' }),
    ])
    const result = projectTraceTable(recorded, {
      variableIds: [],
      columnOrder: ['meta:call-number'],
      showLine: false,
    })

    expect(result.rows.map(row => row.sequences)).toEqual([[0, 1], [2, 3], [4], [5], [6]])
    expect(result.rows.map(row => row.metadata.callNumber)).toEqual([null, 1, 2, 2, 1])
  })

  it('falls back to event stacks when the call catalogue is unavailable', () => {
    const result = projectTraceTable(session([
      event(0, { callId: 7, callStack: [7], functionName: '<module>' }),
      event(1, { callId: 11, callStack: [7, 11], functionName: 'outer' }),
      event(2, { callId: 15, callStack: [7, 11, 15], functionName: 'inner' }),
    ]), { variableIds: [], columnOrder: ['meta:function'], showLine: true })

    expect(result.rows.map(row => row.metadata)).toEqual([
      { functionName: '<module>', callDepth: 0, callId: 7, callNumber: null },
      { functionName: 'outer', callDepth: 1, callId: 11, callNumber: 1 },
      { functionName: 'inner', callDepth: 2, callId: 15, callNumber: 2 },
    ])
  })

  it('keeps executing-call metadata separate from a closure binding activation', () => {
    const captured = localTraceVariableId('outer', 'captured')
    const result = projectTraceTable(session([
      event(0, {
        callId: 3,
        callStack: [1, 2, 3],
        functionName: 'inner',
        bindingDeltas: [delta(captured, 9, 2)],
        writes: [write(captured, { callId: 2 })],
      }),
    ], [{
      id: captured,
      name: 'captured',
      defaultLabel: 'outer.captured',
      scope: { kind: 'local', owner: 'outer', functionName: 'outer' },
      firstSeenSequence: 0,
      lastSeenSequence: 0,
    }]), {
      variableIds: [captured],
      columnOrder: [`variable:${captured}`, 'meta:function'],
      showLine: true,
    })

    expect(result.rows[0].cells[captured].callId).toBe(2)
    expect(result.rows[0].metadata).toMatchObject({ functionName: 'inner', callId: 3, callDepth: 2 })
  })
})

describe('projectTraceTable teaching annotations', () => {
  const activation = (
    id: number,
    parentId: number | null,
    qualifiedName: string,
    depth: number,
    startedAtSequence: number,
  ): TraceCallActivation => ({
    id,
    parentId,
    qualifiedName,
    functionName: qualifiedName.split('.').at(-1) ?? qualifiedName,
    depth,
    startedAtSequence,
  })

  it('is opt-in and leaves the established row packing unchanged by default', () => {
    const result = projectTraceTable(session([
      event(0, { kind: 'input-completed', inputValue: 'Ada' }),
      event(1, { bindingDeltas: [delta(x, 1)], writes: [write(x)] }),
    ]), { variableIds: [x], showLine: false })

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ kind: 'line', annotations: [], teachingNote: null })
  })

  it('marks loop boundaries without changing compact variable packing', () => {
    const result = projectTraceTable(session([
      event(0, { bindingDeltas: [delta(x, 1)], writes: [write(x)] }),
      event(1, {
        loopIteration: { loopId: 'for:2', iteration: 3, depth: 0 },
        bindingDeltas: [delta(y, 2)],
        writes: [write(y, { kind: 'loop-target' })],
      }),
    ]), { variableIds: [x, y], showLine: false, includeAnnotations: true })

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].cells[x]).toBeDefined()
    expect(result.rows[1].cells[y]).toBeDefined()
    expect(result.rows[1].annotations).toEqual([expect.objectContaining({
      kind: 'loop-iteration',
      sequence: 1,
      label: 'For loop iteration 3.',
      loopIteration: { loopId: 'for:2', iteration: 3, depth: 0 },
    })])
    expect(result.rows[1].teachingNote).toBe('For loop iteration 3.')
  })

  it('does not label a later compact assignment as part of the previous execution event', () => {
    const result = projectTraceTable(session([
      event(0, { bindingDeltas: [delta(x, 1)], writes: [write(x)] }),
      event(1, { bindingDeltas: [delta(x, 1)], writes: [write(x)] }),
    ]), {
      variableIds: [x],
      columnOrder: [`variable:${x}`, 'meta:function'],
      showLine: false,
      includeAnnotations: true,
    })

    expect(result.rows).toHaveLength(2)
    expect(result.rows[1]).toMatchObject({ kind: 'line', annotations: [], teachingNote: null })
  })

  it('creates clearly identified lifecycle rows for call entry and return in every-line mode', () => {
    const calls = [
      activation(1, null, '<module>', 0, 0),
      activation(2, 1, 'calculate', 1, 0),
    ]
    const result = projectTraceTable(session([
      event(0, {
        kind: 'call-entered',
        callId: 2,
        callStack: [1, 2],
        functionName: 'calculate',
      }),
      event(1, {
        kind: 'call-returned',
        callId: 2,
        callStack: [1, 2],
        functionName: 'calculate',
        returnValue: primitive(42),
      }),
    ], [], calls), {
      variableIds: [],
      showLine: true,
      includeAnnotations: true,
    })

    expect(result.rows.map(row => row.kind)).toEqual(['event', 'event'])
    expect(result.rows.map(row => row.teachingNote)).toEqual([
      'Entered calculate (call #1).',
      'Returned from calculate (call #1) with 42.',
    ])
    expect(result.rows[1].annotations[0]).toMatchObject({
      kind: 'call-returned',
      value: primitive(42),
    })
    expect(result.rows.every(row => Object.keys(row.cells).length === 0)).toBe(true)
  })

  it('describes raised exceptions, exception exits, and completed input', () => {
    const failure = { type: 'ValueError', message: 'not a number' }
    const result = projectTraceTable(session([
      event(0, { kind: 'input-completed', inputValue: 'hello' }),
      event(1, { kind: 'exception', functionName: 'parse', exception: failure }),
      event(2, { kind: 'call-exception-exit', functionName: 'parse', exception: failure }),
    ], []), { variableIds: [], showLine: true, includeAnnotations: true })

    expect(result.rows.map(row => row.annotations[0].kind)).toEqual([
      'input-completed',
      'exception',
      'call-exception-exit',
    ])
    expect(result.rows.map(row => row.teachingNote)).toEqual([
      'Input received: "hello".',
      'ValueError: not a number raised in parse.',
      'Left parse after ValueError: not a number.',
    ])
    expect(result.rows[0].annotations[0].inputValue).toBe('hello')
    expect(result.rows[1].annotations[0].exception).toEqual(failure)
  })

  it('distinguishes generator yield and resume lifecycle events', () => {
    const result = projectTraceTable(session([
      event(0, { kind: 'generator-yielded', functionName: 'numbers', returnValue: primitive(7) }),
      event(1, { kind: 'generator-resumed', functionName: 'numbers' }),
    ], []), { variableIds: [], showLine: false, includeAnnotations: true })

    expect(result.rows.map(row => row.teachingNote)).toEqual([
      'numbers yielded 7.',
      'Resumed numbers.',
    ])
    expect(result.rows.map(row => row.annotations[0].kind)).toEqual([
      'generator-yielded',
      'generator-resumed',
    ])
  })

  it.each([true, false])('labels same-event overflow rows as continuations when showLine is %s', showLine => {
    const result = projectTraceTable(session([
      event(0, {
        bindingDeltas: [delta(x, 2)],
        writes: [
          write(x, { value: primitive(1) }),
          write(x, { value: primitive(2) }),
        ],
      }),
    ]), { variableIds: [x], showLine, includeAnnotations: true })

    expect(result.rows).toHaveLength(2)
    expect(result.rows[1]).toMatchObject({
      kind: 'continuation',
      teachingNote: 'Continued values from the same execution event.',
      annotations: [expect.objectContaining({
        kind: 'continuation',
        sequence: 0,
        continuationWriteIndex: 1,
      })],
    })
    expect(result.rows.map(row => row.cells[x].value)).toEqual([primitive(1), primitive(2)])
  })

  it('retains compact continuation row identity when teaching context is hidden', () => {
    const result = projectTraceTable(session([
      event(0, {
        bindingDeltas: [delta(x, 2)],
        writes: [
          write(x, { value: primitive(1) }),
          write(x, { value: primitive(2) }),
        ],
      }),
    ]), { variableIds: [x], showLine: false, includeAnnotations: false })

    expect(result.rows[1]).toMatchObject({ kind: 'continuation', annotations: [], teachingNote: null })
  })

  it('keeps recursive return annotations attached to the unwinding invocation', () => {
    const calls = [
      activation(1, null, '<module>', 0, 0),
      activation(2, 1, 'factorial', 1, 0),
      activation(3, 2, 'factorial', 2, 1),
    ]
    const result = projectTraceTable(session([
      event(0, { kind: 'call-entered', callId: 2, callStack: [1, 2], functionName: 'factorial' }),
      event(1, { kind: 'call-entered', callId: 3, callStack: [1, 2, 3], functionName: 'factorial' }),
      event(2, {
        kind: 'call-returned',
        callId: 3,
        callStack: [1, 2, 3],
        functionName: 'factorial',
        returnValue: primitive(1),
      }),
      event(3, {
        kind: 'call-returned',
        callId: 2,
        callStack: [1, 2],
        functionName: 'factorial',
        returnValue: primitive(2),
      }),
    ], [], calls), { variableIds: [], showLine: false, includeAnnotations: true })

    const returns = result.rows.filter(row => row.annotations.some(annotation => annotation.kind === 'call-returned'))
    expect(returns.map(row => row.metadata.callId)).toEqual([3, 2])
    expect(returns.map(row => row.metadata.callNumber)).toEqual([2, 1])
    expect(returns.map(row => row.teachingNote)).toEqual([
      'Returned from factorial (call #2) with 1.',
      'Returned from factorial (call #1) with 2.',
    ])
  })
})
