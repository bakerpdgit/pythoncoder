// ── tkinter on the main thread ───────────────────────────────────────────────
//
// Pyodide has no Tcl/Tk, so a tkinter program runs against Coder's own
// `tkinter` package (src/python/tkinter), which keeps every widget's state in
// Python and has the page draw it (utils/tkinterRenderer.ts). The package is
// real Python files, written into Pyodide's /lib at run start: /lib is where
// Pyodide keeps its own library, so the post-run filesystem sweep never picks
// them up and they never appear in the student's file browser.
//
// A tkinter program always runs on the main thread, like pygame: its widgets
// are elements of this page. mainloop() pauses Python through JSPI between
// events; without JSPI it returns at once and the bootstrap keeps the window
// working from an async loop after the program's last line (see
// `_coder_keepalive` in the package).

import { runProgramPython } from './programExit'
import { codeUsesTurtle } from './codeAnalysis'
import { TKINTER_SHIM_DIR } from './tkinterPaths'

/**
 * The Python files a tkinter or turtle run writes into Pyodide, by path under
 * the shim directory. They are ~500KB of text a program that never opens a
 * window should not download, so they come in their own chunk, fetched the
 * first time a run needs them (utils/tkinterSources.ts).
 *
 * A turtle run also gets `turtle.py`: CPython's own, unmodified, which then
 * draws through Coder's tkinter like any other tkinter program.
 */
export async function loadCoderTkFiles({ turtle }: { turtle: boolean }): Promise<Record<string, string>> {
  const { TKINTER_SHIM_FILES, loadTurtleSource } = await import('./tkinterSources')
  if (!turtle) return TKINTER_SHIM_FILES
  return { ...TKINTER_SHIM_FILES, 'turtle.py': await loadTurtleSource() }
}

export { TKINTER_SHIM_DIR }

// `import tkinter`, `from tkinter import ttk`, `import tkinter.messagebox as mb`,
// and Python 2's `import Tkinter`, which the bootstrap aliases.
export const TKINTER_IMPORT_REGEX = /^\s*(?:import\s+(?:[\w.]+\s*,\s*)*(?:tkinter|Tkinter)\b|from\s+(?:tkinter|Tkinter)\b)/m

const clean = (s: string) => (s || '').replace(/\r\n?/g, '\n')

export const codeUsesTkinter = (source: string): boolean => TKINTER_IMPORT_REGEX.test(clean(source))

/**
 * Whether a whole program reaches for tkinter: the open file, or any module it
 * can import (callers pass `programPythonFiles`). A GUI kept in its own
 * `gui.py` still needs the main thread.
 */
export const detectTkinter = (
  editorSource: string,
  files: Iterable<{ path: string; content: ArrayBuffer }> = [],
): boolean => {
  if (codeUsesTkinter(editorSource)) return true
  const decoder = new TextDecoder()
  for (const file of files) {
    if (!/\.py$/i.test(file.path)) continue
    try {
      if (codeUsesTkinter(decoder.decode(file.content))) return true
    } catch { /* not text */ }
  }
  return false
}

/**
 * The package's sources for the tester worker (utils/tkinterHeadless.ts), or
 * null when the challenge needs none: a turtle test (`t`), or a program that
 * imports turtle or tkinter at all — which used to fail to import under test.
 */
export async function tkFilesForTesting(
  code: string,
  files: Iterable<{ path: string; content: ArrayBuffer }>,
  tests: Array<{ out?: unknown }> = [],
): Promise<Record<string, string> | null> {
  const list = [...files]
  const turtleTests = tests.some(test => Array.isArray(test.out) && test.out.some(req => (req as { typ?: unknown })?.typ === 't'))
  if (!turtleTests && !detectTurtle(code, list) && !detectTkinter(code, list)) return null
  return loadCoderTkFiles({ turtle: true })
}

/**
 * Whether a program uses turtle: the open file, or any module it can import
 * (callers pass `programPythonFiles`), as with detectTkinter.
 */
export const detectTurtle = (
  editorSource: string,
  files: Iterable<{ path: string; content: ArrayBuffer }> = [],
): boolean => {
  if (codeUsesTurtle(editorSource)) return true
  const decoder = new TextDecoder()
  for (const file of files) {
    if (!/\.py$/i.test(file.path)) continue
    try {
      if (codeUsesTurtle(decoder.decode(file.content))) return true
    } catch { /* not text */ }
  }
  return false
}

/**
 * What every tkinter or turtle run does first, in either runtime: write the
 * package (and turtle.py) into /lib/coder_tk, make `_coder_tk_host` from
 * `hostLines`, and import tkinter. Needs the globals `__coder_tk_files__`
 * (JSON of loadCoderTkFiles) and `__coder_turtle__` (a turtle run).
 */
const tkSetup = (hostLines: string) => String.raw`
import sys as _tk_sys, os as _tk_os, json as _tk_json, types as _tk_types, builtins as _tk_builtins
import importlib as _tk_importlib
import importlib.util as _tk_importlib_util
import py_compile as _tk_py_compile

_tk_root = ${JSON.stringify(TKINTER_SHIM_DIR)}
for _tk_rel, _tk_src in _tk_json.loads(__coder_tk_files__).items():
    _tk_path = _tk_os.path.join(_tk_root, _tk_rel)
    try:
        with open(_tk_path, encoding='utf-8') as _tk_fh:
            _tk_same = _tk_fh.read() == _tk_src
    except OSError:
        _tk_same = False
    if _tk_same:
        continue
    _tk_os.makedirs(_tk_os.path.dirname(_tk_path), exist_ok=True)
    with open(_tk_path, 'w', encoding='utf-8') as _tk_fh:
        _tk_fh.write(_tk_src)
    # Compiled once here, beside the source, rather than on every run's import:
    # bytecode is never written by imports in this runtime (dont_write_bytecode,
    # see PYODIDE_RUNTIME_RESET_CODE), and turtle.py alone is 145KB of source.
    try:
        _tk_py_compile.compile(_tk_path, cfile=_tk_importlib_util.cache_from_source(_tk_path), doraise=True)
    except Exception:
        pass
# After the program's own directory, as the standard library sits in CPython:
# a student's own turtle.py or tkinter.py is found first, and fails as it would
# in IDLE, rather than being quietly passed over for ours.
while _tk_root in _tk_sys.path:
    _tk_sys.path.remove(_tk_root)
_tk_sys.path.insert(1 if _tk_sys.path and _tk_sys.path[0] in ('', _tk_os.getcwd()) else 0, _tk_root)

# A reused runtime may hold the last run's windows and timers in these modules.
for _tk_name in list(_tk_sys.modules):
    if _tk_name in ('tkinter', 'Tkinter', 'turtle', '_coder_tk_host', 'PIL.ImageTk') or _tk_name.startswith('tkinter.'):
        del _tk_sys.modules[_tk_name]

_tk_host = _tk_types.ModuleType('_coder_tk_host')
${hostLines}
_tk_sys.modules['_coder_tk_host'] = _tk_host
_tk_importlib.invalidate_caches()

import tkinter as _coder_tkinter
_tk_sys.modules['Tkinter'] = _coder_tkinter
_coder_tkinter._coder_patch_sleep()
# A turtle drawing is finished when it has been drawn: done() returns, and the
# run ends, unless a key, a click or a timer could still do something.
_coder_tkinter._app.idle_exit = bool(__coder_turtle__)
if __coder_turtle__:
    # Imported here, ahead of the program, so that every turtle command it
    # runs marks a step for the replay slider.
    import turtle as _coder_turtle
    _coder_tkinter._coder_watch_turtle(_coder_turtle)


class _CoderImageTkFinder:
    """Serves PIL.ImageTk from the shim: Pillow's own needs Tcl's C API."""

    def find_spec(self, name, path=None, target=None):
        if name == 'PIL.ImageTk':
            return _tk_importlib_util.spec_from_file_location(
                'PIL.ImageTk', _tk_os.path.join(_tk_root, 'tkinter', '_pil_imagetk.py'))
        return None


_tk_sys.meta_path[:] = [f for f in _tk_sys.meta_path if type(f).__name__ != '_CoderImageTkFinder']
_tk_sys.meta_path.insert(0, _CoderImageTkFinder())
`

/**
 * Installed after MAIN_THREAD_INPUT_BOOTSTRAP. Needs, besides tkSetup's,
 * `__coder_user_code__`, `js_tk_flush`, `js_tk_query`, `js_tk_poll`,
 * `js_tk_dialog`, `js_tk_dialog_sync`, `js_tk_sleep` and
 * `js_should_stop_main_thread`.
 */
export const TKINTER_MAIN_THREAD_BOOTSTRAP = tkSetup(String.raw`
_tk_host.flush = js_tk_flush
_tk_host.query = js_tk_query
_tk_host.poll = js_tk_poll
_tk_host.dialog = js_tk_dialog
_tk_host.dialog_sync = js_tk_dialog_sync
_tk_host.sleep = js_tk_sleep
_tk_host.should_stop = js_should_stop_main_thread`) + String.raw`
__coder_tk_ns = {'__name__': '__main__', '__builtins__': _tk_builtins}
try:
    __coder_tk_code = compile(__coder_user_code__, 'simulation.py', 'exec')
${runProgramPython('exec(__coder_tk_code, __coder_tk_ns)').split('\n').map(line => (line ? '    ' + line : line)).join('\n')}
    # The program has ended; a window it left open keeps working until closed.
    try:
        await _coder_tkinter._coder_keepalive()
    except SystemExit:
        pass
finally:
    _coder_tkinter._coder_shutdown()
`

/**
 * The same package drawing from the trace worker (workers/tracer.worker.ts),
 * where Python can simply block: the host is 'sync', its questions are
 * round trips over the run's TraceChannel, and its drawing is posted to the
 * page as it goes. The worker runs the program itself, under its debugger,
 * and then TKINTER_WORKER_AFTER_PROGRAM. Needs, besides tkSetup's,
 * `js_tk_flush`, `js_tk_query`, `js_tk_poll`, `js_tk_dialog_sync`,
 * `js_tk_sleep_sync` and `js_trace_stop_requested`.
 */
export const TKINTER_WORKER_BOOTSTRAP = tkSetup(String.raw`
_tk_host.mode = 'sync'
_tk_host.flush = js_tk_flush
_tk_host.query = js_tk_query
_tk_host.poll = js_tk_poll
_tk_host.dialog_sync = js_tk_dialog_sync
_tk_host.sleep_sync = js_tk_sleep_sync


def _coder_tk_should_stop():
    # A Trace is stopped cooperatively: flush the trace table, acknowledge, and
    # end the program with the trace's own exception (trace_table_check_stop,
    # defined by the worker's setup code). Run and Debug are stopped by
    # terminating the worker, so for them this is only ever a formality.
    if trace_table_enabled:
        trace_table_check_stop()
        return False
    return bool(js_trace_stop_requested())


_tk_host.should_stop = _coder_tk_should_stop`)

/** Run after the program, still under the debugger, so a window it left open keeps working — and its handlers can be stepped. */
export const TKINTER_WORKER_AFTER_PROGRAM = '_coder_tkinter._coder_keepalive_sync()'

/** Run however the program ended: nothing is left to answer the windows. */
export const TKINTER_WORKER_SHUTDOWN = '_coder_tkinter._coder_shutdown()'
