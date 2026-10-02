/**
 * Which way a tab runs the trace worker, and what to do when that way fails.
 *
 * There are three rungs, tried in order:
 *
 *   1. `sab`  — the trace worker, waiting on shared memory;
 *   2. `xhr`  — the trace worker, waiting on a held request (a service worker);
 *   3. `none` — no trace worker: programs run on the main thread, without
 *               stepping or the inspector.
 *
 * A tab used to be judged once, at load, by `crossOriginIsolated`. That says
 * the worker *should* work, not that it does: Safari was isolated, passed the
 * check, and then failed every run with an error in the console and nothing
 * to be done about it short of finding the Execution setting. So a run now
 * proves its rung (the worker handshakes with the page before any Python
 * runs), and a failure moves the tab down a rung and runs the program again
 * there, with a note saying what happened. A student is never left with only
 * an error.
 *
 * The decisions are pure and live here; `App.tsx` carries them out.
 */

import type { TraceTransport } from './traceSyncProtocol'

/** The rung a tab is on. */
export type WorkerPlan = TraceTransport | 'none'

/**
 * How a worker run failed, as far as the runtime (not the program) goes:
 *  - `transport` — the worker could not hear the page (the handshake failed);
 *  - `load`      — Pyodide would not load in the worker;
 *  - `boot`      — the browser would not start the worker from its address at
 *                  all, and starting it from a copy has not been tried
 *                  (utils/workerBoot.ts);
 *  - `start`     — the worker would not start either way, or failed outside
 *                  Python;
 *  - `crash`     — Pyodide died, and died again after being reset, in a tab
 *                  where no worker run has ever got as far as the program.
 */
export type WorkerFailure = 'transport' | 'load' | 'boot' | 'start' | 'crash'

export interface FallbackContext {
  /** Could this tab use the held-request transport at all? */
  serviceWorkerSupported: boolean
  /** Earlier runs this session that the worker itself (not its transport) sent to the main thread. */
  workerFailures: number
}

/** After this many failures of the worker itself, the tab stops trying it. */
export const WORKER_FAILURES_BEFORE_GIVING_UP = 2

export interface FallbackDecision {
  /** The rung the tab is on from now. */
  plan: WorkerPlan
  /** Where the program that just failed is run again. */
  rerunOn: TraceTransport | 'main-thread'
  /** Set when the re-run is on the same rung, with the worker started from a copy. */
  boot?: 'blob'
}

export function initialWorkerPlan(tab: {
  hasSharedMemory: boolean
  serviceWorkerSupported: boolean
  /** `?transport=` in the address: a way to try one rung on a particular browser. */
  forced: string | null
  /** The rung this tab's session already fell back to. */
  remembered: string | null
}): WorkerPlan {
  const allowed = (plan: string | null): plan is WorkerPlan =>
    (plan === 'sab' && tab.hasSharedMemory) || (plan === 'xhr' && tab.serviceWorkerSupported) || plan === 'none'
  if (allowed(tab.forced)) return tab.forced
  if (allowed(tab.remembered)) return tab.remembered
  if (tab.hasSharedMemory) return 'sab'
  return tab.serviceWorkerSupported ? 'xhr' : 'none'
}

export function decideFallback(current: TraceTransport, failure: WorkerFailure, context: FallbackContext): FallbackDecision {
  // Nothing about the rung is in doubt yet: the worker never ran. Same rung,
  // started the other way.
  if (failure === 'boot') return { plan: current, rerunOn: current, boot: 'blob' }
  // Shared memory failed, or something failed while it was in use, and the
  // other transport shares nothing with it: worth one run. That goes for a
  // worker that crashed or threw as much as for a failed handshake — on a
  // browser that cannot be debugged, "it might be the shared memory" is not
  // something to rule out by reasoning. The one exception is Pyodide failing
  // to load, which happens before anything is waited on and is the same
  // download either way.
  if (current === 'sab' && context.serviceWorkerSupported && failure !== 'load') return { plan: 'xhr', rerunOn: 'xhr' }
  if (failure === 'transport') return { plan: 'none', rerunOn: 'main-thread' }
  // The worker itself failed, with nothing left to change about how it runs.
  // Run this program on the main thread now; give the worker one more chance
  // on a later run (a dropped connection while Pyodide loads looks exactly
  // like this) before settling there.
  return {
    plan: context.workerFailures + 1 >= WORKER_FAILURES_BEFORE_GIVING_UP ? 'none' : current,
    rerunOn: 'main-thread',
  }
}

const TRANSPORT_NAMES: Record<TraceTransport, string> = {
  sab: 'shared memory',
  xhr: 'a service worker',
}

/** Printed at the top of the re-run. `reason` is the worker's own account of the failure. */
export function fallbackNote(failed: TraceTransport, decision: FallbackDecision, reason: string): string {
  const why = `[INFO] What went wrong: ${reason.trim().replace(/\s*\n\s*/g, ' ') || 'unknown error'}`
  if (decision.boot === 'blob') {
    return '[INFO] This browser would not start the step-by-step runner\'s worker from its own address, '
      + `so it was started from a copy instead and your program run again. Nothing else is different.\n${why}`
  }
  if (decision.rerunOn !== 'main-thread') {
    return `[INFO] The step-by-step runner did not work using ${TRANSPORT_NAMES[failed]} in this browser, `
      + `so it has switched to ${TRANSPORT_NAMES[decision.rerunOn]} and started your program again. Stepping and input() work the same.\n${why}`
  }
  const later = decision.plan === 'none'
    ? 'Programs will keep running there in this tab.'
    : 'The step-by-step runner will be tried again on your next run.'
  return '[INFO] The step-by-step runner could not start in this browser, so your program is running on the main thread instead: '
    + `it runs normally, without stepping or the variable inspector. ${later}\n${why}`
}

/** For the banner shown once a tab has given up on the worker. */
export function workerUnavailableMessage(reason: string): string {
  // The first line only, without its own full stop: the sentence supplies one.
  const cause = reason.trim().split('\n')[0].replace(/\.$/, '') || 'unknown error'
  return `The step-by-step runner was tried in this browser and could not start (${cause}).`
}

const STORAGE_KEY = 'coder_worker_plan'

export interface RememberedPlan { plan: WorkerPlan; reason: string }

/**
 * Per tab session, and per build of the app: a new tab tries the best rung
 * again, and so does a tab reloaded onto a newer version. Without the version
 * a tab that had settled on the main thread stayed there through the very
 * release that fixed what sent it there — sessionStorage survives a reload.
 */
export function rememberWorkerPlan(remembered: RememberedPlan | null, version: string): void {
  try {
    if (remembered) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...remembered, version }))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch { /* storage refused: the fallback simply happens again next load */ }
}

export function recallWorkerPlan(version: string): RememberedPlan | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as (Partial<RememberedPlan> & { version?: string }) | null
    if (parsed?.version !== version) return null
    if (parsed && (parsed.plan === 'sab' || parsed.plan === 'xhr' || parsed.plan === 'none')) {
      return { plan: parsed.plan, reason: String(parsed.reason ?? '') }
    }
  } catch { /* unreadable: nothing remembered */ }
  return null
}
