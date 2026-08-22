import { describe, expect, it } from 'vitest'
import type { InspectorNode } from '../types'
import type {
  TraceTableProjection,
  TraceTableProjectionCell,
  TraceTableProjectionRow,
} from './traceTableProjection'
import {
  deriveTraceTableFilterOptions,
  exportTraceTableCsv,
  filterTraceTableProjection,
  filterTraceTableRows,
  formatTraceTableInspectorSummary,
} from './traceTableExport'

const primitive = (value: string | number): InspectorNode => ({
  kind: 'primitive',
  type: typeof value,
  value,
})

function cell(variableId: string, value: InspectorNode): TraceTableProjectionCell {
  return {
    variableId,
    callId: null,
    sequence: 0,
    state: { status: 'value', value },
    value,
    outcome: 'value',
    write: {
      variableId,
      callId: null,
      kind: 'assignment',
      changed: true,
      outcome: 'value',
      value,
    },
  }
}

function row(
  id: string,
  functionName: string,
  callNumber: number | null,
  options: Partial<TraceTableProjectionRow> = {},
): TraceTableProjectionRow {
  const sequence = Number(id)
  return {
    id,
    sequence,
    sequences: [sequence],
    line: sequence + 10,
    cells: {},
    metadata: { functionName, callNumber, callId: callNumber ?? 1, callDepth: callNumber === null ? 0 : 1 },
    ...options,
    kind: options.kind ?? 'line',
    annotations: options.annotations ?? [],
    teachingNote: options.teachingNote ?? null,
  }
}

const rows = [
  row('0', '<module>', null),
  row('1', 'factorial', 1),
  row('2', 'factorial', 2),
  row('3', 'helper', 3),
  row('4', 'factorial', 2),
]

function projection(overrides: Partial<TraceTableProjection> = {}): TraceTableProjection {
  return {
    columns: [{ variableId: 'x', label: 'x' }, { variableId: 'message', label: 'message' }],
    metadataColumns: [
      { id: 'meta:function', label: 'Function' },
      { id: 'meta:call-number', label: 'Call #' },
    ],
    displayColumns: [
      { kind: 'metadata', key: 'meta:function', metadataId: 'meta:function', label: 'Function' },
      { kind: 'variable', key: 'variable:x', variableId: 'x', label: 'x' },
      { kind: 'metadata', key: 'meta:call-number', metadataId: 'meta:call-number', label: 'Call #' },
      { kind: 'variable', key: 'variable:message', variableId: 'message', label: 'message' },
    ],
    rows,
    ...overrides,
  }
}

describe('trace table filtering', () => {
  it('filters by function and user call number as an intersection without changing order', () => {
    expect(filterTraceTableRows(rows, { functionName: 'factorial' }).map(item => item.id)).toEqual(['1', '2', '4'])
    expect(filterTraceTableRows(rows, { callNumber: 2 }).map(item => item.id)).toEqual(['2', '4'])
    expect(filterTraceTableRows(rows, { functionName: 'helper', callNumber: 2 })).toEqual([])
    expect(filterTraceTableRows(rows, {})).toEqual(rows)
  })

  it('returns a projection copy with the same column identity and filtered rows', () => {
    const original = projection()
    const filtered = filterTraceTableProjection(original, { functionName: 'helper' })

    expect(filtered).not.toBe(original)
    expect(filtered.displayColumns).toBe(original.displayColumns)
    expect(filtered.rows.map(item => item.id)).toEqual(['3'])
  })

  it('derives stable first-execution function options and sorted user-call options', () => {
    expect(deriveTraceTableFilterOptions(projection())).toEqual({
      functions: [
        { value: '<module>', label: '<module>', rowCount: 1 },
        { value: 'factorial', label: 'factorial', rowCount: 3 },
        { value: 'helper', label: 'helper', rowCount: 1 },
      ],
      callNumbers: [
        { value: 1, label: 'Call 1 · factorial', functionName: 'factorial', rowCount: 1 },
        { value: 2, label: 'Call 2 · factorial', functionName: 'factorial', rowCount: 2 },
        { value: 3, label: 'Call 3 · helper', functionName: 'helper', rowCount: 1 },
      ],
    })
  })
})

describe('trace table CSV export', () => {
  it('exports complete multi-line Output cells in their configured position', () => {
    const outputRow = row('1', '<module>', null, { output: ['first line', 'second line'] })
    const csv = exportTraceTableCsv(projection({
      columns: [],
      metadataColumns: [{ id: 'meta:output', label: 'Output' }],
      displayColumns: [{ kind: 'metadata', key: 'meta:output', metadataId: 'meta:output', label: 'Output' }],
      rows: [outputRow],
    }), { leadingColumn: 'step' })

    expect(csv).toBe('Step,Output\r\nStep 1,"first line\nsecond line"')
  })

  it('uses visible rows and mixed display order, resolves aliases, and keeps blank/deleted cells', () => {
    const deleted: TraceTableProjectionCell = {
      ...cell('message', primitive('unused')),
      state: { status: 'deleted' },
      value: undefined,
      outcome: 'deleted',
      write: { ...cell('message', primitive('unused')).write, outcome: 'deleted' },
    }
    const visibleRows = [
      row('1', 'factorial', 1, {
        line: 24,
        cells: {
          x: cell('x', primitive(7)),
          message: cell('message', primitive('hello, "trace"')),
        },
      }),
      row('2', 'factorial', 2, { line: 25, cells: { message: deleted } }),
    ]

    const csv = exportTraceTableCsv(projection(), {
      rows: visibleRows,
      leadingColumn: 'line',
      resolveColumnLabel: column => column.kind === 'variable' && column.variableId === 'x' ? 'Result, x' : column.label,
    })

    expect(csv).toBe([
      'Line,Function,"Result, x",Call #,message',
      String.raw`Line 24,factorial,7,1,"""hello, \""trace\"""""`,
      'Line 25,factorial,,2,Deleted',
    ].join('\r\n'))
  })

  it('emits RFC 4180 CRLF records and doubles quotes and embedded newlines', () => {
    const value = { kind: 'primitive' as const, type: 'str', summary: 'first "line"\nsecond' }
    const csv = exportTraceTableCsv(projection({
      displayColumns: [{ kind: 'variable', key: 'variable:x', variableId: 'x', label: 'x' }],
      rows: [row('8', '<module>', null, { cells: { x: cell('x', value) } })],
    }), { leadingColumn: 'step' })

    expect(csv).toBe('Step,x\r\nStep 1,"first ""line""\nsecond"')
  })

  it('neutralizes spreadsheet formulas in editable headers and traced values', () => {
    const formula = { kind: 'primitive' as const, type: 'str', summary: '=HYPERLINK("https://example.test")' }
    const signedNumber = { kind: 'primitive' as const, type: 'int', summary: '-42' }
    const csv = exportTraceTableCsv(projection({
      displayColumns: [{ kind: 'variable', key: 'variable:x', variableId: 'x', label: 'x' }],
      rows: [
        row('8', '<module>', null, { cells: { x: cell('x', formula) } }),
        row('9', '<module>', null, { cells: { x: cell('x', signedNumber) } }),
      ],
    }), {
      leadingColumn: 'step',
      resolveColumnLabel: () => '+Calculated value',
    })

    expect(csv).toBe([
      "Step,'+Calculated value",
      "Step 1,\"'=HYPERLINK(\"\"https://example.test\"\")\"",
      'Step 2,-42',
    ].join('\r\n'))
  })

  it('exports visible teaching context and labels continuation rows explicitly', () => {
    const annotated = row('9', 'factorial', 2, {
      kind: 'continuation',
      line: 18,
      teachingNote: 'Continued values from the same execution event.',
    })
    const csv = exportTraceTableCsv(projection({ rows: [annotated] }), {
      leadingColumn: 'line',
      includeTeachingNote: true,
    })

    expect(csv.split('\r\n').slice(0, 2)).toEqual([
      'Line,Context,Function,x,Call #,message',
      'Line 18 (continued),Continued values from the same execution event.,factorial,,2,',
    ])
  })

  it('preserves original compact step numbers when exporting filtered rows', () => {
    const filtered = row('4', 'factorial', 2, { stepNumber: 7 })
    const csv = exportTraceTableCsv(projection({ rows: [filtered] }), {
      rows: [filtered],
      leadingColumn: 'step',
    })

    expect(csv.split('\r\n')[1]).toBe('Step 7,factorial,,2,')
  })

  it('formats inspector values exactly like the current table UI', () => {
    expect(formatTraceTableInspectorSummary(primitive('abc'))).toBe('"abc"')
    expect(formatTraceTableInspectorSummary({ kind: 'sequence', type: 'list', length: 3 })).toBe('list • 3 items')
    expect(formatTraceTableInspectorSummary({ kind: 'mapping', type: 'dict', entries: [] })).toBe('dict • 0 entries')
    expect(formatTraceTableInspectorSummary({ kind: 'object', type: 'Player', attrs: [] })).toBe('Player • 0 attrs')
    expect(formatTraceTableInspectorSummary({ kind: 'scope', type: 'locals', entries: [] })).toBe('locals • 0 values')
    expect(formatTraceTableInspectorSummary({ kind: 'reference', type: 'Player' })).toBe('Player')
  })
})
