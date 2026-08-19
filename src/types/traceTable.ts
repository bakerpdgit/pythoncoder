import type { InspectorNode } from './index'

/** Stable identity for a source-level variable, independent of a call activation. */
export type TraceVariableId = string

/** Monotonically increasing identity for one invocation of user code. */
export type TraceCallId = number

export type TraceVariableScope =
  | { kind: 'global' }
  | {
      kind: 'local'
      /** Qualified owner, for example `factorial` or `Player.move`. */
      owner: string
      functionName: string
      className?: string
    }

export interface TraceVariableDefinition {
  id: TraceVariableId
  name: string
  /** Default column heading. Globals normally use the bare name. */
  defaultLabel: string
  scope: TraceVariableScope
  firstSeenSequence: number
  lastSeenSequence: number
  /** Allows less student-friendly values to be hidden behind an advanced group. */
  category?: 'value' | 'callable' | 'module' | 'type'
}

/**
 * A local value belongs to a particular call. This distinction is essential for
 * recursive calls, where several bindings of the same source variable coexist.
 */
export interface TraceBinding {
  variableId: TraceVariableId
  callId: TraceCallId | null
}

export type TraceBindingState =
  | { status: 'value'; value: InspectorNode }
  | { status: 'deleted' }
  | { status: 'out-of-scope' }

export interface TraceBindingDelta extends TraceBinding {
  state: TraceBindingState
}

export type TraceWriteKind =
  | 'assignment'
  | 'augmented-assignment'
  | 'parameter'
  | 'loop-target'
  | 'walrus'
  | 'with-target'
  | 'except-target'
  | 'import'
  | 'mutation'
  | 'deletion'
  | 'unknown'

/**
 * Records write intent separately from value deltas. In particular, `changed`
 * can be false for `x = 1` when x already contains 1, but the write must still
 * be rendered in a teaching trace table.
 */
export interface TraceWriteMarker extends TraceBinding {
  kind: TraceWriteKind
  changed: boolean
  outcome: 'value' | 'deleted'
  /**
   * Value immediately after this write. This is distinct from binding deltas:
   * several writes can occur on one source line while its delta stores only
   * the final binding state.
   */
  value?: InspectorNode
  /** Optional nested path affected by a mutation, e.g. `["score"]` or `.name`. */
  path?: string[]
}

export interface TraceSourceLocation {
  path: string
  line: number
  column?: number
  endLine?: number
}

export interface TraceLoopIteration {
  loopId: string
  iteration: number
  depth: number
}

export type TraceExecutionEventKind =
  | 'line-completed'
  | 'call-entered'
  | 'call-returned'
  | 'call-exception-exit'
  | 'generator-yielded'
  | 'generator-resumed'
  | 'exception'
  | 'input-completed'

/** A completed event. A paused-but-not-yet-executed line is not appended here. */
export interface TraceExecutionEvent {
  sequence: number
  kind: TraceExecutionEventKind
  location: TraceSourceLocation
  callId: TraceCallId
  /** Module activation first, currently executing activation last. */
  callStack: TraceCallId[]
  functionName: string
  className?: string
  loopIteration?: TraceLoopIteration
  bindingDeltas: TraceBindingDelta[]
  writes: TraceWriteMarker[]
  returnValue?: InspectorNode
  exception?: { type: string; message: string }
  inputValue?: string
}

export interface TraceCallActivation {
  id: TraceCallId
  parentId: TraceCallId | null
  qualifiedName: string
  functionName: string
  className?: string
  depth: number
  startedAtSequence: number
  endedAtSequence?: number
  outcome?: 'returned' | 'exception' | 'stopped'
  suspended?: boolean
  lastYieldedAtSequence?: number
  lastResumedAtSequence?: number
}

/**
 * A checkpoint contains state after `eventCount` events have been applied.
 * It is transport-safe and lets readers avoid replaying the session from row 0.
 */
export interface TraceCheckpoint {
  eventCount: number
  throughSequence: number | null
  bindings: TraceBindingDelta[]
}

export type TraceSessionStatus =
  | 'recording'
  | 'paused'
  | 'completed'
  | 'stopped'
  | 'error'
  | 'limit-reached'

export interface TraceSessionSource {
  path: string
  filesystemId?: string
  codeHash?: string
}

export interface TraceSessionInit {
  id: string
  source: TraceSessionSource
  startedAt?: number
}

export interface TraceSession {
  id: string
  source: TraceSessionSource
  startedAt: number
  endedAt?: number
  status: TraceSessionStatus
  error?: string
  truncated: boolean
  variables: Record<TraceVariableId, TraceVariableDefinition>
  calls: Record<TraceCallId, TraceCallActivation>
  events: TraceExecutionEvent[]
  checkpoints: TraceCheckpoint[]
  /** Used to reject missing batches and safely ignore retransmissions. */
  lastBatchSequence: number
}

export interface TraceSessionStatusUpdate {
  status: TraceSessionStatus
  endedAt?: number
  error?: string
  truncated?: boolean
}

export interface TraceEventBatch {
  type: 'trace-event-batch'
  sessionId: string
  /** Zero-based, contiguous sequence for transport batches. */
  batchSequence: number
  variables?: TraceVariableDefinition[]
  calls?: TraceCallActivation[]
  events: TraceExecutionEvent[]
  checkpoints?: TraceCheckpoint[]
  status?: TraceSessionStatusUpdate
}

export interface TraceSessionReset {
  type: 'trace-session-reset'
  session: TraceSessionInit
}

export type TraceLogMessage = TraceSessionReset | TraceEventBatch

// Raw protocol emitted by tracer.worker.ts. Keeping this transport contract
// separate from TraceExecutionEvent lets the worker favour compact Python/JSON
// payloads while the UI consumes the normalized, versioned session model above.
export interface TraceWorkerStackFrame {
  callId: TraceCallId
  function: string
  qualifiedFunction: string
  depth: number
}

export interface TraceWorkerVariableValue {
  sourceId: string
  activationSourceId: string
  name: string
  scope: 'global' | 'local'
  function: string
  callId: TraceCallId | null
  defaultLabel: string
  value: InspectorNode
  operation?: 'write' | 'parameter' | 'mutation'
  changed?: boolean
  category?: TraceVariableDefinition['category']
}

export interface TraceWorkerDeletedValue extends Omit<TraceWorkerVariableValue, 'value' | 'operation' | 'changed'> {
  operation: 'delete'
}

export interface TraceWorkerEvent {
  sequence: number
  type:
    | 'statement'
    | 'function-entry'
    | 'function-return'
    | 'function-exception-exit'
    | 'generator-yield'
    | 'generator-resume'
    | 'exception'
    | 'input-completed'
  line: number
  function: string
  qualifiedFunction: string
  callId: TraceCallId
  callDepth: number
  stack: TraceWorkerStackFrame[]
  completedBy?: 'line' | 'return' | 'yield' | 'exception'
  statementKinds?: string[]
  writes?: TraceWorkerVariableValue[]
  deletes?: TraceWorkerDeletedValue[]
  failed?: boolean
  loopBoundary?: { loopId: string; loopKind: string; iteration: number } | null
  /** Changed/new serialized values only; unchanged values stay in reconstructed state. */
  variables?: TraceWorkerVariableValue[]
  /** Every binding currently in scope, including unchanged bindings. */
  activeBindings: string[]
  returnValue?: InspectorNode
  exception?: { type: string; message: string }
  inputValue?: string
}

export interface TraceWorkerBatchMessage {
  type: 'trace-table-batch'
  protocolVersion: 1
  sessionId: string
  batchSequence: number
  events: TraceWorkerEvent[]
  catalogue: Array<Omit<TraceWorkerVariableValue, 'value' | 'operation' | 'changed'> & { firstSeenSequence: number }>
}

export interface TraceWorkerEndMessage {
  type: 'trace-table-end'
  sessionId: string
  status: 'done' | 'error' | 'stopped'
  batchCount: number
  error?: string
}

export interface TraceWorkerStopAckMessage {
  type: 'trace-table-stop-ack'
  sessionId: string
  /** Number of batches posted before this acknowledgement. */
  batchCount: number
}

export interface ReconstructedTraceState {
  /** Number of session events included in this state. */
  eventCount: number
  throughSequence: number | null
  bindings: ReadonlyMap<string, TraceBindingState>
}
