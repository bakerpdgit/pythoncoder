import { test, expect } from '@playwright/test'
import { consolePanel, run, setProgram, watchForErrors } from './helpers'

/**
 * The checks that were previously done by hand after every change: does the app
 * load, does a program run, does its output appear, does what it draws appear.
 */

test('loads with the editor, console and run button on screen', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')

  await expect(page.locator('.monaco-editor').first()).toBeVisible()
  await expect(consolePanel(page)).toBeVisible()
  await expect(page.getByRole('button', { name: /^(Run|Debug)$/ })).toBeVisible()

  expect(problems).toEqual([])
})

test('runs a program and shows what it printed', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')

  await setProgram(page, 'print("hello from the smoke test")\nprint(6 * 7)')
  await run(page)

  await expect(consolePanel(page)).toContainText('hello from the smoke test')
  await expect(consolePanel(page)).toContainText('42')
  expect(problems).toEqual([])
})

test('reports a syntax error against the student’s own file', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')

  // Deliberately not an unbalanced quote or bracket: Monaco closes those for
  // you, and the test would end up running a perfectly valid program.
  await setProgram(page, 'x = = 3')
  await run(page)

  await expect(consolePanel(page)).toContainText(/SyntaxError/i)
  // The student's file is named in the traceback, not Pyodide's anonymous
  // "<unknown>" import scan.
  await expect(consolePanel(page)).toContainText('simulation.py')
  // A failing program is not a failing page: the error belongs in the app's
  // console, not in the browser's.
  expect(problems).toEqual([])
})

test('plots with matplotlib, which has no screen of its own', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')

  await setProgram(page, [
    'import matplotlib.pyplot as plt',
    'plt.plot([1, 2, 3, 4, 5], [20, 22, 19, 24, 25], marker="o")',
    'plt.title("Weekly Temperature Log")',
    'plt.show()',
  ].join('\n'))
  await run(page)

  // The figure is a PNG that Agg rendered inside the runtime — the Display pane
  // only has to show it. `naturalWidth` proves it decoded, rather than merely
  // that an <img> exists.
  const figure = page.locator('img[alt^="Figure"]').first()
  await expect(figure).toBeVisible({ timeout: 120_000 })
  expect(await figure.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(100)
  expect(problems).toEqual([])
})
