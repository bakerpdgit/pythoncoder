import type { InspectorNode } from '../types'
import type {
  TraceBindingState,
  TraceCallId,
  TraceExecutionEvent,
  TraceSession,
  TraceSourceLocation,
  TraceVariableId,
  TraceWriteMarker,
} from '../types/traceTable'
import { traceBindingKey } from './traceLog'

export interface TraceTableProjectionOptions {
  /** Ordered source-variable columns selected by the user. */
  variableIds: TraceVariableId[]
  /** When true, guarantee a sparse row for every completed source line. */
  showLine: boolean
}

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
  /** Reserved for later row annotations without changing the projection shape. */
  [key: string]: unknown
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
  rows: TraceTableProjectionRow[]
}

function selectedIdsInOrder(variableIds: TraceVariableId[]): TraceVariableId[] {
  return [...new Set(variableIds)]
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
    metadata: {},
  }
}

function compactRow(
  session: TraceSession,
  event: TraceExecutionEvent,
  writeIndex: number,
): TraceTableProjectionRow {
  return {
    id: `${session.id}:compact:${event.sequence}:${writeIndex}`,
    sequence: event.sequence,
    sequences: [],
    cells: {},
    metadata: {},
  }
}

function appendSequence(row: TraceTableProjectionRow, sequence: number): void {
  if (row.sequences.at(-1) !== sequence) row.sequences.push(sequence)
}

function projectEveryLine(
  session: TraceSession,
  selected: ReadonlySet<TraceVariableId>,
): TraceTableProjectionRow[] {
  const bindings = new Map<string, TraceBindingState>()
  const rows: TraceTableProjectionRow[] = []

  for (const event of session.events) {
    applyEventDeltas(bindings, event)
    const selectedWrites = event.writes.filter(write => selected.has(write.variableId))
    if (event.kind !== 'line-completed' && selectedWrites.length === 0) continue

    let row = eventRow(session, event)
    selectedWrites.forEach((write, writeIndex) => {
      if (row.cells[write.variableId]) {
        rows.push(row)
        row = eventRow(session, event, writeIndex)
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
): TraceTableProjectionRow[] {
  const bindings = new Map<string, TraceBindingState>()
  const rows: TraceTableProjectionRow[] = []
  let current: TraceTableProjectionRow | undefined
  let previousCallStack: TraceCallId[] | undefined

  for (const event of session.events) {
    applyEventDeltas(bindings, event)

    const lifecycleTransition = event.kind !== 'line-completed'
    const callStackTransition = previousCallStack !== undefined && !sameCallStack(previousCallStack, event.callStack)
    if (event.loopIteration || lifecycleTransition || callStackTransition) current = undefined

    event.writes.forEach((write, writeIndex) => {
      if (!selected.has(write.variableId)) return
      if (!current || current.cells[write.variableId]) {
        current = compactRow(session, event, writeIndex)
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
  const variableIds = selectedIdsInOrder(options.variableIds)
  const selected = new Set(variableIds)
  const columns = variableIds.map(variableId => ({
    variableId,
    label: session.variables[variableId]?.defaultLabel ?? variableId,
  }))

  return {
    columns,
    rows: options.showLine
      ? projectEveryLine(session, selected)
      : projectCompact(session, selected),
  }
}
