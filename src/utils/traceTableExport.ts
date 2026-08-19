import type { InspectorNode } from '../types'
import type { TraceTableMetaColumnId } from '../types/traceTable'
import type {
  TraceTableProjection,
  TraceTableProjectionDisplayColumn,
  TraceTableProjectionRow,
} from './traceTableProjection'

/** Empty values mean "all", so the shape can be bound directly to select controls. */
export interface TraceTableRowFilter {
  functionName?: string
  /** The one-based user-call ordinal. Module execution is deliberately not a call option. */
  callNumber?: number
}

export interface TraceTableFunctionFilterOption {
  value: string
  label: string
  rowCount: number
}

export interface TraceTableCallFilterOption {
  value: number
  label: string
  functionName: string
  rowCount: number
}

export interface TraceTableFilterOptions {
  functions: TraceTableFunctionFilterOption[]
  callNumbers: TraceTableCallFilterOption[]
}

/**
 * Applies both supplied filters as an intersection while preserving projected
 * row identity and order. The source array is never mutated.
 */
export function filterTraceTableRows(
  rows: readonly TraceTableProjectionRow[],
  filter: TraceTableRowFilter,
): TraceTableProjectionRow[] {
  return rows.filter(row =>
    (filter.functionName === undefined || row.metadata.functionName === filter.functionName)
    && (filter.callNumber === undefined || row.metadata.callNumber === filter.callNumber),
  )
}

/** Convenience wrapper for renderers which keep projection as one value. */
export function filterTraceTableProjection(
  projection: TraceTableProjection,
  filter: TraceTableRowFilter,
): TraceTableProjection {
  return { ...projection, rows: filterTraceTableRows(projection.rows, filter) }
}

/**
 * Builds deterministic options from the unfiltered projection. First-execution
 * order is more useful to learners than alphabetic ordering and remains stable
 * as filters are changed. Call labels include their function to disambiguate
 * recursion and similarly named calls at a glance.
 */
export function deriveTraceTableFilterOptions(
  projection: Pick<TraceTableProjection, 'rows'>,
): TraceTableFilterOptions {
  const functionCounts = new Map<string, number>()
  const calls = new Map<number, { functionName: string; rowCount: number }>()

  for (const row of projection.rows) {
    const { functionName, callNumber } = row.metadata
    functionCounts.set(functionName, (functionCounts.get(functionName) ?? 0) + 1)
    if (callNumber !== null) {
      const current = calls.get(callNumber)
      calls.set(callNumber, {
        functionName: current?.functionName ?? functionName,
        rowCount: (current?.rowCount ?? 0) + 1,
      })
    }
  }

  return {
    functions: [...functionCounts].map(([value, rowCount]) => ({ value, label: value, rowCount })),
    callNumbers: [...calls]
      .sort(([left], [right]) => left - right)
      .map(([value, call]) => ({
        value,
        label: `Call ${value} · ${call.functionName}`,
        functionName: call.functionName,
        rowCount: call.rowCount,
      })),
  }
}

/** Kept public so the on-screen table and exported table can share one formatter. */
export function formatTraceTableInspectorSummary(node: InspectorNode): string {
  if (node.kind === 'primitive') {
    if (typeof node.value === 'string') return node.summary ?? JSON.stringify(node.value)
    return node.summary ?? String(node.value)
  }

  if (node.summary) return node.summary
  if (node.kind === 'sequence') return `${node.type} • ${node.length ?? node.items?.length ?? 0} items`
  if (node.kind === 'mapping') return `${node.type} • ${node.length ?? node.entries?.length ?? 0} entries`
  if (node.kind === 'object') return `${node.type} • ${node.attrs?.length ?? 0} attrs`
  if (node.kind === 'scope') return `${node.type} • ${node.entries?.length ?? 0} values`
  return node.type
}

export function formatTraceTableMetadata(
  row: TraceTableProjectionRow,
  columnId: TraceTableMetaColumnId,
): string {
  if (columnId === 'meta:function') return row.metadata.functionName
  if (columnId === 'meta:call-depth') return String(row.metadata.callDepth)
  return row.metadata.callNumber === null ? '—' : String(row.metadata.callNumber)
}

export type TraceTableLeadingColumn = 'step' | 'line'

export function formatTraceTableLeadingCell(
  row: TraceTableProjectionRow,
  leadingColumn: TraceTableLeadingColumn,
  rowIndex = 0,
): string {
  if (leadingColumn === 'line') {
    if (row.line === undefined) return row.kind === 'event' ? 'Event' : ''
    return `Line ${row.line}${row.kind === 'continuation' ? ' (continued)' : ''}`
  }
  return `Step ${row.stepNumber ?? rowIndex + 1}`
}

export interface TraceTableCsvOptions {
  /** Supply filtered rows here to export exactly what is currently visible. */
  rows?: readonly TraceTableProjectionRow[]
  leadingColumn: TraceTableLeadingColumn
  /** Resolves aliases; projection labels remain the fallback. */
  resolveColumnLabel?: (column: TraceTableProjectionDisplayColumn) => string
  deletedMarker?: string
  /** Include the same concise teaching note shown beneath the row label. */
  includeTeachingNote?: boolean
}

function neutralizeSpreadsheetFormula(value: string): string {
  const candidate = value.replace(/^[\u0000-\u0020]+/, '')
  if (!/^[=+\-@]/.test(candidate)) return value
  // Preserve ordinary signed numeric cells while treating everything else as text.
  if (candidate === value && /^[+\-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+\-]?\d+)?$/.test(candidate)) return value
  return `'${value}`
}

function escapeCsvField(value: string): string {
  const safeValue = neutralizeSpreadsheetFormula(value)
  return /[",\r\n]/.test(safeValue) ? `"${safeValue.replace(/"/g, '""')}"` : safeValue
}

function formatVariableCell(
  row: TraceTableProjectionRow,
  variableId: string,
  deletedMarker: string,
): string {
  const cell = row.cells[variableId]
  if (!cell || cell.state.status === 'out-of-scope') return ''
  if (cell.state.status === 'deleted') return deletedMarker
  return formatTraceTableInspectorSummary(cell.state.value)
}

/**
 * Exports the caller-provided visible rows and the projection's authoritative
 * mixed column order. RFC 4180 CRLF records, doubled quotes and quoted fields
 * preserve commas, quotes and newlines in Python string representations.
 */
export function exportTraceTableCsv(
  projection: TraceTableProjection,
  options: TraceTableCsvOptions,
): string {
  const rows = options.rows ?? projection.rows
  const deletedMarker = options.deletedMarker ?? 'Deleted'
  const header = [
    options.leadingColumn === 'line' ? 'Line' : 'Step',
    ...(options.includeTeachingNote ? ['Context'] : []),
    ...projection.displayColumns.map(column => options.resolveColumnLabel?.(column) ?? column.label),
  ]
  const records = [header, ...rows.map((row, rowIndex) => [
    formatTraceTableLeadingCell(row, options.leadingColumn, rowIndex),
    ...(options.includeTeachingNote ? [row.teachingNote ?? ''] : []),
    ...projection.displayColumns.map(column => column.kind === 'metadata'
      ? formatTraceTableMetadata(row, column.metadataId)
      : formatVariableCell(row, column.variableId, deletedMarker)),
  ])]

  return records.map(record => record.map(value => escapeCsvField(value)).join(',')).join('\r\n')
}
