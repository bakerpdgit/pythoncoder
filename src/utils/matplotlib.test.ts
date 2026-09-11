import { describe, expect, it } from 'vitest'
import {
  codeUsesMatplotlib, codeUsesPlotly, codeUsesSeaborn, detectMatplotlib, detectPlottingLibs,
  micropipPackagesFor, pyodidePackagesFor,
} from './codeAnalysis'
import { MATPLOTLIB_BOOTSTRAP, MATPLOTLIB_FLUSH_CODE } from './matplotlib'
import { PLOTLY_BOOTSTRAP, micropipInstallCode } from './plotly'

function file(path: string, source: string) {
  return { path, content: new TextEncoder().encode(source).buffer as ArrayBuffer }
}

describe('codeUsesMatplotlib', () => {
  it('spots the import a student actually writes', () => {
    expect(codeUsesMatplotlib('import matplotlib.pyplot as plt\nplt.plot([1,2])')).toBe(true)
    expect(codeUsesMatplotlib('from matplotlib import pyplot')).toBe(true)
    expect(codeUsesMatplotlib('import matplotlib')).toBe(true)
  })

  it('is not fooled by the word appearing in prose or a string', () => {
    expect(codeUsesMatplotlib('# we will use matplotlib next lesson')).toBe(false)
    expect(codeUsesMatplotlib('print("install matplotlib first")')).toBe(false)
    expect(codeUsesMatplotlib('import math\nimport turtle')).toBe(false)
  })

  it('reads an indented import, as in a function or a try block', () => {
    expect(codeUsesMatplotlib('try:\n    import matplotlib.pyplot as plt\nexcept ImportError:\n    pass')).toBe(true)
  })
})

describe('detectMatplotlib', () => {
  it('finds the import in a module the editor is not showing', () => {
    // The exercise on screen just calls charts.draw(); the plotting lives next
    // door. Detecting only the open file would leave pyplot on webagg.
    expect(detectMatplotlib('import charts\ncharts.draw()', [
      file('/charts.py', 'import matplotlib.pyplot as plt\n'),
    ])).toBe(true)
  })

  it('ignores files that are not Python', () => {
    expect(detectMatplotlib('print(1)', [
      file('/notes.txt', 'import matplotlib.pyplot as plt'),
    ])).toBe(false)
  })

  it('says no when nothing in the program plots', () => {
    expect(detectMatplotlib('print(1)', [file('/helper.py', 'def double(n):\n    return n * 2\n')])).toBe(false)
  })
})

describe('the bootstrap', () => {
  it('fixes the backend before anything can import pyplot', () => {
    const envLine = MATPLOTLIB_BOOTSTRAP.indexOf("environ['MPLBACKEND'] = 'agg'")
    const pyplotImport = MATPLOTLIB_BOOTSTRAP.indexOf('import matplotlib.pyplot')
    expect(envLine).toBeGreaterThan(-1)
    expect(pyplotImport).toBeGreaterThan(envLine)
  })

  it('hands figures to the same bridge both runtimes supply', () => {
    expect(MATPLOTLIB_BOOTSTRAP).toContain('js_matplotlib_figure')
    expect(MATPLOTLIB_BOOTSTRAP).toContain('data:image/png;base64,')
  })

  it('replaces show() rather than leaving webagg to fail on `from js import document`', () => {
    expect(MATPLOTLIB_BOOTSTRAP).toContain('_mpl_plt.show = _coder_show')
  })

  it('flushes leftover figures without being able to fail the run', () => {
    expect(MATPLOTLIB_FLUSH_CODE).toContain('_coder_emit_figures()')
    expect(MATPLOTLIB_FLUSH_CODE).toContain('except Exception')
  })
})

describe('plotly and seaborn', () => {
  it('spots each library by its own import', () => {
    expect(codeUsesPlotly('import plotly.express as px')).toBe(true)
    expect(codeUsesPlotly('from plotly import graph_objects as go')).toBe(true)
    expect(codeUsesSeaborn('import seaborn as sns')).toBe(true)
    expect(codeUsesSeaborn('import seabornish')).toBe(false)
    expect(codeUsesPlotly('print("plotly")')).toBe(false)
  })

  it('treats seaborn as needing matplotlib, because it draws through it', () => {
    const libs = detectPlottingLibs('import seaborn as sns')
    expect(libs.seaborn).toBe(true)
    expect(libs.matplotlib).toBe(true)
    expect(libs.plotly).toBe(false)
  })

  it('asks micropip only for what Pyodide does not ship', () => {
    expect(micropipPackagesFor(detectPlottingLibs('import matplotlib.pyplot as plt'))).toEqual([])
    expect(micropipPackagesFor(detectPlottingLibs('import seaborn as sns'))).toEqual(['seaborn'])
    // The express extra, or plotly.express tells the student to run pip - advice
    // they cannot act on in a browser.
    expect(micropipPackagesFor(detectPlottingLibs('import plotly.express as px')))
      .toEqual(['plotly[express]'])
  })

  it('loads pandas for plotly and matplotlib for seaborn from Pyodide itself', () => {
    expect(pyodidePackagesFor(detectPlottingLibs('import seaborn as sns'))).toEqual(['matplotlib'])
    expect(pyodidePackagesFor(detectPlottingLibs('import plotly.express as px'))).toEqual(['pandas'])
    expect(pyodidePackagesFor(detectPlottingLibs('print(1)'))).toEqual([])
  })

  it('finds every library a program reaches for, across its modules', () => {
    const libs = detectPlottingLibs('import charts', [
      file('/charts.py', 'import seaborn as sns'),
      file('/live.py', 'import plotly.graph_objects as go'),
    ])
    expect(libs).toEqual({ matplotlib: true, plotly: true, seaborn: true })
    expect(micropipPackagesFor(libs)).toEqual(['seaborn', 'plotly[express]'])
  })

  it('patches the one function every plotly show() goes through', () => {
    // BaseFigure.show() defers to plotly.io.show, so this catches fig.show(),
    // pio.show(fig) and anything built on them.
    expect(PLOTLY_BOOTSTRAP).toContain('_plotly_io.show = _coder_plotly_show')
    expect(PLOTLY_BOOTSTRAP).toContain('js_plotly_figure')
    // The bundle is ~4MB; inlining it into every figure is not an option.
    expect(PLOTLY_BOOTSTRAP).toContain("include_plotlyjs='cdn'")
  })

  it('installs with top-level await, which student code cannot use', () => {
    const code = micropipInstallCode(['seaborn', 'plotly[express]'])
    expect(code).toContain('import micropip')
    expect(code).toContain('await micropip.install(["seaborn","plotly[express]"])')
  })

  it('still answers the narrow matplotlib question for callers that only ask that', () => {
    expect(detectMatplotlib('import seaborn as sns')).toBe(true)
    expect(detectMatplotlib('import plotly.express as px')).toBe(false)
  })
})
