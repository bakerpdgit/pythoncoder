import { useEffect, useMemo, useState } from 'react'
import type { TraceSession, TraceTablePreferences } from '../../types/traceTable'
import { getBaseFileStem, triggerDownload } from '../../utils/download'
import {
  projectTraceTable,
} from '../../utils/traceTableProjection'
import {
  deriveTraceTableFilterOptions,
  exportTraceTableCsv,
  filterTraceTableRows,
  formatTraceTableInspectorSummary,
  formatTraceTableLeadingCell,
  formatTraceTableMetadata,
} from '../../utils/traceTableExport'
import {
  getStoredTraceTablePreferences,
  persistTraceTablePreferences,
  refreshTraceTableCachedLabels,
  resolveTraceTableColumnOrder,
  resolveTraceTableColumnIds,
  resolveTraceTableColumnLabel,
  resolveTraceTableMetaColumnIds,
  resolveTraceTableMetaColumnLabel,
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

/** A compact, teaching-oriented history of writes captured in a trace session. */
export const TraceTable = ({ session }: TraceTableProps) => {
  const preferenceKey = traceTablePreferenceStorageKey(session.source)
  const [preferences, setPreferences] = useState<TraceTablePreferences>(
    () => refreshTraceTableCachedLabels(getStoredTraceTablePreferences(session.source), session.variables),
  )
  const [isDesignerOpen, setIsDesignerOpen] = useState(false)
  const [showContext, setShowContext] = useState(true)
  const [functionFilter, setFunctionFilter] = useState('')
  const [callFilter, setCallFilter] = useState('')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    const restored = refreshTraceTableCachedLabels(getStoredTraceTablePreferences(session.source), session.variables)
    setPreferences(restored)
    persistTraceTablePreferences(session.source, restored)
    setFunctionFilter('')
    setCallFilter('')
    setCopyStatus('idle')
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

  const displayedColumnOrder = useMemo(
    () => resolveTraceTableColumnOrder(preferences, session.variables),
    [preferences, session.variables],
  )
  const displayedVariableIds = useMemo(
    () => resolveTraceTableColumnIds(preferences, session.variables),
    [preferences, session.variables],
  )
  const displayedMetaColumnIds = useMemo(
    () => resolveTraceTableMetaColumnIds(preferences, session.variables),
    [preferences, session.variables],
  )
  const projection = useMemo(
    () => projectTraceTable(session, {
      variableIds: displayedVariableIds,
      metaColumnIds: displayedMetaColumnIds,
      columnOrder: displayedColumnOrder,
      showLine: preferences.rowMode === 'every-line',
      includeAnnotations: showContext,
    }),
    [displayedColumnOrder, displayedMetaColumnIds, displayedVariableIds, preferences.rowMode, session, showContext],
  )
  const filterOptions = useMemo(() => deriveTraceTableFilterOptions(projection), [projection])
  const visibleCallOptions = useMemo(
    () => functionFilter
      ? filterOptions.callNumbers.filter(option => option.functionName === functionFilter)
      : filterOptions.callNumbers,
    [filterOptions.callNumbers, functionFilter],
  )
  const visibleRows = useMemo(() => filterTraceTableRows(projection.rows, {
    ...(functionFilter ? { functionName: functionFilter } : {}),
    ...(callFilter ? { callNumber: Number(callFilter) } : {}),
  }), [callFilter, functionFilter, projection.rows])

  useEffect(() => {
    if (functionFilter && !filterOptions.functions.some(option => option.value === functionFilter)) {
      setFunctionFilter('')
    }
  }, [filterOptions.functions, functionFilter])

  useEffect(() => {
    if (!callFilter) return
    const selectedCall = filterOptions.callNumbers.find(option => option.value === Number(callFilter))
    if (!selectedCall || (functionFilter && selectedCall.functionName !== functionFilter)) setCallFilter('')
  }, [callFilter, filterOptions.callNumbers, functionFilter])
  const availableVariables = useMemo(
    () => Object.values(session.variables)
      .sort((a, b) => a.firstSeenSequence - b.firstSeenSequence || a.defaultLabel.localeCompare(b.defaultLabel)),
    [session.variables],
  )
  const labelFor = (variableId: string) => resolveTraceTableColumnLabel(preferences, variableId, session.variables)
  const labelForDisplayColumn = (column: (typeof projection.displayColumns)[number]) => column.kind === 'metadata'
    ? resolveTraceTableMetaColumnLabel(preferences, column.metadataId)
    : labelFor(column.variableId)

  const setRowMode = (rowMode: TraceTablePreferences['rowMode']) => updatePreferences({ ...preferences, rowMode })
  const applyColumnDesign = (result: TraceTableColumnDesignerResult) => {
    updatePreferences(refreshTraceTableCachedLabels({
      ...preferences,
      columnMode: result.autoSelect ? 'auto' : 'custom',
      variableIds: result.variableIds,
      metaColumnIds: result.metaColumnIds,
      columnOrder: result.columnOrder,
      aliases: result.aliases,
    }, session.variables))
    setIsDesignerOpen(false)
  }

  const csvForVisibleRows = () => exportTraceTableCsv(projection, {
    rows: visibleRows,
    leadingColumn: preferences.rowMode === 'every-line' ? 'line' : 'step',
    includeTeachingNote: showContext,
    resolveColumnLabel: labelForDisplayColumn,
  })

  const downloadCsv = () => {
    const fileName = session.source.path.split('/').at(-1) ?? session.source.path
    triggerDownload(`${getBaseFileStem(fileName, 'trace')}-trace.csv`, csvForVisibleRows(), 'text/csv;charset=utf-8')
  }

  const copyCsv = async () => {
    try {
      await navigator.clipboard.writeText(csvForVisibleRows())
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
  }

  const eventCount = session.events.length
  const rowCount = visibleRows.length
  const totalRowCount = projection.rows.length
  const hasTableData = projection.displayColumns.length > 0 && totalRowCount > 0

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-slate-700 bg-slate-900/60" aria-labelledby="trace-table-title">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 id="trace-table-title" className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Trace table</h2>
            <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">{SESSION_STATUS_LABELS[session.status]}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500" aria-live="polite">
            {eventCount} {eventCount === 1 ? 'event' : 'events'} · {rowCount !== totalRowCount ? `${rowCount} of ${totalRowCount}` : rowCount} {totalRowCount === 1 ? 'row' : 'rows'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={() => setIsDesignerOpen(true)}
            className="rounded-md border border-slate-600 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-sky-500 hover:text-sky-100">
            Columns ({projection.displayColumns.length})
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

      {projection.displayColumns.length > 0 && eventCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-950/40 px-3 py-2">
          <label className="sr-only" htmlFor="trace-table-function-filter">Filter trace rows by function</label>
          <select
            id="trace-table-function-filter"
            value={functionFilter}
            onChange={event => {
              const nextFunction = event.target.value
              setFunctionFilter(nextFunction)
              if (callFilter) {
                const selectedCall = filterOptions.callNumbers.find(option => option.value === Number(callFilter))
                if (nextFunction && selectedCall?.functionName !== nextFunction) setCallFilter('')
              }
            }}
            className="max-w-48 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
          >
            <option value="">All functions</option>
            {filterOptions.functions.map(option => (
              <option key={option.value} value={option.value}>{option.label} ({option.rowCount})</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="trace-table-call-filter">Filter trace rows by call</label>
          <select
            id="trace-table-call-filter"
            value={callFilter}
            onChange={event => setCallFilter(event.target.value)}
            className="max-w-52 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
          >
            <option value="">All calls</option>
            {visibleCallOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label} ({option.rowCount})</option>
            ))}
          </select>
          {(functionFilter || callFilter) && (
            <button type="button" onClick={() => { setFunctionFilter(''); setCallFilter('') }}
              className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700/60 hover:text-slate-200">
              Clear filters
            </button>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              aria-pressed={showContext}
              title="Show loop, call, return, exception, and input notes"
              onClick={() => setShowContext(current => !current)}
              className={`rounded-md border px-2 py-1 text-xs font-medium ${showContext ? 'border-sky-500 bg-sky-500/10 text-sky-100' : 'border-slate-600 text-slate-400 hover:text-slate-200'}`}
            >
              Context
            </button>
            <button type="button" onClick={downloadCsv}
              className="rounded-md border border-slate-600 px-2 py-1 text-xs font-medium text-slate-200 hover:border-sky-500 hover:text-sky-100">
              Download CSV
            </button>
            <button type="button" onClick={() => void copyCsv()}
              className="rounded-md border border-slate-600 px-2 py-1 text-xs font-medium text-slate-200 hover:border-sky-500 hover:text-sky-100">
              Copy CSV
            </button>
          </div>
          <span
            className={`text-xs ${copyStatus === 'failed' ? 'text-red-200' : 'text-emerald-300'}`}
            role="status"
            aria-live="polite"
          >
            {copyStatus === 'copied' ? 'Trace table CSV copied.' : copyStatus === 'failed' ? 'Could not copy trace table CSV.' : ''}
          </span>
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
                {projection.displayColumns.map(column => (
                  <th key={column.key} scope="col" className="sticky top-0 z-10 border-b border-slate-700 bg-slate-900 px-3 py-2 font-semibold text-slate-300">
                    {column.kind === 'metadata'
                      ? resolveTraceTableMetaColumnLabel(preferences, column.metadataId)
                      : labelFor(column.variableId)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rowIndex) => (
                <tr key={row.id} className={rowIndex % 2 === 0 ? 'bg-slate-800/40' : undefined}>
                  <th scope="row" title={`Trace ${row.sequences.length === 1 ? 'event' : 'events'} ${row.sequences.join(', ')}`}
                    className="max-w-64 border-b border-r border-slate-700/60 px-3 py-2 font-medium text-slate-400">
                    <span className="block whitespace-nowrap">{formatTraceTableLeadingCell(row, preferences.rowMode === 'every-line' ? 'line' : 'step', rowIndex)}</span>
                    {showContext && row.teachingNote && (
                      <span className="trace-table-teaching-note mt-0.5 block max-w-60 text-[10px] font-normal leading-snug text-amber-300">{row.teachingNote}</span>
                    )}
                  </th>
                  {projection.displayColumns.map(column => {
                    if (column.kind === 'metadata') {
                      const value = formatTraceTableMetadata(row, column.metadataId)
                      return (
                        <td key={column.key} className="whitespace-nowrap border-b border-slate-700/60 px-3 py-2 font-medium text-sky-100">
                          {value}
                        </td>
                      )
                    }
                    const cell = row.cells[column.variableId]
                    const columnLabel = labelFor(column.variableId)
                    if (!cell || cell.state.status === 'out-of-scope') {
                      return <td key={column.variableId} className="border-b border-slate-700/60 px-3 py-2" aria-label={`${columnLabel}: no write`} />
                    }
                    if (cell.state.status === 'deleted') {
                      return <td key={column.variableId} className="border-b border-slate-700/60 px-3 py-2 font-medium text-red-200">Deleted</td>
                    }
                    return (
                      <td key={column.variableId} className="max-w-64 border-b border-slate-700/60 px-3 py-2 text-emerald-300" title={formatTraceTableInspectorSummary(cell.state.value)}>
                        <span className="block truncate">{formatTraceTableInspectorSummary(cell.state.value)}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={projection.displayColumns.length + 1} className="px-4 py-8 text-center text-sm text-slate-500">
                    No trace rows match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-500" role="status">
          <div>
            <p>{projection.displayColumns.length === 0 && preferences.columnMode === 'custom'
              ? 'Choose columns to add variables to this trace table.'
              : eventCount === 0
                ? 'Run code to capture trace events.'
                : 'No variable writes were captured for this trace.'}</p>
            {projection.displayColumns.length === 0 && preferences.columnMode === 'custom' && (
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
        selectedColumnOrder={displayedColumnOrder}
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
