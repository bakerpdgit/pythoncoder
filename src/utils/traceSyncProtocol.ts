/**
 * How the trace worker waits for the page, in two interchangeable ways.
 *
 * The worker runs Python synchronously, so "wait for the student to press Step"
 * has to *block* it. There are two ways to block a worker on something the page
 * decides:
 *
 *  - **`sab`** — `Atomics.wait` on a SharedArrayBuffer. Fast, but only offered
 *    to a cross-origin isolated page, and it relies on the browser's shared
 *    memory doing what it says.
 *  - **`xhr`** — a synchronous XMLHttpRequest to an address that does not
 *    exist, held open by `public/trace-sync-sw.js` until the page posts the
 *    answer. This is what Python Sponge did. It needs no isolation at all, only
 *    a service worker, so it also serves a tab whose isolation headers never
 *    arrived (a school filter, an embedding page).
 *
 * Everything either transport carries is described here, so the worker
 * (`workers/workerSync.ts`) and the page (`utils/traceChannel.ts`) cannot drift
 * apart. The order they are tried in, and what happens when one fails, is
 * `utils/runtimeFallback.ts`.
 */

export type TraceTransport = 'sab' | 'xhr'

/**
 * What the worker is blocked on. `probe` is the handshake at the start of a
 * run; `reply` is a question from the worker's tkinter host (a widget's size,
 * the events queued since it last asked, a dialog's answer).
 */
export type SyncWaitKind = 'trace' | 'input' | 'probe' | 'park' | 'reply'

export const SYNC_PREFIX = '/__coder_sync__/'
export const SYNC_SW_URL = '/trace-sync-sw.js'
export const SYNC_SW_SCOPE = '/'
/** The response header that marks an answer as the service worker's own. */
export const SYNC_MARK_HEADER = 'X-Coder-Sync'

// ── SharedArrayBuffer layout (8 KB) ──────────────────────────────────────────
// int32[0]   what the worker is waiting for (SAB_STATE_*); 0 = running
// int32[1]   the debugger command answering a `trace` wait
// int32[2]   byte length of the input() answer
// uint8[12..1999]    the input() answer, UTF-8
// int32[500] number of enabled breakpoints, int32[501..599] their lines
// int32[600] byte length of the conditions JSON, uint8[2404..2995] the JSON
// int32[750] byte length of the watches JSON (-1 = never written)
// int32[751] cooperative stop request (trace mode)
// uint8[3008..4095]  the watches JSON
// int32[1024] tkinter events the page has queued (counts up; notified)
// int32[1025] the last batch of tkinter drawing the page has applied (notified)
// int32[1026] byte length of a `reply`, uint8[4112..8191] the reply, UTF-8
export const SAB_BYTES = 1024 * 8
export const SAB_STATE_RUNNING = 0
export const SAB_STATE_TRACE = 1
export const SAB_STATE_INPUT = 2
export const SAB_STATE_PROBE = 3
export const SAB_STATE_REPLY = 4
export const SAB_INDEX_STATE = 0
export const SAB_INDEX_COMMAND = 1
export const SAB_INDEX_INPUT_LENGTH = 2
export const SAB_INPUT_START = 12
export const SAB_INPUT_END = 2000
export const SAB_INDEX_BREAKPOINT_COUNT = 500
export const SAB_MAX_BREAKPOINTS = 99
export const SAB_INDEX_CONDITIONS_LENGTH = 600
export const SAB_CONDITIONS_START = 2404
export const SAB_CONDITIONS_MAX = 592
export const SAB_INDEX_WATCHES_LENGTH = 750
export const SAB_INDEX_STOP = 751
export const SAB_WATCHES_START = 3008
export const SAB_WATCHES_MAX = 1088
export const SAB_INDEX_TK_EVENTS = 1024
export const SAB_INDEX_TK_APPLIED = 1025
export const SAB_INDEX_REPLY_LENGTH = 1026
export const SAB_REPLY_START = 4112
export const SAB_REPLY_END = 8192

/** How long the worker gives the page to answer the handshake. */
export const PROBE_TIMEOUT_MS = 8000

export interface TraceBreakpoint {
  line: number
  /** Empty when the breakpoint is unconditional. */
  condition: string
}

/** What the page sends to release a worker paused on a line. */
export interface TraceCommandReply {
  cmd: number
  breakpoints: TraceBreakpoint[]
  watches: string[]
  stop?: boolean
}

export interface InputReply {
  text: string
  stop?: boolean
}

/** State the worker polls rather than waits for (xhr transport). */
export interface SyncState {
  stop: boolean
  /** Virtual key codes currently held down, for stdctx.check_key(). */
  keys: number[]
  /** How many tkinter events the page has queued so far (counts up). */
  tk: number
  /** The last batch of tkinter drawing the page has applied. */
  applied: number
}

export type SyncPageMessage =
  | { type: 'coder-sync-reply'; session: string; seq: number; body: unknown }
  | { type: 'coder-sync-state'; session: string; state: SyncState }
  | { type: 'coder-sync-close'; session: string }

/** Sent by the service worker when it has no memory of a session (it was restarted). */
export interface SyncResyncMessage { type: 'coder-sync-resync'; session: string }

let requestCounter = 0

/**
 * An address under SYNC_PREFIX. Every one carries a counter, so no cache —
 * the browser's or anything between — can answer in the service worker's place.
 */
export function syncUrl(origin: string, op: 'ping' | 'wait' | 'poll' | 'sleep', params: Record<string, string | number> = {}): string {
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(params)) query.set(name, String(value))
  query.set('n', String(++requestCounter))
  return `${origin}${SYNC_PREFIX}${op}?${query.toString()}`
}

export function newSyncSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Line → condition, as the Python side wants it ('' = unconditional). */
export function breakpointMap(breakpoints: TraceBreakpoint[] | undefined): Map<number, string> {
  const map = new Map<number, string>()
  for (const breakpoint of breakpoints ?? []) {
    const line = Number(breakpoint?.line)
    if (Number.isInteger(line) && line > 0) map.set(line, String(breakpoint.condition ?? ''))
  }
  return map
}

/** A SyncState from whatever a response body held; anything malformed is "nothing held, not stopped". */
export function parseSyncState(value: unknown): SyncState {
  const record = (value && typeof value === 'object' ? value : {}) as { stop?: unknown; keys?: unknown; tk?: unknown; applied?: unknown }
  return {
    stop: record.stop === true,
    keys: Array.isArray(record.keys) ? record.keys.map(Number).filter(code => Number.isInteger(code) && code >= 0) : [],
    tk: Number.isFinite(Number(record.tk)) ? Number(record.tk) : 0,
    applied: Number.isFinite(Number(record.applied)) ? Number(record.applied) : 0,
  }
}

/**
 * The reply to a tkinter `poll`: the events, and whether more are still
 * queued (a reply through shared memory has a fixed size, so a long queue is
 * handed over in parts).
 */
export interface TkPollReply {
  events: unknown[]
  more: boolean
}
