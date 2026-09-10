// ── Making a reused Pyodide runtime look freshly started ────────────────────
//
// Loading and compiling Pyodide is by far the most expensive part of starting a
// run, so both runtimes keep one instance alive across runs: the main thread
// caches its Pyodide (`loadMainThreadPyodide`) and the trace worker is recycled
// after a clean run rather than terminated. What the previous run left behind
// therefore has to be cleared explicitly, or the student sees a program that
// does not match the code in front of them.
//
// The Reset button is still the full teardown: it throws the worker (and the
// main-thread runtime) away and reloads Pyodide from scratch.

export const PYODIDE_RUNTIME_RESET_CODE = String.raw`
import sys as _reset_sys
import importlib as _reset_importlib
import time as _reset_time

# A run that ended inside the debugger can leave the trace hook installed.
_reset_sys.settrace(None)

# Bytecode caching would write __pycache__ next to the student's own modules,
# where the post-run filesystem sweep would pick it up and show it in the file
# browser (and hand back a stale .pyc after an edit).
_reset_sys.dont_write_bytecode = True

# The stdctx bootstrap swaps time.sleep for a blocking JS bridge. Put the real
# one back so the next run — which may not use stdctx at all — is not left with
# it. The bootstrap stashes the original the first time it patches.
_reset_real_sleep = getattr(_reset_time, '_coder_real_sleep', None)
if _reset_real_sleep is not None:
    _reset_time.sleep = _reset_real_sleep

# Modules the last run imported from the mounted filesystem must not be served
# out of sys.modules once the student has edited them. Pyodide's own standard
# library and site-packages live under /lib, so anything with a __file__
# outside it was loaded from the (now replaced) working directory.
for _reset_name, _reset_mod in list(_reset_sys.modules.items()):
    _reset_file = getattr(_reset_mod, '__file__', None)
    if isinstance(_reset_file, str) and not _reset_file.startswith('/lib/'):
        _reset_sys.modules.pop(_reset_name, None)

# The turtle shim and the sys.stdctx / sys.stdaud objects are injected rather
# than imported, so they carry no __file__ and have to be named.
_reset_sys.modules.pop('turtle', None)
for _reset_attr in ('stdctx', 'stdaud'):
    try:
        delattr(_reset_sys, _reset_attr)
    except AttributeError:
        pass

_reset_importlib.invalidate_caches()
`
