import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluateTestCase } from './testMatcher'
import { chartReqKey } from './chartCheck'
import { chartLibrariesAvailable } from './chartCheck.harness'
import type { ChartComparison } from '../types'

// src/python/coder_charts.py under native Python: two programs' charts, compared
// by what they show. Each case is (expected program, student program) and reads
// the verdict the tester would send the page.

const SRC = resolve(__dirname, '../python')
const libs = chartLibrariesAvailable()

const PREAMBLE = String.raw`
import json, sys, warnings
warnings.simplefilter('ignore')
sys.path.insert(0, SRC)
import matplotlib
matplotlib.use('agg')
import matplotlib.pyplot as plt
import coder_charts as cc
plt.show = lambda *a, **k: cc.capture_open_figures()
import plotly.io as pio
pio.show = lambda fig, *a, **k: cc.capture_plotly(fig)

def charts(code):
    plt.close('all')
    cc.reset()
    exec(code, {'__name__': '__main__'})
    cc.capture_open_figures()
    return cc.take()

for expected, actual, options in json.load(sys.stdin):
    print(cc.compare(charts(expected), charts(actual), options))
`

type Verdict = ChartComparison & { expected?: string; actual?: string }

function compare(...pairs: Array<[string, string] | [string, string, Record<string, unknown>]>): Verdict[] {
  const r = spawnSync('python', ['-c', `SRC = ${JSON.stringify(SRC)}\n${PREAMBLE}`], {
    input: JSON.stringify(pairs.map(([e, a, o]) => [e, a, o ?? {}])),
    encoding: 'utf8',
    timeout: 60_000,
  })
  if (r.status !== 0) throw new Error(r.stderr)
  return r.stdout.trim().split('\n').map(line => JSON.parse(line) as Verdict)
}

const lines = (...l: string[]) => l.join('\n')

const LINE = lines(
  'import matplotlib.pyplot as plt',
  'months = ["Jan", "Feb", "Mar"]',
  'plt.plot(months, [7.9, 8.2, 10.6], marker="o", label="London")',
  'plt.title("Temperature")',
  'plt.xlabel("Month")',
  'plt.ylabel("Degrees")',
  'plt.legend()',
  'plt.show()',
)

describe.skipIf(!libs.ok)(`comparing charts${libs.ok ? '' : ` (skipped: ${libs.reason})`}`, () => {
  it('passes the same chart drawn another way', () => {
    const [same, axesApi, caseAndSpace, mean] = compare(
      [LINE, LINE],
      // The axes methods instead of pyplot's, and the figure never show()n.
      [LINE, lines(
        'import matplotlib.pyplot as plt',
        'fig, ax = plt.subplots()',
        'ax.plot(["Jan", "Feb", "Mar"], [7.9, 8.2, 10.6], "o-", label="London")',
        'ax.set(title="Temperature", xlabel="Month", ylabel="Degrees")',
        'ax.legend()',
      )],
      [LINE, LINE.replace('"Temperature"', '"  temperature "')],
      // Numbers worked out differently, equal to rounding.
      [lines('import matplotlib.pyplot as plt', 'plt.bar(["a", "b"], [0.1 + 0.2, 1 / 3])'),
        lines('import matplotlib.pyplot as plt', 'plt.bar(["a", "b"], [0.3, 0.333333333])')],
    )
    for (const verdict of [same, axesApi, caseAndSpace, mean]) {
      expect(verdict.differences).toEqual([])
      expect(verdict.passed).toBe(true)
    }
    expect(same.expected).toBeUndefined()
  })

  it('says which label is wrong, and shows both charts', () => {
    const [title, xlabel] = compare(
      [LINE, LINE.replace('"Temperature"', '"Temp"')],
      [LINE, LINE.replace('plt.xlabel("Month")\n', '')],
    )
    expect(title.passed).toBe(false)
    expect(title.differences).toEqual(["The chart should have the title 'Temperature'; yours has 'Temp'."])
    expect(title.expected).toMatch(/^data:image\/png;base64,/)
    expect(title.actual).toMatch(/^data:image\/png;base64,/)
    expect(xlabel.differences).toEqual(["The chart should have the x-axis label 'Month'; yours has nothing."])
  })

  it('names the value that differs, by its category', () => {
    const [v] = compare([LINE, LINE.replace('10.6', '10.0')])
    expect(v.differences).toEqual(["The line 'London': the y value for 'Mar' should be 10.6; yours is 10."])
  })

  it('tells a line from bars, markers from none, solid from dashed', () => {
    const [kind, markers, dashes] = compare(
      [LINE, LINE.replace('plt.plot(months, [7.9, 8.2, 10.6], marker="o", label="London")', 'plt.bar(months, [7.9, 8.2, 10.6], label="London")')],
      [LINE, LINE.replace(', marker="o"', '')],
      [LINE, LINE.replace('marker="o"', 'marker="o", linestyle="--"')],
    )
    expect(kind.differences).toEqual(['The chart should show 1 line; yours shows 1 set of bars.'])
    expect(markers.differences).toEqual(["The line 'London' should have markers at its points."])
    expect(dashes.differences).toEqual(["The line 'London' should be solid; yours is dashed."])
  })

  it('matches lines by their labels, so the order they were drawn in does not matter', () => {
    const two = (first: string, second: string) => lines(
      'import matplotlib.pyplot as plt',
      first, second, 'plt.legend()',
    )
    const a = 'plt.plot([1, 2], [3, 4], label="A")'
    const b = 'plt.plot([1, 2], [5, 6], label="B")'
    const [swapped, missing] = compare([two(a, b), two(b, a)], [two(a, b), two(a, '')])
    expect(swapped.passed).toBe(true)
    expect(missing.differences).toContain('The chart should have 2 lines; yours has 1.')
  })

  it('compares colours only when asked', () => {
    const bars = (colour: string) => lines(
      'import matplotlib.pyplot as plt',
      `plt.barh(["Python", "Java"], [28.4, 14.2], color=["#2563eb", "${colour}"])`,
    )
    const [ignored, checked, same] = compare(
      [bars('#93c5fd'), bars('red')],
      [bars('#93c5fd'), bars('red'), { colours: true }],
      [bars('#93c5fd'), bars('#93C5FD'), { colours: true }],
    )
    expect(ignored.passed).toBe(true)
    expect(checked.differences).toEqual(['The bar chart is not coloured as asked: it should be #2563eb, #93c5fd; yours is #2563eb, #ff0000.'])
    expect(same.passed).toBe(true)
  })

  it('places subplots by their position in the grid', () => {
    const grid = (rows: number, cols: number, title: string) => lines(
      'import matplotlib.pyplot as plt',
      `fig, axes = plt.subplots(${rows}, ${cols})`,
      'axes[0].plot([1, 2, 3])',
      `axes[1].bar(["a", "b"], [1, 2]); axes[1].set_title("${title}")`,
      'fig.suptitle("Week")',
    )
    const [same, shape, title] = compare(
      [grid(1, 2, 'Sleep'), grid(1, 2, 'Sleep')],
      [grid(1, 2, 'Sleep'), grid(2, 1, 'Sleep')],
      [grid(1, 2, 'Sleep'), grid(1, 2, 'Steps')],
    )
    expect(same.passed).toBe(true)
    expect(shape.differences).toEqual(['The figure should hold 1 row and 2 columns of charts; yours holds 2 rows and 1 column of charts.'])
    expect(title.differences).toEqual(["Chart 2 (of 2 side by side) should have the title 'Sleep'; yours has 'Steps'."])
  })

  it('counts histogram bins, flipped axes and text on the chart', () => {
    const hist = (bins: number) => lines('import matplotlib.pyplot as plt', `plt.hist([1, 2, 2, 3, 3, 3, 4], bins=${bins})`)
    const barh = (flip: boolean) => lines('import matplotlib.pyplot as plt', 'plt.barh(["a", "b"], [1, 2])', flip ? 'plt.gca().invert_yaxis()' : '')
    const [bins, flipped, text] = compare(
      [hist(4), hist(5)],
      [barh(true), barh(false)],
      [lines(barh(false), 'plt.text(1, 0, "1")'), barh(false)],
    )
    expect(bins.differences).toEqual(['The bar chart should have 4 bars; yours has 5.'])
    expect(flipped.differences).toEqual(['The chart should have its y axis flipped (invert_yaxis).'])
    expect(text.differences).toEqual(['The chart should have 1 piece of text written on it; yours has 0.'])
  })

  it('reads seaborn charts, heatmaps with hidden squares included', () => {
    const heatmap = (annot: boolean) => lines(
      'import numpy as np, pandas as pd, seaborn as sns',
      'df = pd.DataFrame({"a": [1, 2, 3, 4], "b": [2, 1, 4, 3], "c": [4, 3, 2, 1]})',
      'corr = df.corr()',
      `sns.heatmap(corr, mask=np.triu(np.ones_like(corr, dtype=bool)), annot=${annot ? 'True' : 'False'})`,
    )
    const box = (y: string) => lines(
      'import pandas as pd, seaborn as sns',
      `df = pd.DataFrame({"g": ["x", "x", "x", "y", "y", "y"], "v": [1, 2, ${y}, 4, 5, 6]})`,
      'sns.boxplot(data=df, x="g", y="v")',
    )
    const [same, annot, boxes] = compare([heatmap(true), heatmap(true)], [heatmap(true), heatmap(false)], [box('3'), box('9')])
    expect(same.passed).toBe(true)
    expect(annot.differences).toEqual(['The chart should have 3 pieces of text written on it; yours has 0.'])
    expect(boxes.passed).toBe(false)
  })

  it('compares plotly figures by their traces and titles', () => {
    const fig = (mode: string, title: string) => lines(
      'import plotly.graph_objects as go',
      'f = go.Figure()',
      `f.add_trace(go.Scatter(x=["Jan", "Feb"], y=[3.1, 3.4], name="Seaview", mode="${mode}"))`,
      `f.update_layout(title="${title}", xaxis_title="Month")`,
      'f.show()',
    )
    const [same, mode, title, kind] = compare(
      [fig('lines+markers', 'Visitors'), fig('markers+lines', 'Visitors')],
      [fig('lines+markers', 'Visitors'), fig('lines', 'Visitors')],
      [fig('lines+markers', 'Visitors'), fig('lines+markers', '')],
      [fig('lines', 'V'), lines('import matplotlib.pyplot as plt', 'plt.plot([1, 2])')],
    )
    expect(same.passed).toBe(true)
    expect(mode.differences).toEqual(["The scatter/line trace 'Seaview' should be drawn as lines+markers; yours is lines."])
    expect(title.differences).toEqual(["The chart should have the title 'Visitors'; yours has nothing."])
    expect(kind.differences).toEqual(['This should be a plotly chart (fig.show()); yours is a matplotlib/seaborn chart (plt.show()).'])
    expect(same.expected).toBeUndefined()
  })

  it('says so when no chart was drawn at all, or too many', () => {
    const [none, extra] = compare(
      [LINE, 'x = 1'],
      [LINE, lines(LINE, LINE)],
    )
    expect(none.differences).toEqual(['Your program did not draw a chart. Build it, then call plt.show().'])
    expect(extra.differences).toEqual(['Your program should draw 1 chart (one per plt.show() or fig.show()); it draws 2.'])
  })
})

describe('the chart requirement in the matcher', () => {
  const req = { typ: 'chart', filename: 'task_sol.py' }
  const run = (passed: boolean) => ({
    output: '', error: null, statementResults: {}, fileContents: {},
    chartResults: { [chartReqKey(req)]: { passed, message: passed ? 'Same chart as expected.' : 'x', differences: passed ? [] : ['x'] } },
  })

  it('reads the tester’s verdict for its solution file', () => {
    expect(evaluateTestCase(0, { in: [], out: [req] }, run(true), '').passed).toBe(true)
    const failed = evaluateTestCase(0, { in: [], out: [req] }, run(false), '')
    expect(failed.passed).toBe(false)
    expect(failed.reqResults[0].chart?.differences).toEqual(['x'])
  })

  it('fails when the tester sent no verdict, or for a different option set', () => {
    expect(evaluateTestCase(0, { in: [], out: [req] }, { ...run(true), chartResults: {} }, '').passed).toBe(false)
    expect(evaluateTestCase(0, { in: [], out: [{ ...req, colours: true }] }, run(true), '').passed).toBe(false)
  })
})
