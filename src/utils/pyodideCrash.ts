/**
 * Telling a Pyodide that has crashed from a program that merely failed.
 *
 * A Python exception leaves the interpreter perfectly usable. A *fatal* error —
 * WebAssembly trapping (`memory access out of bounds`, `unreachable`), the JS
 * stack overflowing inside the interpreter, an internal assertion — does not.
 * Pyodide then prints "Pyodide has suffered a fatal error", marks the error with
 * `pyodide_fatal_error`, and replaces every public property of the instance
 * with a getter that throws "Pyodide already fatally failed and can no longer
 * be used." Both runtimes keep their Pyodide between runs, so without noticing
 * this every later run failed the same way until the student found Reset
 * Pyodide.
 */

const FATAL_MESSAGE_PATTERN = /Pyodide already fatally failed|Pyodide has suffered a fatal error/i

/** Whether this error is itself the report of a fatal Pyodide failure. */
export function isPyodideFatalError(error: unknown): boolean {
  if (error && typeof error === 'object' && (error as { pyodide_fatal_error?: unknown }).pyodide_fatal_error) return true
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return FATAL_MESSAGE_PATTERN.test(text)
}

/**
 * Whether a Pyodide instance can still run Python. Asked after a run has
 * failed, when its Python stack has unwound, so running a line is safe. The
 * error text alone is not enough: the failure a program reports is often the
 * trap that caused the crash, not Pyodide's own message.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isPyodideUsable(pyodide: any): boolean {
  if (!pyodide) return false
  try {
    pyodide.runPython('None')
    return true
  } catch {
    return false
  }
}

/**
 * Shown above the automatic re-run. The console is cleared when a run starts,
 * so this is the only trace of the first attempt the student will see.
 */
export function pyodideCrashRetryNote(error: string): string {
  const firstLine = error.split('\n').map(line => line.trim()).find(Boolean) ?? 'unknown error'
  return '[INFO] Python (Pyodide) crashed and has been restarted automatically, so your program is running again from the start.\n'
    + `[INFO] The crash was: ${firstLine}`
}

export const PYODIDE_CRASHED_AGAIN_NOTE =
  '\n[INFO] Python (Pyodide) crashed again straight after restarting, so it was not retried a second time.'
  + ' It has been reset, ready for your next run. If this keeps happening, something in the program itself may be causing it.'
