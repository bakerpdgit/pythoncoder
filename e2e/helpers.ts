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
  // Select all with the key *Monaco* expects, which it decides from the user
  // agent — not the key the test machine's OS uses. Playwright's WebKit device
  // claims to be a Mac, so on Linux CI `ControlOrMeta` sends Ctrl, which a
  // Mac-mode Monaco does not treat as select-all: the program was inserted
  // beside the default one instead of replacing it.
  const monacoIsMac = await page.evaluate(() => navigator.userAgent.includes('Macintosh'))
  await page.keyboard.press(monacoIsMac ? 'Meta+a' : 'Control+a')
  await page.keyboard.insertText(source)
  // Guard the guard: if Monaco ever mangles this, fail here with the reason
  // rather than later with a confusing assertion about program output. The
  // line count catches text left over from before, not just a mangled start.
  await expect(editor).toContainText(source.split('\n')[0])
  await expect(editor.locator('.line-numbers')).toHaveCount(source.split('\n').length)
}

/**
 * What the code editor's model holds and how it indents, read through Monaco's
 * own API rather than the rendered lines (which drop leading whitespace into
 * separate spans and virtualise anything off screen).
 */
export async function editorModelState(page: Page): Promise<{ value: string; tabSize: number; insertSpaces: boolean }> {
  return page.evaluate(async () => {
    const w = window as any
    let editors: any[] = []
    if (typeof w.require === 'function') {
      const monaco = await new Promise<any>(resolve => w.require(['vs/editor/editor.main'], resolve))
      editors = (monaco ?? w.monaco)?.editor?.getEditors?.() ?? []
    }
    if (!editors.length) {
      // In dev the editor is the locally installed monaco-editor.
      const url = performance.getEntriesByType('resource').map(e => e.name)
        .find(n => /\/node_modules\/\.vite\/deps\/monaco-editor\.js/.test(n))
      if (url) editors = (await import(/* @vite-ignore */ url)).editor.getEditors()
    }
    const model = editors[0].getModel()
    const { tabSize, insertSpaces } = model.getOptions()
    // 1 is EndOfLinePreference.LF: a model created empty on Windows uses CRLF.
    return { value: model.getValue(1), tabSize, insertSpaces }
  })
}

export async function run(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: /^(Run|Debug)$/ })
  await expect(button).toBeEnabled()
  await button.click()
}

export const consolePanel = (page: Page) => page.locator('#console-panel-console')
