import { useEffect, useMemo, useState } from 'react'
import type { InspectorNode } from '../../types'
import type { TraceSession, TraceTablePreferences } from '../../types/traceTable'
import { projectTraceTable, type TraceTableProjectionCell } from '../../utils/traceTableProjection'
import {
  getStoredTraceTablePreferences,
  persistTraceTablePreferences,
  refreshTraceTableCachedLabels,
  resolveTraceTableColumnIds,
  resolveTraceTableColumnLabel,
  traceTablePreferenceStorageKey,
} from '../../utils/traceTablePreferences'
import { TraceTableColumnDesigner, type TraceTableColumnDesignerResult } from './TraceTableColumnDesigner'

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
export const TraceTable = ({ session }: TraceTableProps) => {
  const preferenceKey = traceTablePreferenceStorageKey(session.source)
  const [preferences, setPreferences] = useState<TraceTablePreferences>(
    () => refreshTraceTableCachedLabels(getStoredTraceTablePreferences(session.source), session.variables),
  )
  const [isDesignerOpen, setIsDesignerOpen] = useState(false)

  useEffect(() => {
    const restored = refreshTraceTableCachedLabels(getStoredTraceTablePreferences(session.source), session.variables)
    setPreferences(restored)
    persistTraceTablePreferences(session.source, restored)
  // The encoded key is stable even though session.source is replaced with each session object.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferenceKey])

  useEffect(() => {
    setPreferences(current => {
      const refreshed = refreshTraceTableCachedLabels(current, session.variables)
      if (JSON.stringify(refreshed.cachedDefaultLabels) === JSON.stringify(current.cachedDefaultLabels)) return current
      persistTraceTablePreferences(session.source, refreshed)
      return refreshed
    })
  }, [session.source, session.variables])

  const updatePreferences = (next: TraceTablePreferences) => {
    setPreferences(next)
    persistTraceTablePreferences(session.source, next)
  }

  const displayedVariableIds = useMemo(
    () => resolveTraceTableColumnIds(preferences, session.variables),
    [preferences, session.variables],
  )
  const projection = useMemo(
    () => projectTraceTable(session, { variableIds: displayedVariableIds, showLine: preferences.rowMode === 'every-line' }),
    [displayedVariableIds, preferences.rowMode, session],
  )
  const availableVariables = useMemo(
    () => Object.values(session.variables)
      .sort((a, b) => a.firstSeenSequence - b.firstSeenSequence || a.defaultLabel.localeCompare(b.defaultLabel)),
    [session.variables],
  )
  const labelFor = (variableId: string) => resolveTraceTableColumnLabel(preferences, variableId, session.variables)

  const setRowMode = (rowMode: TraceTablePreferences['rowMode']) => updatePreferences({ ...preferences, rowMode })
  const applyColumnDesign = (result: TraceTableColumnDesignerResult) => {
    updatePreferences(refreshTraceTableCachedLabels({
      ...preferences,
      columnMode: result.autoSelect ? 'auto' : 'custom',
      variableIds: result.variableIds,
      aliases: result.aliases,
    }, session.variables))
    setIsDesignerOpen(false)
  }

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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={() => setIsDesignerOpen(true)}
            className="rounded-md border border-slate-600 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-sky-500 hover:text-sky-100">
            Columns ({projection.columns.length})
          </button>
          <div className="inline-flex rounded-md border border-slate-700 bg-slate-950/40 p-0.5" role="group" aria-label="Trace table row layout">
            <button
              type="button"
              aria-pressed={preferences.rowMode === 'compact'}
              onClick={() => setRowMode('compact')}
              className={`rounded px-2 py-1 text-xs transition-colors ${preferences.rowMode === 'compact' ? 'bg-sky-500/20 text-sky-100' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Compact
            </button>
            <button
              type="button"
              aria-pressed={preferences.rowMode === 'every-line'}
              onClick={() => setRowMode('every-line')}
              className={`rounded px-2 py-1 text-xs transition-colors ${preferences.rowMode === 'every-line' ? 'bg-sky-500/20 text-sky-100' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Every line
            </button>
          </div>
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
                  {preferences.rowMode === 'every-line' ? 'Line' : 'Step'}
                </th>
                {projection.columns.map(column => (
                  <th key={column.variableId} scope="col" className="sticky top-0 z-10 border-b border-slate-700 bg-slate-900 px-3 py-2 font-semibold text-slate-300">
                    {labelFor(column.variableId)}
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
                    const columnLabel = labelFor(column.variableId)
                    if (!cell || cell.state.status === 'out-of-scope') {
                      return <td key={column.variableId} className="border-b border-slate-700/60 px-3 py-2" aria-label={`${columnLabel}: no write`} />
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
          <div>
            <p>{projection.columns.length === 0 && preferences.columnMode === 'custom'
              ? 'Choose columns to add variables to this trace table.'
              : eventCount === 0
                ? 'Run code to capture trace events.'
                : 'No variable writes were captured for this trace.'}</p>
            {projection.columns.length === 0 && preferences.columnMode === 'custom' && (
              <button type="button" onClick={() => setIsDesignerOpen(true)} className="mt-3 rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-500 hover:text-sky-100">
                Choose columns
              </button>
            )}
          </div>
        </div>
      )}
      <TraceTableColumnDesigner
        open={isDesignerOpen}
        availableVariables={availableVariables}
        selectedVariableIds={displayedVariableIds}
        aliases={preferences.aliases}
        fallbackLabels={preferences.cachedDefaultLabels}
        autoSelect={preferences.columnMode === 'auto'}
        onApply={applyColumnDesign}
        onClose={() => setIsDesignerOpen(false)}
      />
    </section>
  )
}

export default TraceTable
