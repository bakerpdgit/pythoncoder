/// <reference lib="webworker" />

import { SVG_TURTLE_WORKER_SETUP } from '../utils/mainThread'
import { STDCTX_TEST_BOOTSTRAP } from '../utils/stdctx'
import { MATPLOTLIB_BOOTSTRAP } from '../utils/matplotlib'
import { micropipInstallCode } from '../utils/plotly'
import { detectPlottingLibs, detectSpongeLibs, micropipPackagesFor, pyodidePackagesFor, type PlottingLibs } from '../utils/codeAnalysis'
import { chartComparesColours, chartReqKey } from '../utils/chartCheck'
import coderChartsSource from '../python/coder_charts.py?raw'
import { programPythonFiles, type ProgramFile } from '../utils/importGraph'
import { normalizeTestInputs } from '../utils/testInputs'
import { TKINTER_TEST_SETUP } from '../utils/tkinterHeadless'
import { canvasToDataUrl, compareP5Captures, p5ReqKey, p5RunSettings, parseP5Capture, rasterizeP5, type P5RunSettings } from '../utils/p5Compare'
import type { BookTestOutputReq, ChartComparison, P5Comparison } from '../types'

const PYODIDE_BASE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full'
const PYODIDE_URL = `${PYODIDE_BASE_URL}/pyodide.js`

const RUNNER_SETUP = `
import sys
import builtins
from io import StringIO

_test_output = ''
_test_error = None
_test_namespace: dict = {}
_test_queue = []

def _next_test_input(default=''):
    # The test's inputs, in order: input() takes them, and so do turtle's
    # textinput() and numinput() (see TKINTER_TEST_SETUP).
    return _test_queue.pop(0) if _test_queue else default

def _run_test_case(code_str, inputs_list):
    global _test_output, _test_error, _test_namespace, _test_queue
    buf = StringIO()
    old_stdout = sys.stdout
    sys.stdout = buf
    _test_queue = [str(x) for x in inputs_list]
    def _mock_input(prompt=''):
        if prompt:
            sys.stdout.write(str(prompt))
            sys.stdout.flush()
        return _next_test_input('')
    _test_namespace = {
        '__name__': '__main__',
        '__builtins__': builtins,
        'input': _mock_input,
    }
    _test_error = None
    try:
        exec(compile(code_str, '<student>', 'exec'), _test_namespace)
        # A p5 sketch that defined setup() and draw() but never called run()
        # is started after its last line, as on the page.
        _p5m = sys.modules.get('p5')
        if _p5m is not None and hasattr(_p5m, '_coder_autorun'):
            _p5m._coder_autorun(_test_namespace)
    except SystemExit:
        pass
    except Exception:
        import traceback
        _test_error = traceback.format_exc()
    finally:
        sys.stdout = old_stdout
    _test_output = buf.getvalue()

def _eval_stmt(stmt):
    try:
        return str(eval(stmt, _test_namespace))
    except Exception as e:
        return '__ERR__:' + str(e)

def _read_file(filename):
    for p in [filename, '/' + filename.lstrip('/')]:
        try:
            with open(p, 'r') as f:
                return f.read()
        except Exception:
            pass
    return None
`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pyodide: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pyodidePromise: Promise<any> | null = null

// Loading/compiling the runtime is shared by background warm-up and the first
// real submission, so a quick submit while warming never starts a second load.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensurePyodide(): Promise<any> {
  if (pyodide) return pyodide
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
    // Classic worker (production): importScripts works. Module worker (Vite dev): fall back to dynamic import.
      if (typeof (self as any).loadPyodide !== 'function') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(self as any).importScripts(PYODIDE_URL)
        } catch {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mod = await (import(/* @vite-ignore */ PYODIDE_URL) as Promise<any>)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (!(self as any).loadPyodide && mod?.loadPyodide) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(self as any).loadPyodide = mod.loadPyodide
          }
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof (self as any).loadPyodide !== 'function') {
        throw new Error('The Pyodide loader did not initialise in the test worker.')
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtime = await (self as any).loadPyodide({
        indexURL: `${PYODIDE_BASE_URL}/`,
      })
      runtime.runPython(RUNNER_SETUP)
      pyodide = runtime
      return runtime
    })()
  }
  try {
    return await pyodidePromise
  } catch (error) {
    pyodidePromise = null
    throw error
  }
}

async function initPyodide(code: string, modules: ProgramFile[] = []): Promise<void> {
  await ensurePyodide()
  // The modules a challenge imports may need packages the challenge itself
  // never names, and Pyodide installs only what it is shown.
  const decoder = new TextDecoder()
  for (const source of [code, ...modules.map(file => decoder.decode(file.content))]) {
    try { await pyodide.loadPackagesFromImports(source) } catch { /* ignore */ }
  }
}

function mountFiles(files: Array<{ path: string; content: ArrayBuffer }>): void {
  for (const file of files) {
    try {
      const dir = file.path.substring(0, file.path.lastIndexOf('/')) || '/'
      if (dir !== '/') { try { pyodide.FS.mkdirTree(dir) } catch { /* exists */ } }
      pyodide.FS.writeFile(file.path, new Uint8Array(file.content))
    } catch { /* skip */ }
  }
}

// Canvas and audio challenges still have to import cleanly under test. Draw and
// audio calls are swallowed here (a tester worker has neither) and sleeps are
// skipped, so an animated stdctx program's output assertions run at full speed.
function installStdctxForTests(): void {
  pyodide.globals.set('js_stdctx_send', () => undefined)
  pyodide.globals.set('js_stdctx_check_key', () => false)
  pyodide.globals.set('js_stdctx_sleep', () => undefined)
  pyodide.globals.set('js_stdaud_send', () => undefined)
  pyodide.runPython(STDCTX_TEST_BOOTSTRAP)
}

// A plotting challenge has to import and run under test, so seaborn and plotly
// are installed here as they are for a run. Nothing is drawn: plt.show() and
// fig.show() describe each chart instead (src/python/coder_charts.py), which is
// what a 'chart' requirement compares with its solution's, and costs far less
// than rendering a picture nobody sees.
const plottingInstalled = { matplotlib: false, plotly: false, seaborn: false }
async function installPlottingForTests(libs: PlottingLibs): Promise<void> {
  if (!libs.matplotlib && !libs.plotly) return
  if (!pyodide.runPython("'_coder_charts' in globals()")) {
    pyodide.globals.set('_tc_charts_src', coderChartsSource)
    pyodide.runPython(`
import sys as _tc_sys, types as _tc_types
_coder_charts = _tc_types.ModuleType('_coder_charts')
exec(compile(_tc_charts_src, 'coder_charts.py', 'exec'), _coder_charts.__dict__)
_tc_sys.modules['_coder_charts'] = _coder_charts
`)
  }
  const micropip = micropipPackagesFor(libs).filter(pkg =>
    pkg === 'seaborn' ? !plottingInstalled.seaborn : !plottingInstalled.plotly)
  const extra = pyodidePackagesFor(libs)
  try {
    if (extra.length) await pyodide.loadPackage(extra)
    if (micropip.length) {
      self.postMessage({ type: 'status', message: `Installing ${micropip.join(', ')}…` })
      await pyodide.loadPackage('micropip')
      await pyodide.runPythonAsync(micropipInstallCode(micropip))
    }
  } catch { /* the program's own import reports it */ }
  if (libs.seaborn) plottingInstalled.seaborn = true
  if (libs.matplotlib && !plottingInstalled.matplotlib) {
    pyodide.globals.set('js_matplotlib_figure', () => undefined)
    try {
      pyodide.runPython(MATPLOTLIB_BOOTSTRAP)
      pyodide.runPython(`
import matplotlib.pyplot as _tc_plt
_tc_plt.show = lambda *_a, **_k: _coder_charts.capture_open_figures()
`)
      plottingInstalled.matplotlib = true
    } catch { /* no matplotlib in this build */ }
  }
  if (libs.plotly && !plottingInstalled.plotly) {
    try {
      pyodide.runPython(`
import plotly.io as _tc_pio
_tc_pio.show = lambda fig, *_a, **_k: _coder_charts.capture_plotly(fig)
`)
      plottingInstalled.plotly = true
    } catch { /* plotly would not install */ }
  }
}

/** Run a program as a test does and keep the charts it drew (in Python, as `name`). */
function runAndCaptureCharts(srcCode: string, inputs: Array<string | number>, name: string): void {
  if (plottingInstalled.matplotlib) pyodide.runPython('_tc_plt.close("all")')
  if (pyodide.runPython("'_coder_charts' in globals()")) pyodide.runPython('_coder_charts.reset()')
  pyodide.globals.set('_tc_code', srcCode)
  pyodide.globals.set('_tc_inputs', pyodide.toPy(inputs))
  pyodide.runPython('_run_test_case(_tc_code, _tc_inputs)')
  keepCharts(name)
}

/** Figures built but never shown count as drawn, as on the page; then keep them as `name`. */
function keepCharts(name: string): void {
  if (!pyodide.runPython("'_coder_charts' in globals()")) {
    pyodide.runPython(`${name} = []`)
    return
  }
  if (plottingInstalled.matplotlib) pyodide.runPython('_coder_charts.capture_open_figures()')
  pyodide.runPython(`${name} = _coder_charts.take()`)
}

/** The solution files a challenge's chart requirements name, from the files sent with it. */
function chartSolutionFiles(
  tests: Array<{ out?: string | BookTestOutputReq[] }>,
  files: ProgramFile[],
): ProgramFile[] {
  const wanted = new Set<string>()
  for (const test of tests) {
    for (const req of Array.isArray(test.out) ? test.out : []) {
      if (req.typ === 'chart' && req.filename) wanted.add('/' + req.filename.replace(/^\//, ''))
    }
  }
  return files.filter(file => wanted.has('/' + file.path.replace(/^\//, '')))
}

function readFileFromFs(filename: string): string {
  for (const p of [filename, '/' + filename.replace(/^\//, '')]) {
    try {
      return pyodide.FS.readFile(p, { encoding: 'utf8' }) as string
    } catch { /* try next */ }
  }
  return ''
}

/**
 * Coder's tkinter and CPython's turtle, headless (utils/tkinterHeadless.ts).
 * Sent by the page when a challenge draws with turtle or uses tkinter; without
 * it, turtle tests fall back to the old SVG turtle.
 */
let coderTkInstalled = false
function installCoderTk(files: Record<string, string>): void {
  pyodide.globals.set('__coder_tk_files__', JSON.stringify(files))
  pyodide.runPython(TKINTER_TEST_SETUP)
  coderTkInstalled = true
}

/** The drawing the last run left, as canonical SVG; without the turtles for marking, with them for a preview. */
function capturedSvg(includeTurtles: boolean): string {
  if (coderTkInstalled) {
    pyodide.globals.set('_tc_include', includeTurtles)
    return String(pyodide.runPython('_coder_turtle_svg(_tc_include)') ?? '')
  }
  const v = pyodide.globals.get('__turtle_svg__')
  return v ? String(v) : ''
}

function freshTurtle(): void {
  if (coderTkInstalled) pyodide.runPython('_coder_tk_fresh()')
  else pyodide.runPython(SVG_TURTLE_WORKER_SETUP)
}

function runCodeAndCaptureSvg(srcCode: string, inputs: Array<string | number>, includeTurtles = false): string {
  freshTurtle()
  pyodide.globals.set('_tc_code', srcCode)
  pyodide.globals.set('_tc_inputs', pyodide.toPy(inputs))
  pyodide.runPython('_run_test_case(_tc_code, _tc_inputs)')
  return capturedSvg(includeTurtles)
}

/**
 * One headless run of a p5 sketch, set up as a test says (frames, mouse), and
 * what its canvas ended up showing (p5._coder_capture), or '' if it drew nothing.
 */
function runP5AndCapture(
  srcCode: string,
  inputs: Array<string | number>,
  settings: P5RunSettings,
  files: Array<{ path: string; content: ArrayBuffer }>,
): string {
  if (files?.length) mountFiles(files)
  try { pyodide.runPython('import os; os.chdir("/")') } catch { /* ignore */ }
  pyodide.globals.set('_tc_frames', settings.frames)
  // undefined, not null: Pyodide turns null into JsNull rather than None.
  pyodide.globals.set('_tc_mouse', settings.mouse ? pyodide.toPy(settings.mouse) : undefined)
  pyodide.globals.set('_tc_pressed', settings.pressed)
  pyodide.runPython('_coder_p5_prepare(_tc_frames, _tc_mouse, _tc_pressed)')
  pyodide.globals.set('_tc_code', srcCode)
  pyodide.globals.set('_tc_inputs', pyodide.toPy(inputs))
  pyodide.runPython('_run_test_case(_tc_code, _tc_inputs)')
  return String(pyodide.runPython('_coder_p5_capture()') ?? '')
}

self.onmessage = async (e: MessageEvent) => {
  if (e.data.type === 'prewarm') {
    try {
      await ensurePyodide()
      self.postMessage({ type: 'runtime-ready' })
    } catch (err) {
      self.postMessage({ type: 'warm-error', error: String(err) })
    }
    return
  }

  if (e.data.type === 'preview_turtle') {
    const { solutionCode, inputs, files, tkFiles } = e.data as {
      solutionCode: string
      inputs: Array<string | number>
      files: Array<{ path: string; content: ArrayBuffer }>
      tkFiles?: Record<string, string> | null
    }
    try {
      await initPyodide(solutionCode, programPythonFiles(solutionCode, null, files ?? []))
      if (files?.length) mountFiles(files)
      try { pyodide.runPython('import os; os.chdir("/")') } catch { /* ignore */ }
      if (tkFiles) installCoderTk(tkFiles)
      // A preview shows the turtles where they stopped, as the student will see it.
      const svg = runCodeAndCaptureSvg(solutionCode, inputs, true)
      self.postMessage({ type: 'preview_done', svg })
    } catch (err) {
      self.postMessage({ type: 'preview_error', error: String(err) })
    }
    return
  }

  if (e.data.type === 'preview_p5') {
    const { solutionCode, inputs, files, tkFiles, req } = e.data as {
      solutionCode: string
      inputs: Array<string | number>
      files: Array<{ path: string; content: ArrayBuffer }>
      tkFiles?: Record<string, string> | null
      req: BookTestOutputReq
    }
    try {
      await initPyodide(solutionCode, programPythonFiles(solutionCode, null, files ?? []))
      if (tkFiles) installCoderTk(tkFiles)
      const capture = parseP5Capture(runP5AndCapture(solutionCode, inputs, p5RunSettings(req ?? {}), files ?? []))
      const raster = capture?.started ? await rasterizeP5(capture) : null
      const png = raster ? await canvasToDataUrl(raster.canvas) : ''
      self.postMessage({ type: 'preview_done', png, width: raster?.width ?? 0, height: raster?.height ?? 0 })
    } catch (err) {
      self.postMessage({ type: 'preview_error', error: String(err) })
    }
    return
  }

  if (e.data.type === 'preview_chart') {
    const { solutionCode, inputs, files } = e.data as {
      solutionCode: string
      inputs: Array<string | number>
      files: Array<{ path: string; content: ArrayBuffer }>
    }
    try {
      const programFiles = programPythonFiles(solutionCode, null, files ?? [])
      await initPyodide(solutionCode, programFiles)
      if (files?.length) mountFiles(files)
      try { pyodide.runPython('import os; os.chdir("/")') } catch { /* ignore */ }
      await installPlottingForTests(detectPlottingLibs(solutionCode, programFiles))
      runAndCaptureCharts(solutionCode, inputs, '_tc_preview_charts')
      const preview = pyodide.runPython("_coder_charts.preview(_tc_preview_charts) if '_coder_charts' in globals() else '{}'")
      const { png = '', html = '' } = JSON.parse(String(preview ?? '{}')) as { png?: string; html?: string }
      self.postMessage({ type: 'preview_done', png, html })
    } catch (err) {
      self.postMessage({ type: 'preview_error', error: String(err) })
    }
    return
  }

  if (e.data.type !== 'run_tests') return

  const { code, files, tests, tkFiles } = e.data as {
    code: string
    files: Array<{ path: string; content: ArrayBuffer }>
    tkFiles?: Record<string, string> | null
    tests: Array<{
      in?: string | Array<string | number>
      out?: string | BookTestOutputReq[]
    }>
  }

  try {
    self.postMessage({ type: 'status', message: pyodide ? 'Preparing tests…' : 'Finishing Python runtime startup…' })
    // Only what the challenge can import decides what it needs, as for a run.
    const programFiles = programPythonFiles(code, null, files ?? [])
    await initPyodide(code, programFiles)

    const hasTurtleTests = tests.some(t =>
      Array.isArray(t.out) && t.out.some((r: { typ?: string }) => r.typ === 't')
    )
    // A program that imports turtle or tkinter gets the real modules, drawn by
    // nothing, whether or not a test looks at the drawing.
    if (tkFiles) installCoderTk(tkFiles)

    const spongeLibs = detectSpongeLibs(code, programFiles)
    if (spongeLibs.usesStdctx || spongeLibs.usesStdaud) installStdctxForTests()
    // A chart's solution may need a library the student has not imported yet.
    await installPlottingForTests(detectPlottingLibs(code, [...programFiles, ...chartSolutionFiles(tests, files ?? [])]))

    const results: Array<{
      caseIndex: number
      output: string
      error: string | null
      statementResults: Record<string, string>
      fileContents: Record<string, string | null>
      turtleSvg: string
      solutionTurtleSvgs: Record<string, string>
      p5Results: Record<string, P5Comparison>
      chartResults: Record<string, ChartComparison>
    }> = []

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i]
      self.postMessage({ type: 'status', message: `Running test case ${i + 1} of ${tests.length}…` })

      // Re-mount original files for isolation between tests
      if (files?.length) mountFiles(files)
      try { pyodide.runPython('import os; os.chdir("/")') } catch { /* ignore */ }

      // A fresh turtle (and tkinter) for each test
      if (hasTurtleTests || coderTkInstalled) freshTurtle()

      const inputs = normalizeTestInputs(test.in)

      // The student's run, keeping the charts it draws for any 'chart' requirement.
      runAndCaptureCharts(code, inputs, '_tc_student_charts')

      const output: string = String(pyodide.globals.get('_test_output') ?? '')
      const errorVal = pyodide.globals.get('_test_error')
      const error: string | null = errorVal ? String(errorVal) : null

      const turtleSvg: string = hasTurtleTests ? capturedSvg(false) : ''

      const statementResults: Record<string, string> = {}
      const fileContents: Record<string, string | null> = {}
      const solutionTurtleSvgs: Record<string, string> = {}

      const reqs = Array.isArray(test.out) ? test.out : []
      // First pass: capture user-namespace data (statements, files written by user)
      // before any solution code runs and overwrites the namespace.
      for (const req of reqs) {
        if ((req.typ === 's+' || req.typ === 's-') && req.statement) {
          if (!(req.statement in statementResults)) {
            pyodide.globals.set('_tc_stmt', req.statement)
            pyodide.runPython('_tc_sr = _eval_stmt(_tc_stmt)')
            statementResults[req.statement] = String(pyodide.globals.get('_tc_sr') ?? '')
          }
        }
        if ((req.typ === 'f+' || req.typ === 'f-') && req.filename) {
          if (!(req.filename in fileContents)) {
            pyodide.globals.set('_tc_fname', req.filename)
            pyodide.runPython('_tc_fr = _read_file(_tc_fname)')
            const fv = pyodide.globals.get('_tc_fr')
            fileContents[req.filename] = fv !== null && fv !== undefined ? String(fv) : null
          }
        }
      }
      // Second pass: run solution files for any 't' reqs.
      for (const req of reqs) {
        if (req.typ === 't' && req.filename && !(req.filename in solutionTurtleSvgs)) {
          const solCode = readFileFromFs(req.filename)
          solutionTurtleSvgs[req.filename] = solCode ? runCodeAndCaptureSvg(solCode, inputs) : ''
        }
      }

      // Third pass: p5 sketches, run again as each requirement says and
      // compared with the solution by the pictures they draw.
      const p5Results: Record<string, P5Comparison> = {}
      for (const req of reqs) {
        if (req.typ !== 'p5' || !req.filename) continue
        const key = p5ReqKey(req)
        if (key in p5Results) continue
        if (!coderTkInstalled) {
          p5Results[key] = { passed: false, method: 'pixels', message: 'p5 was not available to the tester.' }
          continue
        }
        const settings = p5RunSettings(req)
        const solCode = readFileFromFs(req.filename)
        const actual = runP5AndCapture(code, inputs, settings, files ?? [])
        const expected = solCode ? runP5AndCapture(solCode, inputs, settings, files ?? []) : ''
        p5Results[key] = await compareP5Captures(actual, expected)
      }

      // Fourth pass: charts, each solution run once and compared by what its
      // charts show (src/python/coder_charts.py).
      const chartResults: Record<string, ChartComparison> = {}
      const solutionsRun = new Set<string>()
      for (const req of reqs) {
        if (req.typ !== 'chart' || !req.filename) continue
        const key = chartReqKey(req)
        if (key in chartResults) continue
        const solName = `_tc_sol_charts_${solutionsRun.size}`
        const solCode = readFileFromFs(req.filename)
        if (!solCode) {
          chartResults[key] = { passed: false, message: `The solution file ${req.filename} is missing.`, differences: [] }
          continue
        }
        if (!solutionsRun.has(req.filename)) {
          runAndCaptureCharts(solCode, inputs, solName)
          solutionsRun.add(req.filename)
          pyodide.runPython(`_tc_sol_by_file = globals().setdefault('_tc_sol_by_file', {}); _tc_sol_by_file[${JSON.stringify(req.filename)}] = ${solName}`)
        }
        const options = `{'colours': ${chartComparesColours(req) ? 'True' : 'False'}}`
        const verdict = pyodide.runPython(
          `_coder_charts.compare(_tc_sol_by_file[${JSON.stringify(req.filename)}], _tc_student_charts, ${options}) `
          + `if '_coder_charts' in globals() else '{"passed": false, "message": "No chart library was found to mark this.", "differences": []}'`)
        chartResults[key] = JSON.parse(String(verdict)) as ChartComparison
      }
      if (solutionsRun.size) pyodide.runPython('_tc_sol_by_file = {}')

      results.push({ caseIndex: i, output, error, statementResults, fileContents, turtleSvg, solutionTurtleSvgs, p5Results, chartResults })
    }

    self.postMessage({ type: 'done', results })
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err) })
  }
}
