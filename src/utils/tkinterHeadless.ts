// ── Coder's tkinter, and CPython's turtle on it, in the tester worker ───────
//
// Submit and guide previews run a program with nothing to draw on: the
// package runs headless (no `_coder_tk_host`), so turtle's delays are skipped,
// done() and mainloop() return at once, and the drawing stays in Python —
// where `tkinter/_coder_svg.py` turns it into the canonical SVG the tester
// compares and the preview shows. Kept apart from utils/tkinter.ts so the
// tester's bundle does not take in the package's sources: the page sends them
// (`tkFilesForTesting`).

import { TKINTER_SHIM_DIR } from './tkinterPaths'

/**
 * Installs the package from `__coder_tk_files__` once per tester, and defines:
 * `_coder_tk_fresh()` — a new tkinter and turtle for each test case and each
 * solution run, whose textinput()/numinput() take the test's inputs as
 * input() does (`_next_test_input`, from the tester's own setup); and
 * `_coder_turtle_svg(include_turtles)` — the drawing, or '' if there is none.
 */
export const TKINTER_TEST_SETUP = String.raw`
import sys as _ct_sys, os as _ct_os, json as _ct_json
import importlib as _ct_importlib
import importlib.util as _ct_util
import py_compile as _ct_compile

_ct_root = ${JSON.stringify(TKINTER_SHIM_DIR)}
for _ct_rel, _ct_src in _ct_json.loads(__coder_tk_files__).items():
    _ct_path = _ct_os.path.join(_ct_root, _ct_rel)
    try:
        with open(_ct_path, encoding='utf-8') as _ct_fh:
            if _ct_fh.read() == _ct_src:
                continue
    except OSError:
        pass
    _ct_os.makedirs(_ct_os.path.dirname(_ct_path), exist_ok=True)
    with open(_ct_path, 'w', encoding='utf-8') as _ct_fh:
        _ct_fh.write(_ct_src)
    try:
        _ct_compile.compile(_ct_path, cfile=_ct_util.cache_from_source(_ct_path), doraise=True)
    except Exception:
        pass
while _ct_root in _ct_sys.path:
    _ct_sys.path.remove(_ct_root)
_ct_sys.path.insert(1 if _ct_sys.path and _ct_sys.path[0] in ('', _ct_os.getcwd()) else 0, _ct_root)
_ct_importlib.invalidate_caches()


def _coder_tk_fresh():
    for name in list(_ct_sys.modules):
        if name in ('tkinter', 'Tkinter', 'turtle', '_coder_tk_host') or name.startswith('tkinter.'):
            del _ct_sys.modules[name]
    import tkinter
    import turtle
    _ct_sys.modules['Tkinter'] = tkinter
    tkinter._app.idle_exit = True

    def textinput(self, title, prompt):
        return _next_test_input(None)

    def numinput(self, title, prompt, default=None, minval=None, maxval=None):
        raw = _next_test_input(None)
        try:
            return float(raw)
        except (TypeError, ValueError):
            return default

    turtle.TurtleScreen.textinput = textinput
    turtle.TurtleScreen.numinput = numinput


def _coder_turtle_svg(include_turtles):
    turtle = _ct_sys.modules.get('turtle')
    if turtle is None:
        return ''
    try:
        from tkinter._coder_svg import turtle_svg
        return turtle_svg(turtle, include_turtles)
    except Exception:
        return ''
`
