// ── plotly ──────────────────────────────────────────────────────────────────
//
// Unlike matplotlib, plotly does not draw a picture: it emits a description that
// plotly.js turns into an interactive chart in a browser. There is no static
// renderer available here — that is kaleido, a native binary with no wasm build
// — so a plotly figure reaches the Display pane as the thing it actually is, a
// small HTML document, shown in a sandboxed iframe.
//
// That is the better outcome anyway. Hovering a point to read its value, zooming
// into a range and toggling a series off the legend are most of why someone
// reaches for plotly, and all of it survives.
//
// plotly is not one of Pyodide's built-in packages, so it is installed with
// micropip at the start of a run that needs it (see `micropipInstallCode`).

/** A `.py` source that pulls in plotly at all. */
export const PLOTLY_IMPORT_REGEX = /^\s*(?:import\s+plotly|from\s+plotly\b)/m

/**
 * Installed before the student's code so `fig.show()` has somewhere to go.
 *
 * `BaseFigure.show()` defers to `plotly.io.show`, so patching the one function
 * catches `fig.show()`, `pio.show(fig)` and everything built on them.
 */
export const PLOTLY_BOOTSTRAP = String.raw`
import plotly.io as _plotly_io


def _coder_plotly_show(fig, *_args, **_kwargs):
    # include_plotlyjs='cdn' keeps the payload a few KB rather than inlining the
    # ~4MB plotly.js bundle into every single figure.
    js_plotly_figure(fig.to_html(include_plotlyjs='cdn', full_html=True,
                                 default_width='100%', default_height='420px'))


_plotly_io.show = _coder_plotly_show
`

/**
 * Python that installs packages Pyodide does not ship.
 *
 * Run with `runPythonAsync`, which allows top-level await — the student's own
 * code is compiled without it, so they could not do this themselves even if
 * they knew to.
 */
export function micropipInstallCode(packages: string[]): string {
  return `import micropip\nawait micropip.install(${JSON.stringify(packages)})\n`
}
