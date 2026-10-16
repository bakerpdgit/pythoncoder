// Test-only: run Python programs under native Python the way the tester worker
// does — stdout captured, every plt.show() / fig.show() described by
// src/python/coder_charts.py rather than drawn — so a test can hand the result
// to the real matcher. Used by chartCheck.test.ts and dataScienceBook.test.ts.

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import type { BookTestCase, BookTestOutputReq, ChartComparison, TesterRunOutput } from '../types'
import { chartComparesColours, chartReqKey } from './chartCheck'

const SRC = resolve(__dirname, '../python')

/** Whether `python` can import everything the charts need. */
export function chartLibrariesAvailable(): { ok: boolean; reason: string } {
  const r = spawnSync('python', ['-c', 'import numpy, pandas, matplotlib, seaborn, plotly'], { encoding: 'utf8' })
  if (r.error) return { ok: false, reason: 'no python on PATH' }
  if (r.status !== 0) return { ok: false, reason: `python lacks the data science libraries: ${r.stderr.trim().split('\n').pop()}` }
  return { ok: true, reason: '' }
}

const HARNESS = String.raw`
import contextlib, io, json, os, sys, traceback, warnings
warnings.simplefilter('ignore')
sys.path.insert(0, SRC)
import matplotlib
matplotlib.use('agg')
import matplotlib.pyplot as plt
import coder_charts as cc
plt.show = lambda *a, **k: cc.capture_open_figures()
import plotly.io as pio
pio.show = lambda fig, *a, **k: cc.capture_plotly(fig)

def run(code):
    plt.close('all')
    cc.reset()
    buf = io.StringIO()
    error = None
    with contextlib.redirect_stdout(buf):
        try:
            exec(compile(code, '<student>', 'exec'), {'__name__': '__main__'})
        except SystemExit:
            pass
        except Exception:
            error = traceback.format_exc()
    cc.capture_open_figures()
    return buf.getvalue(), error, cc.take()

results = []
for job in json.load(sys.stdin):
    os.chdir(job['cwd'])
    output, error, charts = run(job['code'])
    chart_results = {}
    solutions = {}
    for key, filename, colours in job['charts']:
        if filename not in solutions:
            with open(filename) as f:
                solutions[filename] = run(f.read())[2]
        verdict = json.loads(cc.compare(solutions[filename], charts, {'colours': colours}))
        verdict['hasPictures'] = bool(verdict.pop('expected', '')) or bool(verdict.pop('actual', ''))
        chart_results[key] = verdict
    results.append({'output': output, 'error': error, 'chartCount': len(charts), 'chartResults': chart_results})
print(json.dumps(results))
`

export interface PythonJob {
  /** The program. */
  code: string
  /** Where it runs: relative files (data/…, solution files) are read from here. */
  cwd: string
  /** The test cases whose chart requirements are compared against their solutions. */
  tests?: BookTestCase[]
}

export interface PythonRun extends TesterRunOutput {
  chartCount: number
  chartResults: Record<string, ChartComparison & { hasPictures?: boolean }>
}

/** Run every job in one Python process (importing matplotlib is the slow part). */
export function runPythonJobs(jobs: PythonJob[]): PythonRun[] {
  const payload = jobs.map(job => {
    const charts: Array<[string, string, boolean]> = []
    for (const test of job.tests ?? []) {
      for (const req of Array.isArray(test.out) ? test.out as BookTestOutputReq[] : []) {
        if (req.typ !== 'chart' || !req.filename) continue
        const key = chartReqKey(req)
        if (!charts.some(c => c[0] === key)) charts.push([key, req.filename, chartComparesColours(req)])
      }
    }
    return { code: job.code, cwd: job.cwd, charts }
  })
  const r = spawnSync('python', ['-c', `SRC = ${JSON.stringify(SRC)}\n${HARNESS}`], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.status !== 0) throw new Error(`python harness failed: ${r.stderr || r.error}`)
  const results = JSON.parse(r.stdout) as Array<{ output: string; error: string | null; chartCount: number; chartResults: PythonRun['chartResults'] }>
  return results.map(res => ({ ...res, statementResults: {}, fileContents: {} }))
}
