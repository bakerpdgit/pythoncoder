import { test, expect, type Page } from '@playwright/test'
import { consolePanel, watchForErrors } from './helpers'

/**
 * The path most students take: follow a link, land in a book, read the
 * instructions, run the exercise, see it tick off.
 *
 * The book is served by the test itself through `page.route`, so this is
 * hermetic — no fixture shipped in `public/` (which would be deployed), and no
 * dependence on a repository staying where it is. It also lets one test assert
 * something no fixture on disk could: that a *missing* number ends the book.
 */

const BOOK_ORIGIN = 'https://books.example.test/lesson/'
const BOOK_ROUTE = /^https:\/\/books\.example\.test\/lesson\//

/**
 * 404s are how a numbered book finds its end, and the proxy fallback cannot
 * reach a host that does not exist. Both are the feature working, and the
 * browser logs both as console errors.
 */
const EXPECTED_MISSES = [/books\.example\.test/, /\/api\/proxy/]

/** A numbered simple learning book: 01 and 02 exist, 03 deliberately does not. */
const BOOK: Record<string, string> = {
  '01.py': `with open("data.txt") as f:
    numbers = [int(line) for line in f]
print("total", sum(numbers))
`,
  '01.txt': `#! data.txt

Add up the numbers in data.txt.
Keep the *stars* and my_var_names exactly as written.
`,
  'data.txt': `1
2
3
`,
  '02.py': `print("the second exercise")
`,
  '04.py': `print("past the gap, must never appear")
`,
}

/** Serve BOOK, and answer anything else in the folder with a real 404. */
async function serveBook(page: Page): Promise<string[]> {
  const asked: string[] = []
  await page.route(BOOK_ROUTE, async route => {
    const name = route.request().url().slice(BOOK_ORIGIN.length)
    asked.push(name)
    const body = BOOK[name]
    if (body === undefined) {
      await route.fulfill({ status: 404, body: 'Not Found' })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body,
    })
  })
  return asked
}

const openBook = (page: Page) =>
  page.goto(`/?book=${encodeURIComponent(BOOK_ORIGIN)}&simple=1`)

const exercise = (page: Page, number: string) =>
  page.getByRole('button', { name: number, exact: true })

test('opens a numbered book and stops at the first missing exercise', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: EXPECTED_MISSES })
  const asked = await serveBook(page)
  await openBook(page)

  await expect(exercise(page, '01')).toBeVisible()
  await expect(exercise(page, '02')).toBeVisible()
  // 04.py exists but sits past the gap at 03, so it is not part of the book.
  await expect(exercise(page, '04')).toHaveCount(0)

  // The whole point of the numbering: files are asked for by name, so there is
  // no directory listing and therefore no GitHub API to run out of.
  expect(asked).toContain('01.py')
  expect(asked).toContain('03.py')
  expect(problems).toEqual([])
})

test('shows an exercise’s instructions with the #! lines taken out', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: EXPECTED_MISSES })
  await serveBook(page)
  await openBook(page)

  await exercise(page, '01').click()

  await expect(page.getByText('01 Instructions')).toBeVisible()
  await expect(page.getByText('Add up the numbers in data.txt.')).toBeVisible()
  // Plain text, not markdown: the asterisks and underscores a teacher writing
  // about Python is very likely to use survive intact.
  await expect(page.getByText('Keep the *stars* and my_var_names exactly as written.')).toBeVisible()
  // The directive is a directive, never prose.
  await expect(page.locator('body')).not.toContainText('#! data.txt')
  expect(problems).toEqual([])
})

test('mounts the files the guide asked for, and runs the exercise', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: EXPECTED_MISSES })
  await serveBook(page)
  await openBook(page)

  await exercise(page, '01').click()

  // `#! data.txt` put the file into the exercise's own filesystem.
  await expect(page.getByText('data.txt', { exact: false }).first()).toBeVisible()

  await page.getByRole('button', { name: /^(Run|Debug)$/ }).click()
  await expect(consolePanel(page)).toContainText('total 6')
  expect(problems).toEqual([])
})

test('ticks an exercise off once it has been run to the end', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: EXPECTED_MISSES })
  await serveBook(page)
  await openBook(page)

  await exercise(page, '02').click()
  await page.getByRole('button', { name: /^(Run|Debug)$/ }).click()
  await expect(consolePanel(page)).toContainText('the second exercise')

  // Completions are keyed `${rootUrl}::${challengeId}` in localStorage, which is
  // also what makes a tick survive closing and reopening the book.
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem('pythoncoder-book-completions')
    return raw ? Object.keys(JSON.parse(raw) as Record<string, unknown>).length : 0
  })).toBeGreaterThan(0)

  expect(problems).toEqual([])
})

test('says what it looked for when a folder holds no numbered exercises', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: EXPECTED_MISSES })
  await page.route(BOOK_ROUTE, route => route.fulfill({ status: 404, body: 'Not Found' }))
  await openBook(page)

  await expect(page.getByText(/01\.py/)).toBeVisible()
  // A book that will not open is not a page that has crashed.
  expect(problems).toEqual([])
})
