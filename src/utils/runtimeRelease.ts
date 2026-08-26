/**
 * Waiting for a run to actually let go of the code source.
 *
 * Stopping is not instant: a trace worker acknowledges the stop request and
 * flushes its final events before it terminates, and a pygame/turtle
 * main-thread run only unwinds when its loop next checks the stop flag. Callers
 * that need to swap the editor and filesystem out from under a run (book page
 * navigation) therefore have to ask for the stop and then wait for the runtime
 * to release, rather than assuming the next line of code sees a stopped app.
 */
export interface RuntimeReleaseDeps {
  /** True while a run still owns the code source (see `isRuntimeSourceLocked`). */
  isLocked: () => boolean
  /** Requests the stop; may complete asynchronously. */
  stop: () => void
  /** Yields for `ms` — `window.setTimeout` in the app, fake in tests. */
  wait: (ms: number) => Promise<void>
  now: () => number
  /** Give up after this long so a wedged runtime cannot freeze navigation. */
  timeoutMs?: number
  pollMs?: number
}

/**
 * Asks a running program to stop and resolves once it has released the code
 * source. Resolves `true` on release (immediately if nothing was running),
 * `false` if the runtime was still holding on when the timeout expired.
 */
export async function stopAndAwaitRuntimeRelease(deps: RuntimeReleaseDeps): Promise<boolean> {
  const { isLocked, stop, wait, now, timeoutMs = 8000, pollMs = 50 } = deps
  if (!isLocked()) return true
  stop()
  const deadline = now() + timeoutMs
  while (isLocked()) {
    if (now() >= deadline) return false
    await wait(pollMs)
  }
  return true
}
