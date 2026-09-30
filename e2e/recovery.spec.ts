import { test, expect, type Page } from '@playwright/test'
import { consolePanel, setProgram, watchForErrors } from './helpers'

/**
 * Getting a student's work and runtime back after something outside their
 * program went wrong: the page closing with changes unsaved, and Pyodide
 * itself crashing.
 */

const DRAFT_KEY = 'pythoncoder-draft:default'
const recoverDialog = (page: Page) => page.getByRole('dialog').filter({ hasText: 'Recover unsaved changes?' })
const editor = (page: Page) => page.locator('.monaco-editor').first()

/** Everything the console holds, through its Copy button (see display.spec.ts). */
async function consoleTranscript(page: Page): Promise<string> {
  await page.evaluate(() => {
    const w = window as unknown as { __copiedConsole?: string }
    delete w.__copiedConsole
    navigator.clipboard.writeText = async (text: string) => { w.__copiedConsole = text }
  })
  await page.getByRole('button', { name: 'Copy console output' }).click()
  const copied = await page.waitForFunction(() => (window as unknown as { __copiedConsole?: string }).__copiedConsole)
  return String(await copied.jsonValue()).replace(/\n/g, '')
}

test('unsaved changes are offered back after the page closes', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await expect(editor(page)).toContainText('Hello, World!')
  await setProgram(page, 'print("work I never saved")')
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), DRAFT_KEY)).toContain('work I never saved')

  // Reloading is closing the tab and coming back, as far as the page can tell.
  await page.reload()
  await expect(recoverDialog(page)).toBeVisible()
  await expect(recoverDialog(page)).toContainText('"main.py" has changes from today')
  await page.getByRole('button', { name: 'Restore my changes' }).click()
  await expect(editor(page)).toContainText('work I never saved')
  // Restored as unsaved changes, not written over the saved file.
  await expect(page.getByText('Restored unsaved changes to main.py.')).toBeVisible()

  // Saving settles it: nothing is offered next time.
  await page.getByTitle('Save to virtual filesystem').click()
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), DRAFT_KEY)).toBeNull()
  await page.reload()
  await expect(editor(page)).toContainText('work I never saved')
  await expect(recoverDialog(page)).toHaveCount(0)
  expect(problems).toEqual([])
})

test('choosing the saved version discards the backup', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await expect(editor(page)).toContainText('Hello, World!')
  await setProgram(page, 'print("changes to throw away")')
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), DRAFT_KEY)).toContain('throw away')

  await page.reload()
  await page.getByRole('button', { name: 'Use last saved version' }).click()
  await expect(editor(page)).toContainText('Hello, World!')
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), DRAFT_KEY)).toBeNull()
  expect(problems).toEqual([])
})

test('a crashed Pyodide is reset and the program run again, once', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  // Pyodide's own fatal-error path, reached on purpose: every later use of
  // that Pyodide throws, exactly as after a real crash.
  await setProgram(page, [
    'print("before the crash")',
    'import pyodide_js',
    'from js import Error',
    'pyodide_js._api.fatal_error(Error.new("simulated crash"))',
  ].join('\n'))
  await page.keyboard.press('Control+F5')

  // This program crashes every time, so the one automatic retry crashes too
  // and is reported rather than retried again.
  await expect(page.getByText('Pyodide crashed again after restarting.')).toBeVisible({ timeout: 90_000 })
  const transcript = await consoleTranscript(page)
  expect(transcript).toContain('crashed again straight after restarting')
  expect(transcript).toContain('Python (Pyodide) crashed and has been restarted automatically')
  expect(transcript).toContain('The crash was: Error: simulated crash')

  // The runtime left behind works.
  await setProgram(page, 'print("recovered", 6 * 7)')
  await page.keyboard.press('Control+F5')
  await expect(consolePanel(page)).toContainText('[RUN FINISHED]', { timeout: 60_000 })
  await expect(consolePanel(page)).toContainText('recovered 42')

  // Pyodide reports its own death on the console, which is the crash
  // happening as intended, not a fault in the page.
  const expected = [/fatal error/i, /simulated crash/, /reading '0'/]
  expect(problems.filter(text => !expected.some(pattern => pattern.test(text)))).toEqual([])
})
