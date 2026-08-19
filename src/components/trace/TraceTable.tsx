import { useMemo, useState } from 'react'
import type { InspectorNode } from '../../types'
import type { TraceSession, TraceVariableId } from '../../types/traceTable'
import { projectTraceTable, type TraceTableProjectionCell } from '../../utils/traceTableProjection'

type RowMode = 'compact' | 'every-line'

const SESSION_STATUS_LABELS: Record<TraceSession['status'], string> = {
  recording: 'Recording',
  paused: 'Paused',
  completed: 'Completed',
  stopped: 'Stopped',
  error: 'Error',
  'limit-reached': 'Limit reached',
}

interface TraceTableProps {
  session: TraceSession
  /**
   * Reserved for the future column designer. When absent, the whole discovered
   * catalogue is displayed in its source discovery order.
   */
  variableIds?: TraceVariableId[]
}

const formatInspectorSummary = (node: InspectorNode): string => {
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

const formatTraceCell = (cell: TraceTableProjectionCell): string => {
  if (cell.state.status === 'deleted') return 'Deleted'
  if (cell.state.status !== 'value') return 'Unavailable'
  return formatInspectorSummary(cell.state.value)
}

/** A compact, teaching-oriented history of writes captured in a trace session. */
export const TraceTable = ({ session, variableIds }: TraceTableProps) => {
  const [rowMode, setRowMode] = useState<RowMode>('compact')

  const discoveredVariableIds = useMemo(
    () => Object.values(session.variables)
      .sort((a, b) => a.firstSeenSequence - b.firstSeenSequence || a.defaultLabel.localeCompare(b.defaultLabel))
      .map(variable => variable.id),
    [session.variables],
  )
  const displayedVariableIds = variableIds ?? discoveredVariableIds
  const projection = useMemo(
    () => projectTraceTable(session, { variableIds: displayedVariableIds, showLine: rowMode === 'every-line' }),
    [displayedVariableIds, rowMode, session],
  )

  const eventCount = session.events.length
  const rowCount = projection.rows.length
  const hasTableData = projection.columns.length > 0 && rowCount > 0

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-slate-700 bg-slate-900/60" aria-labelledby="trace-table-title">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 id="trace-table-title" className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Trace table</h2>
            <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">{SESSION_STATUS_LABELS[session.status]}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500" aria-live="polite">
            {eventCount} {eventCount === 1 ? 'event' : 'events'} · {rowCount} {rowCount === 1 ? 'row' : 'rows'}
          </p>
        </div>
        <div className="inline-flex rounded-md border border-slate-700 bg-slate-950/40 p-0.5" role="group" aria-label="Trace table row layout">
          <button
            type="button"
            aria-pressed={rowMode === 'compact'}
            onClick={() => setRowMode('compact')}
            className={`rounded px-2 py-1 text-xs transition-colors ${rowMode === 'compact' ? 'bg-sky-500/20 text-sky-100' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Compact
          </button>
          <button
            type="button"
            aria-pressed={rowMode === 'every-line'}
            onClick={() => setRowMode('every-line')}
            className={`rounded px-2 py-1 text-xs transition-colors ${rowMode === 'every-line' ? 'bg-sky-500/20 text-sky-100' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Every line
          </button>
        </div>
      </div>

      {session.error && (
        <div className="border-b border-red-900/50 bg-red-900/50 px-3 py-1.5 text-xs text-red-200" role="alert">
          {session.error}
        </div>
      )}

      {hasTableData ? (
        <div className="min-h-0 flex-1 overflow-auto" tabIndex={0} aria-label="Trace table results">
          <table className="w-full min-w-max border-separate border-spacing-0 text-left text-xs" aria-label="Trace event history">
            <thead>
              <tr>
                <th scope="col" className="sticky top-0 z-10 border-b border-r border-slate-700 bg-slate-900 px-3 py-2 font-semibold text-slate-300">
                  {rowMode === 'every-line' ? 'Line' : 'Step'}
                </th>
                {projection.columns.map(column => (
                  <th key={column.variableId} scope="col" className="sticky top-0 z-10 border-b border-slate-700 bg-slate-900 px-3 py-2 font-semibold text-slate-300">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projection.rows.map((row, rowIndex) => (
                <tr key={row.id} className={rowIndex % 2 === 0 ? 'bg-slate-800/40' : undefined}>
                  <th scope="row" className="whitespace-nowrap border-b border-r border-slate-700/60 px-3 py-2 font-medium text-slate-400">
                    {row.line === undefined ? `Event ${row.sequences.join(', ')}` : `Line ${row.line}`}
                  </th>
                  {projection.columns.map(column => {
                    const cell = row.cells[column.variableId]
                    if (!cell || cell.state.status === 'out-of-scope') {
                      return <td key={column.variableId} className="border-b border-slate-700/60 px-3 py-2" aria-label={`${column.label}: no write`} />
                    }
                    if (cell.state.status === 'deleted') {
                      return <td key={column.variableId} className="border-b border-slate-700/60 px-3 py-2 font-medium text-red-200">Deleted</td>
                    }
                    return (
                      <td key={column.variableId} className="max-w-64 border-b border-slate-700/60 px-3 py-2 text-emerald-300" title={formatTraceCell(cell)}>
                        <span className="block truncate">{formatTraceCell(cell)}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-500" role="status">
          {eventCount === 0 ? 'Run code to capture trace events.' : 'No variable writes were captured for this trace.'}
        </div>
      )}
    </section>
  )
}

export default TraceTable
