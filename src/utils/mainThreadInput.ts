// ── input() on the main thread ───────────────────────────────────────────────
//
// On the main thread, Python and the page share one thread. A synchronous
// `input()` there used to be `window.prompt`, which freezes the page: nothing
// the program printed since it started could be painted (React cannot render
// and xterm paints on requestAnimationFrame), so a student answered a pop-up
// with no idea what the program had just said, and then the whole transcript
// arrived at once when the program ended.
//
// JSPI (WebAssembly JavaScript Promise Integration) removes the freeze. Pyodide
// exposes it as `pyodide.ffi.run_sync(awaitable)`: the WebAssembly stack — the
// whole Python interpreter, mid-`input()` — is suspended, the page's event loop
// runs (console paints, the inline input takes keystrokes, Stop is clickable),
// and Python resumes where it stopped when the promise resolves. To Python it is
// still an ordinary blocking call, so student code is unchanged.
//
// Two conditions, both checked per call by `can_run_sync()`:
//   - the browser supports JSPI (Chrome 137+, Firefox, Safari 27+);
//   - every frame since the run was entered is Python. The run starts through
//     `runPythonAsync`, so that holds for ordinary code, the pygame/stdctx async
//     rewrites and turtle key callbacks polled from Python. It would not hold for
//     Python called synchronously back from a JS event handler.
// When either fails, input falls back to `window.prompt` — now showing the
// recent console output above the question and echoing the exchange into the
// console afterwards, so the pop-up at least makes sense.

/**
 * Installed before every main-thread run (all modes: plain, pygame, turtle,
 * stdctx). Needs these JS globals: `js_input_async(prompt) -> Promise<str>`,
 * `js_input_prompt(prompt) -> str` and `js_should_stop_main_thread() -> bool`.
 *
 * A Stop while waiting resolves the promise with the stop flag set; raising
 * SystemExit then ends the program the way `quit()` does, which every
 * main-thread path already treats as a normal ending.
 */
export const MAIN_THREAD_INPUT_BOOTSTRAP = String.raw`
import builtins as _coder_builtins

try:
    from pyodide.ffi import can_run_sync as _coder_can_run_sync, run_sync as _coder_run_sync
except ImportError:
    _coder_can_run_sync = None
    _coder_run_sync = None


def __coder_read_line(prompt=""):
    prompt = "" if prompt is None else str(prompt)
    if _coder_can_run_sync is not None and _coder_can_run_sync():
        answer = _coder_run_sync(js_input_async(prompt))
        if js_should_stop_main_thread():
            raise SystemExit()
        return "" if answer is None else str(answer)
    return str(js_input_prompt(prompt))


_coder_builtins.input = __coder_read_line
`

/** Whether this browser can suspend WebAssembly on a promise (JSPI). */
export function browserSupportsJspi(): boolean {
  const wasm = (globalThis as { WebAssembly?: Record<string, unknown> }).WebAssembly
  return typeof wasm?.Suspending === 'function'
}

/** What input() looks like on the main thread in this browser, in a sentence. */
export function mainThreadInputSummary(jspi: boolean): string {
  return jspi
    ? 'input() is answered in the console, as it is in the trace worker.'
    : 'input() uses browser pop-up boxes that show the latest output above the question.'
}

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE = /\x1b\[[0-9;?]*[A-Za-z]/g

/** Default number of characters of console output kept for the pop-up. */
export const RECENT_OUTPUT_CHARS = 4000

/** Append `text` to the running tail of console output, keeping at most `maxChars`. */
export function rememberRecentOutput(previous: string, text: string, maxChars = RECENT_OUTPUT_CHARS): string {
  const combined = previous + text.replace(ANSI_ESCAPE, '')
  return combined.length > maxChars ? combined.slice(combined.length - maxChars) : combined
}

/**
 * The message for a `window.prompt`: the last few lines the program printed,
 * then the question itself. The browser's pop-up covers the console, so this
 * is the only way the student sees what they are answering.
 */
export function promptWithRecentOutput(
  recentOutput: string,
  prompt: string,
  maxLines = 12,
  maxChars = 1200,
): string {
  const lines = recentOutput.replace(/\r\n?/g, '\n').split('\n')
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
  let context = lines.slice(-maxLines).join('\n')
  if (context.length > maxChars) context = '…' + context.slice(context.length - maxChars + 1)
  const question = prompt.trimEnd()
  if (!context) return question
  if (!question) return context
  return `${context}\n\n${question}`
}
