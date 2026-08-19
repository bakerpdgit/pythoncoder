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
  /**
   * Include concise teaching annotations and otherwise-hidden lifecycle rows.
   * Defaults to false so existing table packing remains backward compatible.
   */
  includeAnnotations?: boolean
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

export type TraceTableRowKind = 'line' | 'event' | 'continuation'

export type TraceTableRowAnnotationKind =
  | 'loop-iteration'
  | 'call-entered'
  | 'call-returned'
  | 'call-exception-exit'
  | 'exception'
  | 'input-completed'
  | 'generator-yielded'
  | 'generator-resumed'
  | 'continuation'

/**
 * Structured teaching context retained alongside a ready-to-render label.
 * Renderers can use `label` directly, while richer views can inspect the
 * event-specific value, exception, input, or loop identity without reparsing it.
 */
export interface TraceTableRowAnnotation {
  kind: TraceTableRowAnnotationKind
  sequence: number
  label: string
  functionName: string
  loopIteration?: TraceExecutionEvent['loopIteration']
  value?: InspectorNode
  exception?: TraceExecutionEvent['exception']
  inputValue?: string
  /** Zero-based index in the event's write list that began this overflow row. */
  continuationWriteIndex?: number
}

export interface TraceTableProjectionRow {
  id: string
  /** Distinguishes lifecycle-only and overflow rows from ordinary line rows. */
  kind: TraceTableRowKind
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
  /** Ordered, structured context contributed by events packed into this row. */
  annotations: TraceTableRowAnnotation[]
  /** One accessible teaching note, ready for a renderer to announce verbatim. */
  teachingNote: string | null
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

function inspectorSummary(value: InspectorNode | undefined): string | null {
  if (!value) return null
  if (value.summary) return conciseTeachingText(value.summary)
  if (value.kind === 'primitive') {
    if (typeof value.value === 'string') return conciseTeachingText(JSON.stringify(value.value))
    return conciseTeachingText(String(value.value))
  }
  return conciseTeachingText(value.type)
}

function exceptionSummary(exception: TraceExecutionEvent['exception']): string {
  if (!exception) return 'an exception'
  return conciseTeachingText(exception.message ? `${exception.type}: ${exception.message}` : exception.type)
}

const MAX_TEACHING_DETAIL_LENGTH = 96

function conciseTeachingText(value: string): string {
  return value.length <= MAX_TEACHING_DETAIL_LENGTH
    ? value
    : `${value.slice(0, MAX_TEACHING_DETAIL_LENGTH - 1)}…`
}

function loopLabel(loopId: string, iteration: number): string {
  const rawKind = loopId.split(':', 1)[0]?.toLowerCase()
  const kind = rawKind === 'for' ? 'For loop' : rawKind === 'while' ? 'While loop' : 'Loop'
  return `${kind} iteration ${iteration}.`
}

function callSuffix(metadata: TraceTableProjectionRowMetadata): string {
  return metadata.callNumber === null ? '' : ` (call #${metadata.callNumber})`
}

function annotationsForEvent(
  event: TraceExecutionEvent,
  metadata: TraceTableProjectionRowMetadata,
): TraceTableRowAnnotation[] {
  const annotations: TraceTableRowAnnotation[] = []
  const base = { sequence: event.sequence, functionName: metadata.functionName }

  if (event.loopIteration) {
    annotations.push({
      ...base,
      kind: 'loop-iteration',
      label: loopLabel(event.loopIteration.loopId, event.loopIteration.iteration),
      loopIteration: { ...event.loopIteration },
    })
  }

  switch (event.kind) {
    case 'call-entered':
      annotations.push({
        ...base,
        kind: 'call-entered',
        label: `Entered ${metadata.functionName}${callSuffix(metadata)}.`,
      })
      break
    case 'call-returned': {
      const value = inspectorSummary(event.returnValue)
      annotations.push({
        ...base,
        kind: 'call-returned',
        label: `Returned from ${metadata.functionName}${callSuffix(metadata)}${value === null ? '.' : ` with ${value}.`}`,
        value: event.returnValue,
      })
      break
    }
    case 'call-exception-exit':
      annotations.push({
        ...base,
        kind: 'call-exception-exit',
        label: `Left ${metadata.functionName}${callSuffix(metadata)} after ${exceptionSummary(event.exception)}.`,
        exception: event.exception,
      })
      break
    case 'exception':
      annotations.push({
        ...base,
        kind: 'exception',
        label: `${exceptionSummary(event.exception)} raised in ${metadata.functionName}.`,
        exception: event.exception,
      })
      break
    case 'input-completed':
      annotations.push({
        ...base,
        kind: 'input-completed',
        label: event.inputValue === undefined
          ? 'Input received.'
          : `Input received: ${conciseTeachingText(JSON.stringify(event.inputValue))}.`,
        inputValue: event.inputValue,
      })
      break
    case 'generator-yielded': {
      const value = inspectorSummary(event.returnValue)
      annotations.push({
        ...base,
        kind: 'generator-yielded',
        label: `${metadata.functionName} yielded${value === null ? '.' : ` ${value}.`}`,
        value: event.returnValue,
      })
      break
    }
    case 'generator-resumed':
      annotations.push({
        ...base,
        kind: 'generator-resumed',
        label: `Resumed ${metadata.functionName}.`,
      })
      break
    case 'line-completed':
      break
  }

  return annotations
}

function continuationAnnotation(
  event: TraceExecutionEvent,
  metadata: TraceTableProjectionRowMetadata,
  writeIndex: number,
): TraceTableRowAnnotation {
  return {
    kind: 'continuation',
    sequence: event.sequence,
    functionName: metadata.functionName,
    label: 'Continued values from the same execution event.',
    continuationWriteIndex: writeIndex,
  }
}

function updateTeachingNote(row: TraceTableProjectionRow): void {
  row.teachingNote = row.annotations.length === 0
    ? null
    : row.annotations.map(annotation => annotation.label).join(' ')
}

function appendAnnotations(row: TraceTableProjectionRow, annotations: TraceTableRowAnnotation[]): void {
  row.annotations.push(...annotations)
  updateTeachingNote(row)
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
    kind: continuationWriteIndex === undefined
      ? event.kind === 'line-completed' ? 'line' : 'event'
      : 'continuation',
    sequence: event.sequence,
    sequences: [event.sequence],
    line: event.location.line,
    location: event.location,
    cells: {},
    metadata: rowMetadata(session, event, context),
    annotations: [],
    teachingNote: null,
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
    kind: event.kind === 'line-completed' ? 'line' : 'event',
    sequence: event.sequence,
    sequences: [],
    cells: {},
    metadata: rowMetadata(session, event, context),
    annotations: [],
    teachingNote: null,
  }
}

function appendSequence(row: TraceTableProjectionRow, sequence: number): void {
  if (row.sequences.at(-1) !== sequence) row.sequences.push(sequence)
}

function projectEveryLine(
  session: TraceSession,
  selected: ReadonlySet<TraceVariableId>,
  context: ProjectionMetadataContext,
  includeAnnotations: boolean,
): TraceTableProjectionRow[] {
  const bindings = new Map<string, TraceBindingState>()
  const rows: TraceTableProjectionRow[] = []

  for (const event of session.events) {
    applyEventDeltas(bindings, event)
    const selectedWrites = event.writes.filter(write => selected.has(write.variableId))
    const metadata = rowMetadata(session, event, context)
    const annotations = includeAnnotations ? annotationsForEvent(event, metadata) : []
    // Every-line mode continues to mean one row per completed source line.
    // Lifecycle events only join it when they carry a selected parameter/write,
    // preserving the pre-metadata Step/Line semantics.
    if (event.kind !== 'line-completed' && selectedWrites.length === 0 && annotations.length === 0) continue

    let row = eventRow(session, event, context)
    appendAnnotations(row, annotations)
    selectedWrites.forEach((write, writeIndex) => {
      if (row.cells[write.variableId]) {
        rows.push(row)
        row = eventRow(session, event, context, writeIndex)
        if (includeAnnotations) appendAnnotations(row, [continuationAnnotation(event, row.metadata, writeIndex)])
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
  includeAnnotations: boolean,
): TraceTableProjectionRow[] {
  const bindings = new Map<string, TraceBindingState>()
  const rows: TraceTableProjectionRow[] = []
  let current: TraceTableProjectionRow | undefined
  let previousCallStack: TraceCallId[] | undefined

  for (const event of session.events) {
    applyEventDeltas(bindings, event)
    const metadata = rowMetadata(session, event, context)
    const annotations = includeAnnotations ? annotationsForEvent(event, metadata) : []

    const lifecycleTransition = event.kind !== 'line-completed'
    const callStackTransition = previousCallStack !== undefined && !sameCallStack(previousCallStack, event.callStack)
    const regionBoundary = Boolean(event.loopIteration || lifecycleTransition || callStackTransition)
    if (regionBoundary) current = undefined

    if ((includeMetadata || annotations.length > 0) && !current) {
      current = compactRow(session, event, context, 0)
      rows.push(current)
    }
    if ((includeMetadata || annotations.length > 0) && current) appendSequence(current, event.sequence)
    if (current && annotations.length > 0) appendAnnotations(current, annotations)

    let selectedWritesPlaced = 0
    event.writes.forEach((write, writeIndex) => {
      if (!selected.has(write.variableId)) return
      if (!current || current.cells[write.variableId]) {
        current = compactRow(session, event, context, writeIndex)
        if (selectedWritesPlaced > 0) {
          current.kind = 'continuation'
          if (includeAnnotations) appendAnnotations(current, [continuationAnnotation(event, current.metadata, writeIndex)])
        }
        rows.push(current)
      }
      current.cells[write.variableId] = cellFor(event, write, bindings)
      appendSequence(current, event.sequence)
      selectedWritesPlaced += 1
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
      ? projectEveryLine(session, selected, context, options.includeAnnotations ?? false)
      : projectCompact(session, selected, metaColumnIds.length > 0, context, options.includeAnnotations ?? false),
  }
}
