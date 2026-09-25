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
import initSource from '../python/tkinter/__init__.py?raw'
import constantsSource from '../python/tkinter/constants.py?raw'
import ttkSource from '../python/tkinter/ttk.py?raw'
import messageboxSource from '../python/tkinter/messagebox.py?raw'
import simpledialogSource from '../python/tkinter/simpledialog.py?raw'
import filedialogSource from '../python/tkinter/filedialog.py?raw'
import colorchooserSource from '../python/tkinter/colorchooser.py?raw'
import commondialogSource from '../python/tkinter/commondialog.py?raw'
import fontSource from '../python/tkinter/font.py?raw'
import scrolledtextSource from '../python/tkinter/scrolledtext.py?raw'
import imagetkSource from '../python/tkinter/_pil_imagetk.py?raw'

/** The package's files, by path under the shim directory. */
export const TKINTER_SHIM_FILES: Record<string, string> = {
  'tkinter/__init__.py': initSource,
  'tkinter/constants.py': constantsSource,
  'tkinter/ttk.py': ttkSource,
  'tkinter/messagebox.py': messageboxSource,
  'tkinter/simpledialog.py': simpledialogSource,
  'tkinter/filedialog.py': filedialogSource,
  'tkinter/colorchooser.py': colorchooserSource,
  'tkinter/commondialog.py': commondialogSource,
  'tkinter/font.py': fontSource,
  'tkinter/scrolledtext.py': scrolledtextSource,
  'tkinter/_pil_imagetk.py': imagetkSource,
}

/** Where the package is written inside Pyodide. Under /lib, so never synced back. */
export const TKINTER_SHIM_DIR = '/lib/coder_tk'

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
 * Installed after MAIN_THREAD_INPUT_BOOTSTRAP. Needs these JS globals:
 * `__coder_tk_files__` (JSON of TKINTER_SHIM_FILES), `__coder_user_code__`,
 * `js_tk_flush`, `js_tk_query`, `js_tk_poll`, `js_tk_dialog`,
 * `js_tk_dialog_sync`, `js_tk_sleep` and `js_should_stop_main_thread`.
 */
export const TKINTER_MAIN_THREAD_BOOTSTRAP = String.raw`
import sys as _tk_sys, os as _tk_os, json as _tk_json, types as _tk_types, builtins as _tk_builtins
import importlib as _tk_importlib
import importlib.util as _tk_importlib_util

_tk_root = ${JSON.stringify(TKINTER_SHIM_DIR)}
for _tk_rel, _tk_src in _tk_json.loads(__coder_tk_files__).items():
    _tk_path = _tk_os.path.join(_tk_root, _tk_rel)
    _tk_os.makedirs(_tk_os.path.dirname(_tk_path), exist_ok=True)
    with open(_tk_path, 'w', encoding='utf-8') as _tk_fh:
        _tk_fh.write(_tk_src)
if _tk_root not in _tk_sys.path:
    _tk_sys.path.insert(0, _tk_root)

# A reused runtime may hold the last run's windows and timers in these modules.
for _tk_name in list(_tk_sys.modules):
    if _tk_name in ('tkinter', 'Tkinter', '_coder_tk_host', 'PIL.ImageTk') or _tk_name.startswith('tkinter.'):
        del _tk_sys.modules[_tk_name]

_tk_host = _tk_types.ModuleType('_coder_tk_host')
_tk_host.flush = js_tk_flush
_tk_host.query = js_tk_query
_tk_host.poll = js_tk_poll
_tk_host.dialog = js_tk_dialog
_tk_host.dialog_sync = js_tk_dialog_sync
_tk_host.sleep = js_tk_sleep
_tk_host.should_stop = js_should_stop_main_thread
_tk_sys.modules['_coder_tk_host'] = _tk_host
_tk_importlib.invalidate_caches()

import tkinter as _coder_tkinter
_tk_sys.modules['Tkinter'] = _coder_tkinter
_coder_tkinter._coder_patch_sleep()


class _CoderImageTkFinder:
    """Serves PIL.ImageTk from the shim: Pillow's own needs Tcl's C API."""

    def find_spec(self, name, path=None, target=None):
        if name == 'PIL.ImageTk':
            return _tk_importlib_util.spec_from_file_location(
                'PIL.ImageTk', _tk_os.path.join(_tk_root, 'tkinter', '_pil_imagetk.py'))
        return None


_tk_sys.meta_path[:] = [f for f in _tk_sys.meta_path if type(f).__name__ != '_CoderImageTkFinder']
_tk_sys.meta_path.insert(0, _CoderImageTkFinder())

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
