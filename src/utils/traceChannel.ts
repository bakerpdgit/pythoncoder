/**
 * The page's half of `utils/traceSyncProtocol.ts`: answer a trace worker that
 * is blocked waiting for a debugger command or an input() line.
 *
 * `App.tsx` holds one `TraceChannel` per run and never touches a
 * SharedArrayBuffer or the service worker itself, so which transport a run
 * uses is decided in exactly one place (`utils/runtimeFallback.ts`).
 */

import {
  SAB_BYTES, SAB_CONDITIONS_MAX, SAB_CONDITIONS_START, SAB_INDEX_BREAKPOINT_COUNT, SAB_INDEX_COMMAND,
  SAB_INDEX_CONDITIONS_LENGTH, SAB_INDEX_INPUT_LENGTH, SAB_INDEX_STATE, SAB_INDEX_STOP,
  SAB_INDEX_WATCHES_LENGTH, SAB_INPUT_END, SAB_INPUT_START, SAB_MAX_BREAKPOINTS,
  SAB_STATE_INPUT, SAB_STATE_PROBE, SAB_STATE_RUNNING, SAB_STATE_TRACE, SAB_WATCHES_MAX, SAB_WATCHES_START,
  SYNC_SW_SCOPE, SYNC_SW_URL, newSyncSessionId,
  type SyncPageMessage, type SyncWaitKind, type TraceBreakpoint, type TraceTransport,
} from './traceSyncProtocol'

export interface TraceChannel {
  readonly transport: TraceTransport
  /** What the worker's `init` message needs to open its own end. */
  initFields(): Record<string, unknown>
  /** The worker has announced what it is about to block on. */
  workerWaiting(kind: SyncWaitKind, seq: number): void
  isWaiting(kind: 'trace' | 'input'): boolean
  /** Answer the handshake a run starts with. */
  answerProbe(): void
  /** Release a worker paused on a line. False if it was not waiting for one. */
  sendCommand(cmd: number, breakpoints: TraceBreakpoint[], watches: string[]): boolean
  /** Answer input(). False if the worker was not waiting for one. */
  sendInput(text: string): boolean
  /** Ask a trace to stop and flush, waking it if it is waiting. False if already asked. */
  requestStop(): boolean
  setKey(code: number, isDown: boolean): void
  dispose(): void
}

// ── Shared memory ────────────────────────────────────────────────────────────

export function createSabChannel(keyBufferSize: number | null): TraceChannel {
  const sab = new SharedArrayBuffer(SAB_BYTES)
  const int32 = new Int32Array(sab)
  const uint8 = new Uint8Array(sab)
  const keys = keyBufferSize ? new Uint8Array(new SharedArrayBuffer(keyBufferSize)) : null
  int32[SAB_INDEX_WATCHES_LENGTH] = -1 // not yet written: the worker keeps the watches it started with
  int32[SAB_INDEX_STOP] = 0

  const wake = () => {
    Atomics.store(int32, SAB_INDEX_STATE, SAB_STATE_RUNNING)
    Atomics.notify(int32, SAB_INDEX_STATE, 1)
  }

  return {
    transport: 'sab',
    initFields: () => ({ transport: 'sab', sab, stdctxKeyBuffer: keys?.buffer ?? null }),
    workerWaiting() { /* the buffer itself says what the worker is waiting for */ },
    isWaiting: kind => Atomics.load(int32, SAB_INDEX_STATE) === (kind === 'trace' ? SAB_STATE_TRACE : SAB_STATE_INPUT),
    answerProbe() {
      if (Atomics.load(int32, SAB_INDEX_STATE) === SAB_STATE_PROBE) wake()
    },
    sendCommand(cmd, breakpoints, watches) {
      if (Atomics.load(int32, SAB_INDEX_STATE) !== SAB_STATE_TRACE) return false
      int32[SAB_INDEX_BREAKPOINT_COUNT] = Math.min(breakpoints.length, SAB_MAX_BREAKPOINTS)
      const conditions: Record<number, string> = {}
      breakpoints.forEach((breakpoint, i) => {
        if (i < SAB_MAX_BREAKPOINTS) int32[SAB_INDEX_BREAKPOINT_COUNT + 1 + i] = breakpoint.line
        if (breakpoint.condition) conditions[breakpoint.line] = breakpoint.condition
      })
      const conditionBytes = new TextEncoder().encode(JSON.stringify(conditions))
      const conditionLength = Math.min(conditionBytes.length, SAB_CONDITIONS_MAX)
      uint8.set(conditionBytes.subarray(0, conditionLength), SAB_CONDITIONS_START)
      int32[SAB_INDEX_CONDITIONS_LENGTH] = conditionLength
      const watchBytes = new TextEncoder().encode(JSON.stringify(watches))
      const watchLength = Math.min(watchBytes.length, SAB_WATCHES_MAX)
      uint8.set(watchBytes.subarray(0, watchLength), SAB_WATCHES_START)
      Atomics.store(int32, SAB_INDEX_WATCHES_LENGTH, watchLength)
      Atomics.store(int32, SAB_INDEX_COMMAND, cmd)
      wake()
      return true
    },
    sendInput(text) {
      if (Atomics.load(int32, SAB_INDEX_STATE) !== SAB_STATE_INPUT) return false
      // The answer occupies bytes 12..1999 only. What follows holds the
      // breakpoints, watches and stop flag, which must survive an answer.
      const bytes = new TextEncoder().encode(text).slice(0, SAB_INPUT_END - SAB_INPUT_START)
      int32[SAB_INDEX_INPUT_LENGTH] = bytes.length
      uint8.fill(0, SAB_INPUT_START, SAB_INPUT_END)
      uint8.set(bytes, SAB_INPUT_START)
      wake()
      return true
    },
    requestStop() {
      if (Atomics.compareExchange(int32, SAB_INDEX_STOP, 0, 1) !== 0) return false
      // Wake a worker paused for stepping or for input; it reads the flag.
      // The state is cleared as well as notified, so a worker that has
      // announced a wait but not yet begun it does not sleep through the stop.
      wake()
      return true
    },
    setKey(code, isDown) {
      if (keys && code >= 0 && code < keys.length) Atomics.store(keys, code, isDown ? 1 : 0)
    },
    dispose() { /* nothing outlives the buffers */ },
  }
}

// ── Held requests ────────────────────────────────────────────────────────────

function serviceWorkerTarget(): ServiceWorker | null {
  return navigator.serviceWorker?.controller ?? null
}

export function createXhrChannel(): TraceChannel {
  const session = newSyncSessionId()
  let waiting: { kind: SyncWaitKind; seq: number } | null = null
  // Kept until the worker's next turn, so a service worker the browser
  // restarted in between can be given it again (see `coder-sync-resync`).
  let lastReply: { seq: number; body: unknown } | null = null
  let stop = false
  const held = new Set<number>()

  const post = (message: SyncPageMessage) => serviceWorkerTarget()?.postMessage(message)
  const pushState = () => post({ type: 'coder-sync-state', session, state: { stop, keys: [...held] } })
  const reply = (body: unknown) => {
    if (!waiting) return
    lastReply = { seq: waiting.seq, body }
    waiting = null
    post({ type: 'coder-sync-reply', session, seq: lastReply.seq, body })
  }

  const onServiceWorkerMessage = (event: MessageEvent) => {
    if (event.data?.type !== 'coder-sync-resync' || event.data.session !== session) return
    pushState()
    if (lastReply) post({ type: 'coder-sync-reply', session, seq: lastReply.seq, body: lastReply.body })
  }
  navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage)

  return {
    transport: 'xhr',
    initFields: () => ({ transport: 'xhr', syncSession: session }),
    workerWaiting(kind, seq) { waiting = { kind, seq } },
    isWaiting: kind => waiting?.kind === kind,
    answerProbe() {
      if (waiting?.kind === 'probe') reply({ ok: true })
    },
    sendCommand(cmd, breakpoints, watches) {
      if (waiting?.kind !== 'trace') return false
      reply({ cmd, breakpoints, watches, stop })
      return true
    },
    sendInput(text) {
      if (waiting?.kind !== 'input') return false
      reply({ text, stop })
      return true
    },
    requestStop() {
      if (stop) return false
      stop = true
      pushState()
      if (waiting?.kind === 'trace') reply({ cmd: 0, breakpoints: [], stop: true })
      else if (waiting?.kind === 'input') reply({ text: '', stop: true })
      return true
    },
    setKey(code, isDown) {
      if (isDown === held.has(code)) return
      if (isDown) held.add(code)
      else held.delete(code)
      pushState()
    },
    dispose() {
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage)
      post({ type: 'coder-sync-close', session })
    },
  }
}

// ── The service worker behind the held requests ──────────────────────────────

/** Whether this tab could use held requests at all (it still has to be proved by a run). */
export function serviceWorkerSyncSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && window.isSecureContext === true
}

const within = <T,>(promise: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([promise, new Promise<undefined>(resolve => window.setTimeout(() => resolve(undefined), ms))])

let syncServiceWorker: Promise<string | null> | null = null

/**
 * Register the service worker and wait until it controls this page, which is
 * what makes it answer for the workers the page creates. Resolves to null when
 * ready, or to the reason it is not. It is registered only when held requests
 * are actually needed: a tab running on shared memory never gets it.
 */
export function ensureSyncServiceWorker(): Promise<string | null> {
  syncServiceWorker ??= (async (): Promise<string | null> => {
    if (!serviceWorkerSyncSupported()) return 'This browser tab does not offer service workers.'
    try {
      const registration = await navigator.serviceWorker.register(SYNC_SW_URL, { scope: SYNC_SW_SCOPE })
      const ready = await within(navigator.serviceWorker.ready, 8000)
      if (!ready) return 'The service worker did not start.'
      if (!navigator.serviceWorker.controller) {
        const controlled = new Promise<void>(resolve => {
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
        })
        // Activation claims the page, except after a hard reload, when the
        // service worker is already active and has to be asked.
        ;(registration.active ?? ready.active)?.postMessage({ type: 'coder-sync-claim' })
        await within(controlled, 4000)
      }
      return navigator.serviceWorker.controller ? null : 'The service worker did not take control of the page.'
    } catch (error) {
      return `The service worker could not be registered: ${error instanceof Error ? error.message : String(error)}`
    }
  })().then(problem => {
    // A failure is not remembered, so the next run can try again.
    if (problem) syncServiceWorker = null
    return problem
  })
  return syncServiceWorker
}
