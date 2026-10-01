/// <reference lib="webworker" />

/**
 * The trace worker's half of `utils/traceSyncProtocol.ts`: block until the page
 * answers, by shared memory or by a held request.
 *
 * Both transports present the same few operations, so nothing in
 * `tracer.worker.ts` knows which one a run is using.
 */

import {
  PROBE_TIMEOUT_MS,
  SAB_CONDITIONS_MAX, SAB_CONDITIONS_START, SAB_INDEX_BREAKPOINT_COUNT, SAB_INDEX_COMMAND,
  SAB_INDEX_CONDITIONS_LENGTH, SAB_INDEX_INPUT_LENGTH, SAB_INDEX_STATE, SAB_INDEX_STOP,
  SAB_INDEX_WATCHES_LENGTH, SAB_INPUT_END, SAB_INPUT_START, SAB_MAX_BREAKPOINTS,
  SAB_STATE_INPUT, SAB_STATE_PROBE, SAB_STATE_TRACE, SAB_WATCHES_MAX, SAB_WATCHES_START,
  SYNC_MARK_HEADER, breakpointMap, parseSyncState, syncUrl,
  type SyncState, type TraceTransport,
} from '../utils/traceSyncProtocol'

/** The way of waiting itself failed — as opposed to the program, or Pyodide. */
export class SyncChannelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SyncChannelError'
  }
}

export interface CommandAnswer {
  cmd: number
  breakpoints: Map<number, string>
  /** null leaves the watch expressions as they were. */
  watches: string[] | null
  stop: boolean
}

export interface InputAnswer {
  text: string
  stop: boolean
}

/**
 * `announce` posts the message that tells the page what the worker is about to
 * wait for. It is called once the channel is ready to be answered — so an
 * answer that arrives before the wait begins is never lost — and is given the
 * turn number the page must quote back (unused by shared memory).
 */
export interface WorkerSync {
  readonly transport: TraceTransport
  /** Round-trip once, before any Python runs. Throws SyncChannelError if the page cannot be heard. */
  probe(announce: (seq: number) => void): void
  waitCommand(announce: (seq: number) => void): CommandAnswer
  waitInput(announce: (seq: number) => void): InputAnswer
  /** Has the page asked a trace to stop and flush? */
  stopRequested(): boolean
  keyDown(code: number): boolean
  sleep(ms: number): void
  /** Never returns: the page terminates a parked worker. */
  park(): void
}

/**
 * The same channel, reporting the first thing that goes wrong in it.
 *
 * Most waits happen underneath Python: a failure there surfaces as a Python
 * exception about a JavaScript error, indistinguishable from a program that
 * failed. Noting it on the way through is what lets the run be reported as the
 * transport's failure, and tried again on the other one.
 */
export function watchSync(sync: WorkerSync, onFailure: (error: unknown) => void): WorkerSync {
  const watched = <A extends unknown[], R>(operation: (...args: A) => R) => (...args: A): R => {
    try {
      return operation(...args)
    } catch (error) {
      onFailure(error)
      throw error
    }
  }
  return {
    transport: sync.transport,
    probe: watched(sync.probe),
    waitCommand: watched(sync.waitCommand),
    waitInput: watched(sync.waitInput),
    stopRequested: watched(sync.stopRequested),
    keyDown: watched(sync.keyDown),
    sleep: watched(sync.sleep),
    park: watched(sync.park),
  }
}

// ── Shared memory ────────────────────────────────────────────────────────────

export function createSabSync(sab: SharedArrayBuffer, keyBuffer: SharedArrayBuffer | null): WorkerSync {
  const int32 = new Int32Array(sab)
  const uint8 = new Uint8Array(sab)
  const keys = keyBuffer ? new Uint8Array(keyBuffer) : null
  // Private buffers nothing ever notifies, used only to park this thread.
  const sleepView = new Int32Array(new SharedArrayBuffer(4))

  // TextDecoder refuses a SharedArrayBuffer-backed view, hence the copies.
  const readJson = (start: number, length: number): unknown =>
    JSON.parse(new TextDecoder().decode(uint8.slice(start, start + length)))

  return {
    transport: 'sab',
    probe(announce) {
      Atomics.store(int32, SAB_INDEX_STATE, SAB_STATE_PROBE)
      announce(0)
      // 'not-equal' means the page answered before this line ran, which is
      // just as good as being woken.
      if (Atomics.wait(int32, SAB_INDEX_STATE, SAB_STATE_PROBE, PROBE_TIMEOUT_MS) === 'timed-out') {
        throw new SyncChannelError('The page\'s answer never arrived through shared memory (SharedArrayBuffer / Atomics.wait).')
      }
    },
    waitCommand(announce) {
      Atomics.store(int32, SAB_INDEX_STATE, SAB_STATE_TRACE)
      announce(0)
      Atomics.wait(int32, SAB_INDEX_STATE, SAB_STATE_TRACE)
      const breakpoints = new Map<number, string>()
      const count = Atomics.load(int32, SAB_INDEX_BREAKPOINT_COUNT)
      for (let i = 0; i < count && i < SAB_MAX_BREAKPOINTS; i++) {
        breakpoints.set(Atomics.load(int32, SAB_INDEX_BREAKPOINT_COUNT + 1 + i), '')
      }
      try {
        const length = Atomics.load(int32, SAB_INDEX_CONDITIONS_LENGTH)
        if (length > 0) {
          const conditions = readJson(SAB_CONDITIONS_START, Math.min(length, SAB_CONDITIONS_MAX)) as Record<string, string>
          for (const line in conditions) breakpoints.set(Number(line), conditions[line])
        }
      } catch { /* ignore malformed conditions */ }
      let watches: string[] | null = null
      try {
        const length = Atomics.load(int32, SAB_INDEX_WATCHES_LENGTH)
        if (length === 0) watches = []
        else if (length > 0) watches = readJson(SAB_WATCHES_START, Math.min(length, SAB_WATCHES_MAX)) as string[]
      } catch { /* leave the watches as they were */ }
      return {
        cmd: Atomics.load(int32, SAB_INDEX_COMMAND),
        breakpoints,
        watches,
        stop: Atomics.load(int32, SAB_INDEX_STOP) === 1,
      }
    },
    waitInput(announce) {
      Atomics.store(int32, SAB_INDEX_STATE, SAB_STATE_INPUT)
      announce(0)
      Atomics.wait(int32, SAB_INDEX_STATE, SAB_STATE_INPUT)
      const length = Math.max(0, Math.min(Atomics.load(int32, SAB_INDEX_INPUT_LENGTH), SAB_INPUT_END - SAB_INPUT_START))
      return {
        text: new TextDecoder().decode(uint8.slice(SAB_INPUT_START, SAB_INPUT_START + length)),
        stop: Atomics.load(int32, SAB_INDEX_STOP) === 1,
      }
    },
    stopRequested: () => Atomics.load(int32, SAB_INDEX_STOP) === 1,
    keyDown(code) {
      if (!keys || !Number.isInteger(code) || code < 0 || code >= keys.length) return false
      return Atomics.load(keys, code) > 0
    },
    sleep(ms) {
      // Nothing notifies this buffer, so the wait always runs to its timeout.
      // Blocking (rather than spinning) leaves the page free to paint.
      Atomics.wait(sleepView, 0, 0, ms)
    },
    park() {
      for (;;) Atomics.wait(sleepView, 0, 0)
    },
  }
}

// ── Held requests ────────────────────────────────────────────────────────────

/** How stale the polled state may be before stop / a key press is asked for again. */
const STOP_POLL_MS = 200
const KEY_POLL_MS = 25
/** One sleep request is kept well inside how long the service worker will hold it. */
const SLEEP_SLICE_MS = 15000
const MAX_CONSECUTIVE_FAILURES = 5

function spin(ms: number): void {
  const until = performance.now() + ms
  while (performance.now() < until) { /* a failed request has nothing else to wait on */ }
}

export function createXhrSync(session: string, origin: string): WorkerSync {
  let seq = 0
  let state: SyncState = { stop: false, keys: [] }
  let held = new Set<number>()
  let stateAt = -Infinity

  const adopt = (value: unknown) => {
    state = parseSyncState(value)
    held = new Set(state.keys)
    stateAt = performance.now()
  }

  /** One synchronous request. Throws if it could not be made, or was not answered by the service worker. */
  const request = (url: string): { status: number; body: string } => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, false)
    xhr.send()
    if (xhr.getResponseHeader(SYNC_MARK_HEADER) !== '1') {
      throw new SyncChannelError(`The service worker is not answering this worker's requests (status ${xhr.status}).`)
    }
    return { status: xhr.status, body: xhr.responseText }
  }

  /** Block until the page answers turn `q`, asking again each time a held request is released. */
  const wait = (announce: (seq: number) => void, timeoutMs = Infinity): unknown => {
    const q = ++seq
    announce(q)
    const deadline = performance.now() + timeoutMs
    let failures = 0
    for (;;) {
      const params: Record<string, string | number> = { s: session, q }
      if (Number.isFinite(timeoutMs)) params.hold = Math.max(1, Math.ceil(deadline - performance.now()))
      let response: { status: number; body: string }
      try {
        response = request(syncUrl(origin, 'wait', params))
        failures = 0
      } catch (error) {
        if (error instanceof SyncChannelError) throw error
        if (++failures >= MAX_CONSECUTIVE_FAILURES) {
          throw new SyncChannelError(`The request the worker waits on keeps failing: ${String(error)}`)
        }
        spin(200)
        continue
      }
      if (response.status === 200) return JSON.parse(response.body)
      if (response.status === 410) throw new SyncChannelError('The page closed this run\'s channel.')
      if (performance.now() >= deadline) throw new SyncChannelError('The page did not answer the service worker in time.')
    }
  }

  const refresh = (maxAgeMs: number) => {
    if (performance.now() - stateAt < maxAgeMs) return
    try {
      adopt(JSON.parse(request(syncUrl(origin, 'poll', { s: session })).body))
    } catch {
      // Keep what is known and do not ask again at once: a failing poll must
      // not turn every traced line into a failing request.
      stateAt = performance.now()
    }
  }

  return {
    transport: 'xhr',
    probe(announce) {
      // Is the service worker answering for this worker at all? A server that
      // returns its index page for any unknown address does not carry the mark.
      request(syncUrl(origin, 'ping'))
      wait(announce, PROBE_TIMEOUT_MS)
    },
    waitCommand(announce) {
      const answer = (wait(announce) ?? {}) as { cmd?: unknown; breakpoints?: unknown; watches?: unknown; stop?: unknown }
      if (answer.stop === true) { state = { ...state, stop: true }; stateAt = performance.now() }
      return {
        cmd: Number(answer.cmd) || 0,
        breakpoints: breakpointMap(Array.isArray(answer.breakpoints) ? answer.breakpoints : []),
        watches: Array.isArray(answer.watches) ? answer.watches.map(String) : null,
        stop: answer.stop === true,
      }
    },
    waitInput(announce) {
      const answer = (wait(announce) ?? {}) as { text?: unknown; stop?: unknown }
      if (answer.stop === true) { state = { ...state, stop: true }; stateAt = performance.now() }
      return { text: String(answer.text ?? ''), stop: answer.stop === true }
    },
    stopRequested() {
      refresh(STOP_POLL_MS)
      return state.stop
    },
    keyDown(code) {
      refresh(KEY_POLL_MS)
      return held.has(code)
    },
    sleep(ms) {
      const end = performance.now() + ms
      for (;;) {
        const remaining = end - performance.now()
        if (remaining <= 0) return
        try {
          // The answer carries the key state, so a game loop that sleeps each
          // frame never needs a separate poll.
          adopt(JSON.parse(request(syncUrl(origin, 'sleep', { s: session, ms: Math.ceil(Math.min(remaining, SLEEP_SLICE_MS)) })).body))
        } catch {
          spin(Math.min(remaining, 50))
        }
      }
    },
    park() {
      for (;;) {
        try { wait(() => undefined) } catch { spin(500) }
      }
    },
  }
}
