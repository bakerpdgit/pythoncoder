import { test, expect, type Page } from '@playwright/test'
import { consolePanel, run, setProgram, watchForErrors } from './helpers'

/**
 * Folding the Code Editor and Console, zooming the Display pane, and a run
 * loading only the packages its own imports reach.
 */

/** Put files into the default virtual filesystem, as if the student had made them. */
async function seedFiles(page: Page, files: Record<string, string>): Promise<void> {
  // The dev server serves the app's own modules by path, so the test writes
  // through the same IndexedDB store a run reads its files from. A string, not a
  // function: the test file is compiled for Node, and a dynamic import() inside
  // it is not guaranteed to reach the browser intact.
  await page.evaluate(`(async files => {
    const vfs = await import('/src/utils/virtualFS.ts')
    for (const [path, source] of Object.entries(files)) {
      await vfs.writeFile('default', path, new TextEncoder().encode(source).buffer)
    }
  })(${JSON.stringify(files)})`)
}

test('folds the editor and the console to their headers, and back', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')

  const editor = page.locator('.monaco-editor').first()
  await expect(editor).toBeVisible()
  await expect(consolePanel(page)).toBeVisible()
  const editorHeight = async () => (await editor.boundingBox())?.height ?? 0
  const consoleHeight = async () => (await consolePanel(page).boundingBox())?.height ?? 0

  // The editor folds up and the console takes the column.
  const consoleBefore = await consoleHeight()
  await page.getByRole('button', { name: 'Collapse editor' }).click()
  await expect(editor).toBeHidden()
  await expect.poll(consoleHeight).toBeGreaterThan(consoleBefore + 100)

  await page.getByRole('button', { name: 'Expand editor' }).click()
  await expect(editor).toBeVisible()

  // With no Display pane below it, the console folds down and Monaco is laid
  // out again into the height it gave up.
  const editorBefore = await editorHeight()
  await page.getByRole('button', { name: 'Collapse console' }).click()
  await expect(consolePanel(page)).toBeHidden()
  await expect.poll(editorHeight).toBeGreaterThan(editorBefore + 50)

  // Folding the editor too would leave nothing to fill the column, so the
  // console opens instead.
  await page.getByRole('button', { name: 'Collapse editor' }).click()
  await expect(editor).toBeHidden()
  await expect(consolePanel(page)).toBeVisible()

  await page.getByRole('button', { name: 'Expand editor' }).click()
  await expect(editor).toBeVisible()
  expect(problems).toEqual([])
})

test('loads only the packages the program’s own imports reach', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await expect(page.locator('.monaco-editor').first()).toBeVisible()
  await seedFiles(page, {
    // Beside the program, never imported by it.
    '/sibling_plot.py': 'import matplotlib.pyplot as plt\nplt.plot([1, 2, 3])\nplt.show()\n',
    // Imported, and needs a package the program itself never names.
    '/stats_helper.py': 'import numpy as np\n\ndef mean(values):\n    return float(np.mean(values))\n',
  })

  await setProgram(page, 'print("plain hello")')
  await run(page)
  await expect(consolePanel(page)).toContainText('plain hello')
  // Packages load before the program starts, so any would already be reported.
  await expect(consolePanel(page)).not.toContainText('matplotlib')

  // Pyodide installs only what it is shown; the helper's numpy used to be missed.
  await setProgram(page, 'import stats_helper\nprint("mean is", stats_helper.mean([1, 2, 3]))')
  await run(page)
  await expect(consolePanel(page)).toContainText('mean is 2.0', { timeout: 120_000 })
  expect(problems).toEqual([])
})

test('zooms the Display pane, and scrolls once the content no longer fits', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')

  await setProgram(page, [
    'import matplotlib.pyplot as plt',
    'plt.plot([1, 2, 3], [3, 1, 2])',
    'plt.show()',
  ].join('\n'))
  await run(page)

  const figure = page.locator('img[alt^="Figure"]').first()
  await expect(figure).toBeVisible({ timeout: 120_000 })
  const natural = await figure.evaluate((img: HTMLImageElement) => img.naturalWidth)
  // img → figure column → the Plot surface's own scroll container.
  const scroller = figure.locator('xpath=../..')
  const overflows = () => scroller.evaluate(el => el.scrollWidth > el.clientWidth + 1)
  const width = async () => (await figure.boundingBox())?.width ?? 0

  // Fit never lets a figure be wider than the pane.
  expect(await overflows()).toBe(false)

  // 300% of actual size, border included (zoom scales that too), and wider
  // than any pane at this viewport, so it has to scroll.
  const zoom = page.getByTitle('Display zoom')
  await zoom.selectOption('300')
  await expect.poll(width).toBeGreaterThanOrEqual(natural * 3)
  expect(await width()).toBeLessThanOrEqual((natural + 2) * 3 + 2)
  await expect.poll(overflows).toBe(true)

  await zoom.selectOption('fit')
  await expect.poll(overflows).toBe(false)
  expect(problems).toEqual([])
})
