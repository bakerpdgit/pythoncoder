// ── matplotlib ──────────────────────────────────────────────────────────────
//
// Pyodide ships matplotlib, and `loadPackagesFromImports` already installs it
// the moment a student's `import matplotlib.pyplot` is scanned. What it cannot
// supply is a *screen*: matplotlib's default interactive backend is webagg,
// whose first act is `from js import document`. There is no document in a Web
// Worker, so `plt.show()` died with
//
//   ImportError: cannot import name 'document' from 'js'
//
// The answer is not to move plotting to the main thread — that would cost the
// student Debug, Trace and the variable inspector for every program that draws
// a chart. It is to render with Agg, which needs no DOM at all, and hand the
// finished PNG to the Display pane. Both runtimes then behave identically, and
// a plotting program can be stepped through a line at a time like any other.
//
// `plt.show()` is what the student writes and what the textbooks say, so that is
// the trigger. Figures they build but never show are delivered at the end of the
// run instead (`MATPLOTLIB_FLUSH_CODE`) — forgetting `show()` is a beginner's
// mistake, and an empty Display pane teaches them nothing.

/** A `.py` source that pulls in matplotlib at all. */
export const MATPLOTLIB_IMPORT_REGEX = /^\s*(?:import\s+matplotlib|from\s+matplotlib\b)/m

/**
 * seaborn is a styling and statistics layer over pyplot: it draws through
 * matplotlib, so everything above applies to it unchanged and it needs no
 * bootstrap of its own — only installing, since Pyodide does not ship it.
 */
export const SEABORN_IMPORT_REGEX = /^\s*(?:import\s+seaborn\b|from\s+seaborn\b)/m

/**
 * Installed before the student's own `import matplotlib.pyplot`, so pyplot is
 * built against Agg rather than webagg — the backend is fixed at import time,
 * and by the time their import runs it is already too late to change it.
 */
export const MATPLOTLIB_BOOTSTRAP = String.raw`
import os as _mpl_os

# Read by matplotlib at import time; set before anything imports pyplot.
_mpl_os.environ['MPLBACKEND'] = 'agg'

import matplotlib as _mpl
_mpl.use('agg', force=True)

import base64 as _mpl_base64
import io as _mpl_io
import matplotlib.pyplot as _mpl_plt


def _coder_emit_figures():
    """Send every open figure to the Display pane, then close them."""
    for _num in _mpl_plt.get_fignums():
        _fig = _mpl_plt.figure(_num)
        _buf = _mpl_io.BytesIO()
        try:
            # facecolor: keep the figure's own background rather than letting
            # savefig default to white over a student's chosen colour.
            _fig.savefig(_buf, format='png', dpi=100, bbox_inches='tight',
                         facecolor=_fig.get_facecolor())
        except Exception as _exc:  # a broken figure must not end the run
            print('[matplotlib] could not draw figure %s: %s' % (_num, _exc))
            continue
        js_matplotlib_figure(
            'data:image/png;base64,' + _mpl_base64.b64encode(_buf.getvalue()).decode('ascii'))
    _mpl_plt.close('all')


def _coder_show(*_args, **_kwargs):
    _coder_emit_figures()


# block=True/False and the rest of show()'s interactive signature are accepted
# and ignored: there is no event loop to block on.
_mpl_plt.show = _coder_show
`

/**
 * Run after the student's code, for figures they built but never showed.
 * Silent when there are none, and never allowed to fail a run that otherwise
 * succeeded.
 */
export const MATPLOTLIB_FLUSH_CODE = String.raw`
try:
    _coder_emit_figures()
except Exception:
    pass
`
