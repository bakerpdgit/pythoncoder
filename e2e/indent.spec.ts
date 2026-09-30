import { test, expect, type Page } from '@playwright/test'
import { editorModelState, watchForErrors } from './helpers'

/**
 * Learning books arrive indented with two spaces as often as four. The editor
 * keeps one Monaco model for every file, and a model only guesses indentation
 * when it is created, so each file's indentation is worked out as it opens —
 * and the risky case is a four-space file opened *after* a two-space one.
 *
 * The book is a numbered simple book served by the test (see book.spec.ts).
 */

const BOOK_ORIGIN = 'https://books.example.test/indent/'
const BOOK_ROUTE = /^https:\/\/books\.example\.test\/indent\//
const EXPECTED_MISSES = [/books\.example\.test/, /\/api\/proxy/]

const TWO = `def greet(name):
  if name:
    print("Hello", name)
  return name

greet("Ada")
`
const FOUR = TWO.replace(/^( +)/gm, spaces => spaces + spaces)

const BOOK: Record<string, string> = {
  '01.py': TWO,
  '02.py': FOUR,
  '03.py': 'print("nothing indented")\n',
}

async function openBook(page: Page) {
  await page.route(BOOK_ROUTE, async route => {
    const body = BOOK[route.request().url().slice(BOOK_ORIGIN.length)]
    await route.fulfill(body === undefined
      ? { status: 404, body: 'Not Found' }
      : { status: 200, contentType: 'text/plain; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body })
  })
  await page.goto(`/?book=${encodeURIComponent(BOOK_ORIGIN)}&simple=1`)
}

async function enterExercise(page: Page, number: string, firstLine: string) {
  await page.getByRole('button', { name: number, exact: true }).click()
  await expect(page.locator('.monaco-editor .view-lines').first()).toContainText(firstLine)
}

async function nextExercise(page: Page, firstLine: string) {
  await page.getByRole('button', { name: 'Next exercise' }).click()
  await expect(page.locator('.monaco-editor .view-lines').first()).toContainText(firstLine)
}

const indentSetting = async (page: Page) => {
  await page.getByTitle('Settings', { exact: true }).click()
  const select = page.getByTestId('editor-indent')
  await expect(select).toBeVisible()
  return select
}

test('each file is edited with its own indentation', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: EXPECTED_MISSES })
  await openBook(page)

  await enterExercise(page, '01', 'def greet')
  await expect.poll(() => editorModelState(page)).toMatchObject({ tabSize: 2, insertSpaces: true })
  await expect(await indentSetting(page)).toHaveValue('2')
  await page.keyboard.press('Escape')

  await nextExercise(page, 'def greet')
  await expect.poll(async () => (await editorModelState(page)).value).toBe(FOUR)
  await expect.poll(() => editorModelState(page)).toMatchObject({ tabSize: 4, insertSpaces: true })

  // Nothing to go on: the standard four.
  await nextExercise(page, 'nothing indented')
  await expect.poll(() => editorModelState(page)).toMatchObject({ tabSize: 4, insertSpaces: true })
  await expect(await indentSetting(page)).toHaveValue('4')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Previous exercise' }).click()
  await page.getByRole('button', { name: 'Previous exercise' }).click()
  await expect.poll(async () => (await editorModelState(page)).value).toBe(TWO)
  await expect.poll(() => editorModelState(page)).toMatchObject({ tabSize: 2 })

  expect(problems).toEqual([])
})

test('Enter after a colon indents by the file’s own step', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: EXPECTED_MISSES })
  await openBook(page)
  await enterExercise(page, '01', 'def greet')

  // The end of `  if name:`, then a new line.
  await page.locator('.monaco-editor .view-line', { hasText: 'if name:' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('x = 1')

  const { value } = await editorModelState(page)
  expect(value.split('\n')[2]).toBe('    x = 1')
  expect(problems).toEqual([])
})

test('choosing an indentation re-indents the file, as one undoable edit', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: EXPECTED_MISSES })
  await openBook(page)
  await enterExercise(page, '01', 'def greet')

  const select = await indentSetting(page)
  await select.selectOption('4')
  await expect.poll(async () => (await editorModelState(page)).value).toBe(FOUR)
  await expect.poll(() => editorModelState(page)).toMatchObject({ tabSize: 4, insertSpaces: true })
  await expect(select).toHaveValue('4')

  await select.selectOption('tab')
  await expect.poll(async () => (await editorModelState(page)).value).toBe(TWO.replace(/^( +)/gm, s => '\t'.repeat(s.length / 2)))
  await expect.poll(() => editorModelState(page)).toMatchObject({ insertSpaces: false })

  // A re-render must not put the old setting back.
  await page.keyboard.press('Escape')
  await page.getByTitle('Settings', { exact: true }).click()
  await expect(page.getByTestId('editor-indent')).toHaveValue('tab')
  await page.keyboard.press('Escape')

  // Undo takes it back a step at a time.
  await page.locator('.monaco-editor .view-lines').first().click()
  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await editorModelState(page)).value).toBe(FOUR)
  expect(problems).toEqual([])
})
