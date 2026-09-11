import { expect, type ConsoleMessage, type Page } from '@playwright/test'

/**
 * `@monaco-editor/react` rejects with `Canceled` when a Monaco model is disposed
 * mid-operation. `main.tsx` suppresses it; Playwright still reports it because
 * it sees the rejection first. Documented as benign in CLAUDE.md.
 */
const BENIGN_TEXT = [/^Canceled$/, /ResizeObserver loop/]

export interface ErrorWatchOptions {
  /**
   * Console errors reported *against* one of these URLs are ignored.
   *
   * The browser logs "Failed to load resource" for every 404, and a simple
   * learning book finds its end by asking for a file that is not there — those
   * 404s are the feature working, not a fault. Scoping the exemption to the
   * URLs a test knows it will miss keeps every other failed request a failure.
   */
  ignoreRequestsTo?: RegExp[]
}

/**
 * Collect browser console errors and uncaught page errors for the life of a
 * test. Assert on the array at the end — a silent `pageerror` is exactly the
 * kind of regression a screenshot does not show.
 */
export function watchForErrors(page: Page, options: ErrorWatchOptions = {}): string[] {
  const problems: string[] = []
  const ignored = options.ignoreRequestsTo ?? []

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (BENIGN_TEXT.some(pattern => pattern.test(text))) return
    const from = message.location()?.url ?? ''
    if (from && ignored.some(pattern => pattern.test(from))) return
    problems.push(text)
  })
  page.on('pageerror', error => {
    if (!BENIGN_TEXT.some(pattern => pattern.test(error.message))) problems.push(error.message)
  })

  return problems
}

/**
 * Replace whatever is in the editor with `source`.
 *
 * `insertText`, never `type`: Monaco closes brackets and quotes as you type, so
 * typing `print("hi")` keystroke by keystroke lands `print("hi")")` in the
 * editor and the test then asserts against a program nobody wrote.
 */
export async function setProgram(page: Page, source: string): Promise<void> {
  const editor = page.locator('.monaco-editor').first()
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(source)
  // Guard the guard: if Monaco ever mangles this, fail here with the reason
  // rather than later with a confusing assertion about program output.
  await expect(editor).toContainText(source.split('\n')[0])
}

export async function run(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: /^(Run|Debug)$/ })
  await expect(button).toBeEnabled()
  await button.click()
}

export const consolePanel = (page: Page) => page.locator('#console-panel-console')
