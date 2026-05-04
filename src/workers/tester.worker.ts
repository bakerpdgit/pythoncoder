/// <reference lib="webworker" />

import { SVG_TURTLE_WORKER_SETUP } from '../utils/mainThread'

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/pyodide.js'

const RUNNER_SETUP = `
import sys
import builtins
from io import StringIO

_test_output = ''
_test_error = None
_test_namespace: dict = {}

def _run_test_case(code_str, inputs_list):
    global _test_output, _test_error, _test_namespace
    buf = StringIO()
    old_stdout = sys.stdout
    sys.stdout = buf
    queue = [str(x) for x in inputs_list]
    def _mock_input(prompt=''):
        if prompt:
            sys.stdout.write(str(prompt))
            sys.stdout.flush()
        return queue.pop(0) if queue else ''
    _test_namespace = {
        '__name__': '__main__',
        '__builtins__': builtins,
        'input': _mock_input,
    }
    _test_error = None
    try:
        exec(compile(code_str, '<student>', 'exec'), _test_namespace)
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

async function initPyodide(code: string): Promise<void> {
  if (!pyodide) {
    // Classic worker (production): importScripts works. Module worker (Vite dev): fall back to dynamic import.
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pyodide = await (self as any).loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/',
    })
    pyodide.runPython(RUNNER_SETUP)
  }
  try { await pyodide.loadPackagesFromImports(code) } catch { /* ignore */ }
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

function readFileFromFs(filename: string): string {
  for (const p of [filename, '/' + filename.replace(/^\//, '')]) {
    try {
      return pyodide.FS.readFile(p, { encoding: 'utf8' }) as string
    } catch { /* try next */ }
  }
  return ''
}

function runCodeAndCaptureSvg(srcCode: string, inputs: Array<string | number>): string {
  pyodide.runPython(SVG_TURTLE_WORKER_SETUP)
  pyodide.globals.set('_tc_code', srcCode)
  pyodide.globals.set('_tc_inputs', pyodide.toPy(inputs))
  pyodide.runPython('_run_test_case(_tc_code, _tc_inputs)')
  const v = pyodide.globals.get('__turtle_svg__')
  return v ? String(v) : ''
}

self.onmessage = async (e: MessageEvent) => {
  if (e.data.type === 'preview_turtle') {
    const { solutionCode, inputs, files } = e.data as {
      solutionCode: string
      inputs: Array<string | number>
      files: Array<{ path: string; content: ArrayBuffer }>
    }
    try {
      await initPyodide(solutionCode)
      if (files?.length) mountFiles(files)
      try { pyodide.runPython('import os; os.chdir("/")') } catch { /* ignore */ }
      const svg = runCodeAndCaptureSvg(solutionCode, inputs)
      self.postMessage({ type: 'preview_done', svg })
    } catch (err) {
      self.postMessage({ type: 'preview_error', error: String(err) })
    }
    return
  }

  if (e.data.type !== 'run_tests') return

  const { code, files, tests } = e.data as {
    code: string
    files: Array<{ path: string; content: ArrayBuffer }>
    tests: Array<{
      in?: string | Array<string | number>
      out?: string | Array<{ typ?: string; statement?: string; filename?: string }>
    }>
  }

  try {
    self.postMessage({ type: 'status', message: 'Loading Python runtime…' })
    await initPyodide(code)

    const hasTurtleTests = tests.some(t =>
      Array.isArray(t.out) && t.out.some((r: { typ?: string }) => r.typ === 't')
    )
    if (hasTurtleTests) {
      pyodide.runPython(SVG_TURTLE_WORKER_SETUP)
    }

    const results: Array<{
      caseIndex: number
      output: string
      error: string | null
      statementResults: Record<string, string>
      fileContents: Record<string, string | null>
      turtleSvg: string
      solutionTurtleSvgs: Record<string, string>
    }> = []

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i]
      self.postMessage({ type: 'status', message: `Running test case ${i + 1} of ${tests.length}…` })

      // Re-mount original files for isolation between tests
      if (files?.length) mountFiles(files)
      try { pyodide.runPython('import os; os.chdir("/")') } catch { /* ignore */ }

      // Reset turtle state before each test
      if (hasTurtleTests) {
        pyodide.runPython(SVG_TURTLE_WORKER_SETUP)
      }

      const inputs: Array<string | number> = Array.isArray(test.in)
        ? test.in
        : test.in !== undefined && test.in !== ''
          ? [test.in as string]
          : []

      pyodide.globals.set('_tc_code', code)
      pyodide.globals.set('_tc_inputs', pyodide.toPy(inputs))
      pyodide.runPython('_run_test_case(_tc_code, _tc_inputs)')

      const output: string = String(pyodide.globals.get('_test_output') ?? '')
      const errorVal = pyodide.globals.get('_test_error')
      const error: string | null = errorVal ? String(errorVal) : null

      const turtleSvgVal = hasTurtleTests ? pyodide.globals.get('__turtle_svg__') : null
      const turtleSvg: string = turtleSvgVal ? String(turtleSvgVal) : ''

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

      results.push({ caseIndex: i, output, error, statementResults, fileContents, turtleSvg, solutionTurtleSvgs })
    }

    self.postMessage({ type: 'done', results })
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err) })
  }
}
