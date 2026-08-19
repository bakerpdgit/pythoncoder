import type { InspectorNode } from '../types'
import type {
  TraceBindingState,
  TraceCallId,
  TraceExecutionEvent,
  TraceSession,
  TraceSourceLocation,
  TraceTableColumnKey,
  TraceTableMetaColumnId,
  TraceVariableId,
  TraceWriteMarker,
} from '../types/traceTable'
import { traceBindingKey } from './traceLog'
import {
  isTraceTableMetaColumnId,
  traceTableVariableColumnKey,
  traceTableVariableIdFromColumnKey,
} from './traceTablePreferences'

export interface TraceTableProjectionOptions {
  /** Ordered source-variable columns selected by the user. */
  variableIds: TraceVariableId[]
  /** Ordered execution-context columns selected by the user. */
  metaColumnIds?: TraceTableMetaColumnId[]
  /** Authoritative mixed order when supplied; Step/Line remain fixed before it. */
  columnOrder?: TraceTableColumnKey[]
  /** When true, guarantee a sparse row for every completed source line. */
  showLine: boolean
}


export interface TraceTableProjectionMetadataColumn {
  id: TraceTableMetaColumnId
  label: string
}

export type TraceTableProjectionDisplayColumn =
  | { kind: 'variable'; key: TraceTableColumnKey; variableId: TraceVariableId; label: string }
  | { kind: 'metadata'; key: TraceTableMetaColumnId; metadataId: TraceTableMetaColumnId; label: string }

export interface TraceTableProjectionColumn {
  variableId: TraceVariableId
  label: string
}

export type TraceTableCellState = TraceBindingState

export interface TraceTableProjectionCell {
  variableId: TraceVariableId
  callId: TraceCallId | null
  sequence: number
  state: TraceTableCellState
  /** Convenience alias for renderers; present exactly when `state.status` is `value`. */
  value?: InspectorNode
  outcome: TraceWriteMarker['outcome']
  write: TraceWriteMarker
}

export interface TraceTableProjectionRowMetadata {
  /** Qualified when the activation catalogue is available. */
  functionName: string
  /** Module is depth 0, its direct callees are depth 1. */
  callDepth: number
  /** Monotonic identity of this invocation, distinct across recursive calls. */
  callId: TraceCallId
  /** One-based user-call ordinal; the module activation has no call number. */
  callNumber: number | null
}

export interface TraceTableProjectionRow {
  id: string
  /** First contributing event, useful as a stable sort and scroll anchor. */
  sequence: number
  /** All events represented by or packed into this row. */
  sequences: number[]
  /** Present in every-line mode; compact rows can span source lines. */
  line?: number
  location?: TraceSourceLocation
  /** Sparse by design: a missing selected variable is a blank table cell. */
  cells: Record<TraceVariableId, TraceTableProjectionCell>
  metadata: TraceTableProjectionRowMetadata
}

export interface TraceTableProjection {
  columns: TraceTableProjectionColumn[]
  metadataColumns: TraceTableProjectionMetadataColumn[]
  /** Configurable columns in their exact left-to-right order. */
  displayColumns: TraceTableProjectionDisplayColumn[]
  rows: TraceTableProjectionRow[]
}

function selectedIdsInOrder(variableIds: TraceVariableId[]): TraceVariableId[] {
  return [...new Set(variableIds)]
}

const META_COLUMN_LABELS: Record<TraceTableMetaColumnId, string> = {
  'meta:function': 'Function',
  'meta:call-depth': 'Call depth',
  'meta:call-number': 'Call #',
}

function selectedMetaIdsInOrder(metaColumnIds: TraceTableMetaColumnId[] = []): TraceTableMetaColumnId[] {
  return [...new Set(metaColumnIds)].filter(id => id in META_COLUMN_LABELS)
}

interface ProjectionMetadataContext {
  callNumbers: ReadonlyMap<TraceCallId, number>
}

function metadataContext(session: TraceSession): ProjectionMetadataContext {
  const moduleCallIds = new Set(session.events.flatMap(event => event.callStack.slice(0, 1)))
  const firstEventSequence = new Map<TraceCallId, number>()
  for (const event of session.events) {
    if (!firstEventSequence.has(event.callId)) firstEventSequence.set(event.callId, event.sequence)
  }
  const userCallIds = new Set<TraceCallId>()
  for (const activation of Object.values(session.calls)) {
    if (activation.parentId !== null && activation.depth > 0) userCallIds.add(activation.id)
  }
  for (const event of session.events) {
    for (const callId of event.callStack) if (!moduleCallIds.has(callId)) userCallIds.add(callId)
  }
  const ordered = [...userCallIds].sort((left, right) => {
    const leftActivation = session.calls[left]
    const rightActivation = session.calls[right]
    const leftSequence = leftActivation?.startedAtSequence ?? firstEventSequence.get(left) ?? Number.MAX_SAFE_INTEGER
    const rightSequence = rightActivation?.startedAtSequence ?? firstEventSequence.get(right) ?? Number.MAX_SAFE_INTEGER
    return leftSequence - rightSequence || left - right
  })
  return { callNumbers: new Map(ordered.map((callId, index) => [callId, index + 1])) }
}

function rowMetadata(
  session: TraceSession,
  event: TraceExecutionEvent,
  context: ProjectionMetadataContext,
): TraceTableProjectionRowMetadata {
  const activation = session.calls[event.callId]
  return {
    functionName: activation?.qualifiedName ?? event.functionName,
    callDepth: activation?.depth ?? Math.max(0, event.callStack.length - 1),
    callId: event.callId,
    callNumber: context.callNumbers.get(event.callId) ?? null,
  }
}

function sameCallStack(left: TraceCallId[] | undefined, right: TraceCallId[]): boolean {
  return left !== undefined
    && left.length === right.length
    && left.every((callId, index) => callId === right[index])
}

function cellFor(
  event: TraceExecutionEvent,
  write: TraceWriteMarker,
  bindings: ReadonlyMap<string, TraceBindingState>,
): TraceTableProjectionCell {
  const reconstructed = bindings.get(traceBindingKey(write))
  const state: TraceTableCellState = write.outcome === 'deleted'
    ? { status: 'deleted' }
    : write.value
      ? { status: 'value', value: write.value }
      : reconstructed ?? { status: 'out-of-scope' }

  return {
    variableId: write.variableId,
    callId: write.callId,
    sequence: event.sequence,
    state,
    ...(state.status === 'value' ? { value: state.value } : {}),
    outcome: write.outcome,
    write,
  }
}

function applyEventDeltas(bindings: Map<string, TraceBindingState>, event: TraceExecutionEvent): void {
  for (const delta of event.bindingDeltas) bindings.set(traceBindingKey(delta), delta.state)
}

function eventRow(
  session: TraceSession,
  event: TraceExecutionEvent,
  context: ProjectionMetadataContext,
  continuationWriteIndex?: number,
): TraceTableProjectionRow {
  const rowKind = event.kind === 'line-completed' ? 'line' : 'event'
  const continuation = continuationWriteIndex === undefined ? '' : `:${continuationWriteIndex}`
  return {
    id: `${session.id}:${rowKind}:${event.sequence}${continuation}`,
    sequence: event.sequence,
    sequences: [event.sequence],
    line: event.location.line,
    location: event.location,
    cells: {},
    metadata: rowMetadata(session, event, context),
  }
}

function compactRow(
  session: TraceSession,
  event: TraceExecutionEvent,
  context: ProjectionMetadataContext,
  writeIndex: number,
): TraceTableProjectionRow {
  return {
    id: `${session.id}:compact:${event.sequence}:${writeIndex}`,
    sequence: event.sequence,
    sequences: [],
    cells: {},
    metadata: rowMetadata(session, event, context),
  }
}

function appendSequence(row: TraceTableProjectionRow, sequence: number): void {
  if (row.sequences.at(-1) !== sequence) row.sequences.push(sequence)
}

function projectEveryLine(
  session: TraceSession,
  selected: ReadonlySet<TraceVariableId>,
  context: ProjectionMetadataContext,
): TraceTableProjectionRow[] {
  const bindings = new Map<string, TraceBindingState>()
  const rows: TraceTableProjectionRow[] = []

  for (const event of session.events) {
    applyEventDeltas(bindings, event)
    const selectedWrites = event.writes.filter(write => selected.has(write.variableId))
    // Every-line mode continues to mean one row per completed source line.
    // Lifecycle events only join it when they carry a selected parameter/write,
    // preserving the pre-metadata Step/Line semantics.
    if (event.kind !== 'line-completed' && selectedWrites.length === 0) continue

    let row = eventRow(session, event, context)
    selectedWrites.forEach((write, writeIndex) => {
      if (row.cells[write.variableId]) {
        rows.push(row)
        row = eventRow(session, event, context, writeIndex)
      }
      row.cells[write.variableId] = cellFor(event, write, bindings)
    })
    rows.push(row)
  }

  return rows
}

function projectCompact(
  session: TraceSession,
  selected: ReadonlySet<TraceVariableId>,
  includeMetadata: boolean,
  context: ProjectionMetadataContext,
): TraceTableProjectionRow[] {
  const bindings = new Map<string, TraceBindingState>()
  const rows: TraceTableProjectionRow[] = []
  let current: TraceTableProjectionRow | undefined
  let previousCallStack: TraceCallId[] | undefined

  for (const event of session.events) {
    applyEventDeltas(bindings, event)

    const lifecycleTransition = event.kind !== 'line-completed'
    const callStackTransition = previousCallStack !== undefined && !sameCallStack(previousCallStack, event.callStack)
    const regionBoundary = Boolean(event.loopIteration || lifecycleTransition || callStackTransition)
    if (regionBoundary) current = undefined

    if (includeMetadata && !current) {
      current = compactRow(session, event, context, 0)
      rows.push(current)
    }
    if (includeMetadata && current) appendSequence(current, event.sequence)

    event.writes.forEach((write, writeIndex) => {
      if (!selected.has(write.variableId)) return
      if (!current || current.cells[write.variableId]) {
        current = compactRow(session, event, context, writeIndex)
        rows.push(current)
      }
      current.cells[write.variableId] = cellFor(event, write, bindings)
      appendSequence(current, event.sequence)
    })

    previousCallStack = event.callStack
  }

  return rows
}

/**
 * Purely derives display rows from the complete session history. Re-running it
 * with newly selected columns therefore backfills those columns immediately.
 */
export function projectTraceTable(
  session: TraceSession,
  options: TraceTableProjectionOptions,
): TraceTableProjection {
  const fallbackColumnOrder: TraceTableColumnKey[] = [
    ...selectedIdsInOrder(options.variableIds).map(traceTableVariableColumnKey),
    ...selectedMetaIdsInOrder(options.metaColumnIds),
  ]
  const columnOrder = [...new Set(options.columnOrder ?? fallbackColumnOrder)].filter(key =>
    isTraceTableMetaColumnId(key) || traceTableVariableIdFromColumnKey(key) !== null,
  )
  const variableIds = selectedIdsInOrder(columnOrder.flatMap(key => {
    const id = traceTableVariableIdFromColumnKey(key)
    return id === null ? [] : [id]
  }))
  const metaColumnIds = selectedMetaIdsInOrder(columnOrder.filter(isTraceTableMetaColumnId))
  const selected = new Set(variableIds)
  const columns = variableIds.map(variableId => ({
    variableId,
    label: session.variables[variableId]?.defaultLabel ?? variableId,
  }))
  const metadataColumns = metaColumnIds.map(id => ({ id, label: META_COLUMN_LABELS[id] }))
  const displayColumns: TraceTableProjectionDisplayColumn[] = []
  for (const key of columnOrder) {
    if (isTraceTableMetaColumnId(key)) {
      displayColumns.push({ kind: 'metadata', key, metadataId: key, label: META_COLUMN_LABELS[key] })
      continue
    }
    const variableId = traceTableVariableIdFromColumnKey(key)
    if (variableId !== null) displayColumns.push({
      kind: 'variable',
      key,
      variableId,
      label: session.variables[variableId]?.defaultLabel ?? variableId,
    })
  }
  const context = metadataContext(session)

  return {
    columns,
    metadataColumns,
    displayColumns,
    rows: options.showLine
      ? projectEveryLine(session, selected, context)
      : projectCompact(session, selected, metaColumnIds.length > 0, context),
  }
}
