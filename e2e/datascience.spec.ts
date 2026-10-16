import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { consoleCopy, setProgramViaApi, watchForErrors } from './helpers'

/**
 * The shipped Data Science book in the real Pyodide: every example runs and
 * shows its charts, and every task's starter code fails Submit while its
 * solution passes — the printed-output checks and the `chart` comparison
 * (src/python/coder_charts.py) both run for real in the tester worker, with
 * seaborn and plotly installed there from PyPI as they are for a run.
 *
 * dataScienceBook.test.ts does the same under native Python with versions
 * matching Pyodide's; this is what checks the tester worker's own wiring.
 */

const BOOK_ORIGIN = 'https://books.example.test/datascience/'
const BOOK_DIR = join(process.cwd(), 'DataScience')

interface Requirement { typ?: string; filename?: string }
interface Activity { id: string; name: string; py: string; isExample?: boolean; tests?: { out: Requirement[] }[] }

const book = JSON.parse(readFileSync(join(BOOK_DIR, 'book.json'), 'utf8')) as { children: Activity[] }
const consoleText = (page: Page) => consoleCopy(page).catch(() => '')

async function serveBook(page: Page) {
  await page.route(/^https:\/\/books\.example\.test\/datascience\//, async route => {
    const name = decodeURIComponent(route.request().url().slice(BOOK_ORIGIN.length))
    try {
      await route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        contentType: name.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8',
        body: readFileSync(join(BOOK_DIR, name), 'utf8'),
      })
    } catch {
      await route.fulfill({ status: 404, body: 'Not Found' })
    }
  })
}

const openActivity = (page: Page, id: string) =>
  page.goto(`/?book=${encodeURIComponent(BOOK_ORIGIN + 'book.json')}&challenge=${id}`)

const editorReady = (page: Page) => expect(page.locator('.monaco-editor .view-lines').first()).toContainText('import')

const chartRequirement = (task: Activity) => task.tests?.[0].out.find(r => r.typ === 'chart')

test('every example of the Data Science book runs, and its charts appear', async ({ page }) => {
  test.setTimeout(900_000)
  const problems = watchForErrors(page)
  await serveBook(page)
  const examples = book.children.filter(a => a.isExample)
  expect(examples).toHaveLength(20)
  for (const example of examples) {
    await openActivity(page, example.id)
    await editorReady(page)
    const source = readFileSync(join(BOOK_DIR, example.py), 'utf8')
    await page.locator('body').click({ position: { x: 1, y: 1 } })
    await page.keyboard.press('Control+F5')
    await expect.poll(() => consoleText(page), { timeout: 180_000, message: example.name })
      .toMatch(/\[RUN FINISHED\]|Traceback|\[ERROR\]/)
    expect(await consoleText(page), example.name).not.toMatch(/Traceback|\[ERROR\]/)
    if (/plotly/.test(source)) {
      await expect(page.locator('iframe[title^="Figure"]').first(), example.name).toBeVisible()
    } else if (/show\(\)/.test(source)) {
      await expect(page.locator('img[alt^="Figure"]').first(), example.name).toBeVisible()
    }
  }
  expect(problems).toEqual([])
})

test('every task of the Data Science book: the starter fails Submit, the solution passes', async ({ page }) => {
  test.setTimeout(1_200_000)
  const problems = watchForErrors(page)
  await serveBook(page)
  const tasks = book.children.filter(a => a.tests?.length)
  expect(tasks).toHaveLength(20)
  for (const task of tasks) {
    await openActivity(page, task.id)
    await editorReady(page)
    const chart = chartRequirement(task)
    const solutionName = task.py.replace(/\.py$/, '_sol.py')
    const solution = readFileSync(join(BOOK_DIR, solutionName), 'utf8')
    const plotly = /plotly/.test(solution)

    // A chart task shows the chart to aim for: a picture, or a live plotly frame.
    if (chart) {
      await expect(page.locator(plotly ? 'iframe.chart-preview' : 'img.chart-preview'), task.name)
        .toBeVisible({ timeout: 180_000 })
    }

    // The starter code, as the student first sees it, is not finished.
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByText(/^0\/\d+ passed$/), task.name).toBeVisible({ timeout: 180_000 })
    if (chart) {
      // What differs is said in words, with the expected chart beside the student's.
      await page.getByRole('button', { name: 'Show test cases' }).click()
      await expect(page.getByText(/should|did not draw a chart/).first(), task.name).toBeVisible()
      if (!plotly) await expect(page.getByRole('img', { name: 'Expected chart' }).first(), task.name).toBeVisible()
    }

    // The solution, written into the activity's own file, passes.
    await setProgramViaApi(page, solution)
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByText('All passed'), task.name).toBeVisible({ timeout: 180_000 })
  }
  expect(problems).toEqual([])
})
