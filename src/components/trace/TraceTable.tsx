import { useEffect, useMemo, useRef, useState } from 'react'
import type { InspectorNode } from '../../types'
import type { TraceSession, TraceTableColumnKey, TraceTablePreferences, TraceVariableId } from '../../types/traceTable'
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
  isTraceTableMetaColumnId,
  traceTablePreferenceStorageKey,
  traceTableVariableColumnKey,
} from '../../utils/traceTablePreferences'
import { TraceTableColumnDesigner, type TraceTableColumnDesignerResult } from './TraceTableColumnDesigner'
import { TraceTableQuickAddDialog } from './TraceTableQuickAddDialog'

const TRACE_TABLE_ROW_CHUNK_SIZE = 200
const MIN_TRACE_COLUMN_WIDTH = 96
const MAX_TRACE_COLUMN_WIDTH = 480
const DEFAULT_TRACE_COLUMN_WIDTH = 160
const MAX_TRACE_DISPLAY_DEPTH = 6

const inspectorChildren = (node: InspectorNode): Array<{ label: string; value: InspectorNode }> => {
  if (node.kind === 'sequence') return node.items ?? []
  if (node.kind === 'object') return node.attrs ?? []
  if (node.kind === 'mapping' || node.kind === 'scope') return node.entries ?? []
  return []
}

const inspectorDepth = (node: InspectorNode): number => {
  const children = inspectorChildren(node)
  if (children.length === 0) return 0
  return Math.min(MAX_TRACE_DISPLAY_DEPTH, 1 + Math.max(...children.map(child => inspectorDepth(child.value))))
}

const formatInspectorAtDepth = (node: InspectorNode, depth: number): string => {
  const summary = formatTraceTableInspectorSummary(node)
  const children = inspectorChildren(node)
  if (depth <= 0 || children.length === 0) return summary
  const contents = children.map(child => `${child.label}: ${formatInspectorAtDepth(child.value, depth - 1)}`)
  if (node.truncated) contents.push('…')
  if (node.kind === 'sequence') return `${node.type} [${contents.map(value => value.replace(/^[^:]+:\s*/, '')).join(', ')}]`
  return `${node.type} {${contents.join(', ')}}`
}

const pinMetadataColumns = (order: TraceTableColumnKey[]): TraceTableColumnKey[] => [
  ...order.filter(isTraceTableMetaColumnId),
  ...order.filter(key => !isTraceTableMetaColumnId(key)),
]

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
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false)
  const [showContext, setShowContext] = useState(true)
  const [functionFilter, setFunctionFilter] = useState('')
  const [callFilter, setCallFilter] = useState('')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [renderedRowLimit, setRenderedRowLimit] = useState(TRACE_TABLE_ROW_CHUNK_SIZE)
  const [draggedVariableId, setDraggedVariableId] = useState<TraceVariableId | null>(null)
  const [followLatest, setFollowLatest] = useState(
    session.status === 'recording' || session.status === 'paused',
  )
  const [frozenTailEnd, setFrozenTailEnd] = useState<number | null>(null)
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const quickAddOpenerRef = useRef<HTMLButtonElement | null>(null)
  const quickAddVisibleButtonRef = useRef<HTMLButtonElement | null>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => resizeCleanupRef.current?.(), [])

  useEffect(() => {
    const restored = refreshTraceTableCachedLabels(getStoredTraceTablePreferences(session.source), session.variables)
    setPreferences(restored)
    persistTraceTablePreferences(session.source, restored)
    setFunctionFilter('')
    setCallFilter('')
    setCopyStatus('idle')
    setFollowLatest(session.status === 'recording' || session.status === 'paused')
    setFrozenTailEnd(null)
  // A new same-source session reloads the automatic reset persisted by startTraceWorker.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferenceKey, session.id])

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
    () => pinMetadataColumns(resolveTraceTableColumnOrder(preferences, session.variables)),
    [preferences.columnMode, preferences.columnOrder, preferences.metaColumnIds, preferences.variableIds, session.variables],
  )
  const displayedColumnOrderKey = displayedColumnOrder.join('\u0000')
  const displayedVariableIds = useMemo(
    () => resolveTraceTableColumnIds(preferences, session.variables),
    [preferences.columnMode, preferences.columnOrder, preferences.metaColumnIds, preferences.variableIds, session.variables],
  )
  const displayedMetaColumnIds = useMemo(
    () => resolveTraceTableMetaColumnIds(preferences, session.variables),
    [preferences.columnMode, preferences.columnOrder, preferences.metaColumnIds, preferences.variableIds, session.variables],
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
  const isTraceActive = session.status === 'recording' || session.status === 'paused'
  const followsTail = followLatest
  const renderedRowEnd = followsTail ? visibleRows.length : Math.min(frozenTailEnd ?? renderedRowLimit, visibleRows.length)
  const renderedRowOffset = Math.max(0, renderedRowEnd - renderedRowLimit)
  // Keep `visibleRows` authoritative for counts and export; only cap the DOM work.
  const renderedRows = useMemo(
    () => visibleRows.slice(renderedRowOffset, renderedRowEnd),
    [renderedRowEnd, renderedRowOffset, visibleRows],
  )

  const maximumDepthByVariable = useMemo(() => {
    const depths: Record<TraceVariableId, number> = {}
    for (const row of projection.rows) {
      for (const variableId of displayedVariableIds) {
        const cell = row.cells[variableId]
        if (cell?.state.status !== 'value') continue
        depths[variableId] = Math.max(depths[variableId] ?? 0, inspectorDepth(cell.state.value))
      }
    }
    return depths
  }, [displayedVariableIds, projection.rows])

  useEffect(() => {
    setRenderedRowLimit(TRACE_TABLE_ROW_CHUNK_SIZE)
    setFollowLatest(session.status === 'recording' || session.status === 'paused')
    setFrozenTailEnd(null)
  }, [callFilter, displayedColumnOrderKey, functionFilter, preferenceKey, preferences.rowMode, showContext])

  useEffect(() => {
    if (!followsTail) return
    const frame = requestAnimationFrame(() => {
      const container = tableScrollRef.current
      if (container) container.scrollTop = container.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [followsTail, renderedRows.length, visibleRows.length])

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
  const quickAddVariables = useMemo(
    () => availableVariables.filter(variable => !displayedVariableIds.includes(variable.id)),
    [availableVariables, displayedVariableIds],
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
      columnWidths: result.columnWidths,
      displayDepths: result.displayDepths,
    }, session.variables))
    setIsDesignerOpen(false)
  }

  const customiseVariableOrder = (variableIds: TraceVariableId[], aliases = preferences.aliases) => {
    const metadataOrder = displayedColumnOrder.filter(isTraceTableMetaColumnId)
    updatePreferences(refreshTraceTableCachedLabels({
      ...preferences,
      columnMode: 'custom',
      variableIds,
      metaColumnIds: metadataOrder,
      columnOrder: [...metadataOrder, ...variableIds.map(traceTableVariableColumnKey)],
      aliases,
    }, session.variables))
  }

  const reorderVariable = (sourceId: TraceVariableId, targetId: TraceVariableId) => {
    if (sourceId === targetId) return
    const next = [...displayedVariableIds]
    const sourceIndex = next.indexOf(sourceId)
    const targetIndex = next.indexOf(targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    next.splice(sourceIndex, 1)
    next.splice(targetIndex, 0, sourceId)
    customiseVariableOrder(next)
  }

  const removeVariable = (variableId: TraceVariableId) => {
    const aliases = { ...preferences.aliases }
    delete aliases[traceTableVariableColumnKey(variableId)]
    delete aliases[variableId]
    customiseVariableOrder(displayedVariableIds.filter(id => id !== variableId), aliases)
  }

  const quickAddVariable = (variableId: TraceVariableId, headerLabel: string) => {
    const variable = session.variables[variableId]
    if (!variable) return
    const aliases = { ...preferences.aliases }
    if (headerLabel.trim() && headerLabel.trim() !== variable.defaultLabel) {
      aliases[traceTableVariableColumnKey(variableId)] = headerLabel.trim()
    }
    const opener = quickAddOpenerRef.current
    opener?.focus()
    customiseVariableOrder([...displayedVariableIds, variableId], aliases)
    setIsQuickAddOpen(false)
    // Adding from the empty state replaces its opener with the table's trailing +.
    requestAnimationFrame(() => {
      if (!document.activeElement || document.activeElement === document.body) quickAddVisibleButtonRef.current?.focus()
    })
  }

  const closeQuickAdd = () => {
    // The opener remains mounted on cancel/Escape, so restore focus before the modal unmounts.
    quickAddOpenerRef.current?.focus()
    setIsQuickAddOpen(false)
  }

  const openQuickAdd = (opener: HTMLButtonElement) => {
    quickAddOpenerRef.current = opener
    setIsQuickAddOpen(true)
  }

  const setDisplayDepth = (variableId: TraceVariableId, depth: number) => updatePreferences({
    ...preferences,
    displayDepths: {
      ...preferences.displayDepths,
      [variableId]: Math.max(0, Math.min(MAX_TRACE_DISPLAY_DEPTH, depth)),
    },
  })

  const setColumnWidth = (columnKey: TraceTableColumnKey, width: number, persist = true) => {
    const next = {
      ...preferences,
      columnWidths: {
        ...preferences.columnWidths,
        [columnKey]: Math.max(MIN_TRACE_COLUMN_WIDTH, Math.min(MAX_TRACE_COLUMN_WIDTH, Math.round(width))),
      },
    }
    setPreferences(next)
    if (persist) persistTraceTablePreferences(session.source, next)
  }

  const startColumnResize = (columnKey: TraceTableColumnKey, event: React.MouseEvent) => {
    resizeCleanupRef.current?.()
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const measuredWidth = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0
    const startWidth = preferences.columnWidths[columnKey]
      ?? (measuredWidth >= MIN_TRACE_COLUMN_WIDTH ? measuredWidth : DEFAULT_TRACE_COLUMN_WIDTH)
    let finalWidth = startWidth
    const move = (moveEvent: MouseEvent) => {
      finalWidth = startWidth + moveEvent.clientX - startX
      setColumnWidth(columnKey, finalWidth, false)
    }
    const cleanup = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', stop)
      resizeCleanupRef.current = null
    }
    const stop = () => {
      cleanup()
      setColumnWidth(columnKey, finalWidth)
    }
    resizeCleanupRef.current = cleanup
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', stop, { once: true })
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
        <div
          className={`border-b px-3 py-1.5 text-xs ${session.status === 'limit-reached'
            ? 'border-sky-700/50 bg-sky-500/10 text-sky-100'
            : 'border-red-900/50 bg-red-900/50 text-red-200'}`}
          role={session.status === 'limit-reached' ? 'status' : 'alert'}
        >
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
        <div
          ref={tableScrollRef}
          className="min-h-0 flex-1 overflow-auto"
          tabIndex={0}
          aria-label="Trace table results"
          onScroll={event => {
            if (!followsTail) return
            const element = event.currentTarget
            if (element.scrollHeight - element.scrollTop - element.clientHeight > 32) {
              setFrozenTailEnd(visibleRows.length)
              setFollowLatest(false)
            }
          }}
        >
          <table className="w-full min-w-max border-separate border-spacing-0 text-left text-xs" aria-label="Trace event history">
            <thead>
              <tr>
                <th scope="col" className="sticky top-0 z-10 border-b border-r border-slate-700 bg-slate-900 px-3 py-2 font-semibold text-slate-300">
                  {preferences.rowMode === 'every-line' ? 'Line' : 'Step'}
                </th>
                {projection.displayColumns.map(column => {
                  const label = column.kind === 'metadata'
                    ? resolveTraceTableMetaColumnLabel(preferences, column.metadataId)
                    : labelFor(column.variableId)
                  const width = preferences.columnWidths[column.key] ?? DEFAULT_TRACE_COLUMN_WIDTH
                  const variableDepth = column.kind === 'variable' ? preferences.displayDepths[column.variableId] ?? 0 : 0
                  const maximumDepth = column.kind === 'variable' ? maximumDepthByVariable[column.variableId] ?? 0 : 0
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-label={label}
                      data-pinned={column.kind === 'metadata' ? 'true' : undefined}
                      draggable={column.kind === 'variable'}
                      onDragStart={event => {
                        if (column.kind !== 'variable') return
                        setDraggedVariableId(column.variableId)
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', column.variableId)
                      }}
                      onDragEnd={() => setDraggedVariableId(null)}
                      onDragOver={event => {
                        if (column.kind === 'variable') event.preventDefault()
                      }}
                      onDrop={event => {
                        if (column.kind !== 'variable') return
                        event.preventDefault()
                        const sourceId = draggedVariableId || event.dataTransfer.getData('text/plain')
                        if (sourceId) reorderVariable(sourceId, column.variableId)
                        setDraggedVariableId(null)
                      }}
                      title={column.kind === 'variable' ? 'Drag horizontally to reorder this variable column.' : 'Special column pinned to the left.'}
                      style={{ width, minWidth: width, maxWidth: width }}
                      className={`relative sticky top-0 z-10 border-b border-slate-700 bg-slate-900 px-3 py-2 font-semibold text-slate-300 ${draggedVariableId === (column.kind === 'variable' ? column.variableId : null) ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{label}</span>
                        {column.kind === 'variable' && (
                          <button
                            type="button"
                            aria-label={`Remove ${label}`}
                            title={`Remove ${label} from the trace table`}
                            onClick={() => removeVariable(column.variableId)}
                            className="shrink-0 rounded px-1 text-sm font-normal text-slate-500 hover:bg-slate-700 hover:text-red-200"
                          >×</button>
                        )}
                      </div>
                      {column.kind === 'variable' && maximumDepth > 0 && (
                        <div className="mt-1 flex gap-1 text-[10px] font-normal">
                          {variableDepth > 0 && (
                            <button type="button" aria-label={`Contract ${label}`} onClick={() => setDisplayDepth(column.variableId, variableDepth - 1)} className="rounded px-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200">Contract</button>
                          )}
                          {variableDepth < maximumDepth && (
                            <button type="button" aria-label={`Expand ${label}`} onClick={() => setDisplayDepth(column.variableId, variableDepth + 1)} className="rounded px-1 text-sky-100 hover:bg-slate-700">Expand</button>
                          )}
                        </div>
                      )}
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${label} column`}
                        aria-valuemin={MIN_TRACE_COLUMN_WIDTH}
                        aria-valuemax={MAX_TRACE_COLUMN_WIDTH}
                        aria-valuenow={width}
                        tabIndex={0}
                        onMouseDown={event => startColumnResize(column.key, event)}
                        onClick={event => event.currentTarget.focus()}
                        onKeyDown={event => {
                          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                          event.preventDefault()
                          setColumnWidth(column.key, width + (event.key === 'ArrowRight' ? 16 : -16))
                        }}
                        className="absolute inset-y-0 right-0 w-2 cursor-col-resize border-r border-transparent hover:border-sky-400 focus:border-sky-400 focus:outline-none"
                      />
                    </th>
                  )
                })}
                <th scope="col" aria-label="Add variable column" className="sticky top-0 z-10 w-10 border-b border-slate-700 bg-slate-900 px-2 py-2 text-center">
                  <button ref={quickAddVisibleButtonRef} type="button" aria-label="Add variable column" title="Quickly add a variable column" onClick={event => openQuickAdd(event.currentTarget)} className="rounded px-2 py-1 text-base font-medium text-sky-100 hover:bg-slate-700">+</button>
                </th>
              </tr>
            </thead>
            <tbody>
              {renderedRows.map((row, rowIndex) => (
                <tr key={row.id} className={rowIndex % 2 === 0 ? 'bg-slate-800/40' : undefined}>
                  <th scope="row" title={`Trace ${row.sequences.length === 1 ? 'event' : 'events'} ${row.sequences.join(', ')}`}
                    className="max-w-64 border-b border-r border-slate-700/60 px-3 py-2 font-medium text-slate-400">
                    <span className="block whitespace-nowrap">{formatTraceTableLeadingCell(row, preferences.rowMode === 'every-line' ? 'line' : 'step', renderedRowOffset + rowIndex)}</span>
                    {showContext && row.teachingNote && (
                      <span className="trace-table-teaching-note mt-0.5 block max-w-60 text-[10px] font-normal leading-snug text-amber-300">{row.teachingNote}</span>
                    )}
                  </th>
                  {projection.displayColumns.map(column => {
                    if (column.kind === 'metadata') {
                      const value = formatTraceTableMetadata(row, column.metadataId)
                      return (
                        <td key={column.key} style={{ width: preferences.columnWidths[column.key], maxWidth: preferences.columnWidths[column.key] }} className="whitespace-nowrap border-b border-slate-700/60 px-3 py-2 font-medium text-sky-100">
                          {value}
                        </td>
                      )
                    }
                    const cell = row.cells[column.variableId]
                    const columnLabel = labelFor(column.variableId)
                    if (!cell || cell.state.status === 'out-of-scope') {
                      return <td key={column.variableId} style={{ width: preferences.columnWidths[column.key], maxWidth: preferences.columnWidths[column.key] }} className="border-b border-slate-700/60 px-3 py-2" aria-label={`${columnLabel}: no write`} />
                    }
                    if (cell.state.status === 'deleted') {
                      return <td key={column.variableId} style={{ width: preferences.columnWidths[column.key], maxWidth: preferences.columnWidths[column.key] }} className="border-b border-slate-700/60 px-3 py-2 font-medium text-red-200">Deleted</td>
                    }
                    return (
                      <td key={column.variableId} style={{ width: preferences.columnWidths[column.key], maxWidth: preferences.columnWidths[column.key] }} className="max-w-64 border-b border-slate-700/60 px-3 py-2 text-emerald-300" title={formatTraceTableInspectorSummary(cell.state.value)}>
                        <span className="block break-words">{formatInspectorAtDepth(cell.state.value, preferences.displayDepths[column.variableId] ?? 0)}</span>
                      </td>
                    )
                  })}
                  <td aria-hidden="true" className="w-10 border-b border-slate-700/60" />
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={projection.displayColumns.length + 2} className="px-4 py-8 text-center text-sm text-slate-500">
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
              <div className="mt-3 flex justify-center gap-2">
                <button ref={quickAddVisibleButtonRef} type="button" onClick={event => openQuickAdd(event.currentTarget)} className="rounded-md border border-sky-600 px-3 py-1.5 text-xs font-medium text-sky-100 hover:bg-sky-500/10">
                  Add variable
                </button>
                <button type="button" onClick={() => setIsDesignerOpen(true)} className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-500 hover:text-sky-100">
                  Open column designer
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {hasTableData && visibleRows.length > TRACE_TABLE_ROW_CHUNK_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 bg-slate-950/40 px-3 py-2">
          <p className="text-xs text-slate-400" role="status" aria-live="polite">
            Showing {followsTail ? 'latest ' : ''}{renderedRows.length.toLocaleString()} of {visibleRows.length.toLocaleString()} matching rows.
          </p>
          <div className="flex items-center gap-2">
            {isTraceActive && (
              <button
                type="button"
                aria-pressed={followLatest}
                onClick={() => {
                  if (followLatest) {
                    setFrozenTailEnd(visibleRows.length)
                    setFollowLatest(false)
                  } else {
                    setFrozenTailEnd(null)
                    setFollowLatest(true)
                  }
                }}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${followLatest ? 'border-sky-500 bg-sky-500/10 text-sky-100' : 'border-slate-600 text-slate-300 hover:border-sky-500'}`}
              >
                Follow newest
              </button>
            )}
            {renderedRows.length < visibleRows.length && (
            <button
              type="button"
              onClick={() => setRenderedRowLimit(current => current + TRACE_TABLE_ROW_CHUNK_SIZE)}
              className="rounded-md border border-slate-600 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-sky-500 hover:text-sky-100"
            >
              Show {Math.min(TRACE_TABLE_ROW_CHUNK_SIZE, visibleRows.length - renderedRows.length).toLocaleString()} {followsTail ? 'earlier' : 'more'} rows
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
        columnWidths={preferences.columnWidths}
        displayDepths={preferences.displayDepths}
        fallbackLabels={preferences.cachedDefaultLabels}
        autoSelect={preferences.columnMode === 'auto'}
        onApply={applyColumnDesign}
        onClose={() => setIsDesignerOpen(false)}
      />
      <TraceTableQuickAddDialog
        open={isQuickAddOpen}
        availableVariables={quickAddVariables}
        onAdd={quickAddVariable}
        onClose={closeQuickAdd}
      />
    </section>
  )
}

export default TraceTable
