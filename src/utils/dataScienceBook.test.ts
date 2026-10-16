import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BookChallenge, BookManifest } from '../types'
import { evaluateAll } from './testMatcher'
import { chartLibrariesAvailable, runPythonJobs } from './chartCheck.harness'

// The shipped Data Science book (DataScience/), run under native Python the way
// the tester runs it: every example must run cleanly, and every task must be
// marked as failed with its starter code and as passed with its solution —
// through the real matcher, so a mistyped pattern or a chart the solution does
// not actually draw is caught here rather than by a class.
//
// Pyodide 0.29.3 ships numpy 2.2, pandas 2.3 and matplotlib 3.8; the book's
// marked output was checked against those versions and against current ones.

const BOOK_DIR = resolve(__dirname, '../../DataScience')
const book = JSON.parse(readFileSync(resolve(BOOK_DIR, 'book.json'), 'utf8')) as BookManifest
const pages = book.children as BookChallenge[]
const tasks = pages.filter(page => !page.isExample)
const examples = pages.filter(page => page.isExample)
const libs = chartLibrariesAvailable()
const read = (name: string) => readFileSync(resolve(BOOK_DIR, name), 'utf8')

describe('the Data Science book', () => {
  it('has forty pages: twenty examples, each followed by its task', () => {
    expect(pages).toHaveLength(40)
    pages.forEach((page, i) => {
      expect(!!page.isExample, page.name).toBe(i % 2 === 0)
      expect(page.name.startsWith(`${i + 1}. `), page.name).toBe(true)
    })
    expect(new Set(pages.map(page => page.id)).size).toBe(40)
  })

  it('keeps the ids the twelve original examples had, so ticks survive', () => {
    const ids = pages.map(page => page.id)
    for (const id of ['ds-arrays', 'ds-statistics', 'ds-tables', 'ds-filtering', 'ds-first-chart',
      'ds-bar-chart', 'ds-subplots', 'ds-trend-line', 'ds-seaborn-style', 'ds-seaborn-categories',
      'ds-heatmap', 'ds-plotly-interactive']) {
      expect(ids).toContain(id)
    }
  })

  it('has every file each page names', () => {
    for (const page of pages) {
      for (const name of [page.guide!, page.py!, ...(page.additionalFiles ?? []).map(f => f.filename)]) {
        expect(existsSync(resolve(BOOK_DIR, name)), `${page.name}: ${name}`).toBe(true)
      }
    }
  })

  it('marks every task, and hides every solution', () => {
    for (const task of tasks) {
      expect(task.tests?.length, task.name).toBeGreaterThan(0)
      const solution = task.py!.replace(/\.py$/, '_sol.py')
      expect(task.additionalFiles, task.name).toContainEqual({ filename: solution, visible: false })
      const charts = task.tests!.flatMap(t => Array.isArray(t.out) ? t.out : []).filter(r => r.typ === 'chart')
      for (const req of charts) expect(req.filename, task.name).toBe(solution)
      // A chart task shows the solution's chart above the instructions.
      if (charts.length) expect(read(task.guide!), task.name).toContain('![preview](chartpreview)')
    }
  })

  it('gives each task a starter with something left to do', () => {
    for (const task of tasks) {
      const starter = read(task.py!)
      const solution = read(task.py!.replace(/\.py$/, '_sol.py'))
      expect(starter, task.name).not.toBe(solution)
      expect(starter.length, task.name).toBeLessThan(solution.length)
    }
  })
})

describe.skipIf(!libs.ok)(`the Data Science book under native Python${libs.ok ? '' : ` (skipped: ${libs.reason})`}`, () => {
  // One Python process for the whole book: importing matplotlib is the slow part.
  const jobs = [
    ...examples.map(page => ({ code: read(page.py!), cwd: BOOK_DIR })),
    ...tasks.map(task => ({ code: read(task.py!.replace(/\.py$/, '_sol.py')), cwd: BOOK_DIR, tests: task.tests })),
    ...tasks.map(task => ({ code: read(task.py!), cwd: BOOK_DIR, tests: task.tests })),
  ]
  const runs = libs.ok ? runPythonJobs(jobs) : []
  const exampleRuns = runs.slice(0, examples.length)
  const solutionRuns = runs.slice(examples.length, examples.length + tasks.length)
  const starterRuns = runs.slice(examples.length + tasks.length)

  it('runs every example without an error', () => {
    examples.forEach((page, i) => {
      expect(exampleRuns[i].error, page.name).toBeNull()
      expect(exampleRuns[i].output.length + exampleRuns[i].chartCount, page.name).toBeGreaterThan(0)
    })
  })

  it('passes every task with its solution', () => {
    tasks.forEach((task, i) => {
      const run = solutionRuns[i]
      expect(run.error, task.name).toBeNull()
      const result = evaluateAll(task.tests!, [run], read(task.py!.replace(/\.py$/, '_sol.py')))
      const failed = result.results.flatMap(r => r.reqResults.filter(rr => !rr.passed)
        .map(rr => rr.chart?.differences.join(' ') ?? rr.pattern))
      expect(failed, `${task.name}\n${run.output}`).toEqual([])
      expect(result.allPassed, task.name).toBe(true)
    })
  })

  it('fails every task with its starter code', () => {
    tasks.forEach((task, i) => {
      const result = evaluateAll(task.tests!, [starterRuns[i]], read(task.py!))
      expect(result.allPassed, task.name).toBe(false)
    })
  })

  it('says what is wrong with a starter chart, and shows the expected one', () => {
    tasks.forEach((task, i) => {
      for (const verdict of Object.values(starterRuns[i].chartResults)) {
        expect(verdict.passed, task.name).toBe(false)
        expect(verdict.differences.length, task.name).toBeGreaterThan(0)
        expect(verdict.message, task.name).not.toBe('')
      }
    })
  })
})
