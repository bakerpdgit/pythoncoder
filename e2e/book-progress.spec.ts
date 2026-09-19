import { test, expect, type Page } from '@playwright/test'
import { watchForErrors } from './helpers'

/**
 * What a student sees of their own progress: how far through the book they are
 * at the top level, how far through each section from its parent's contents,
 * and the arrows that move section to section.
 *
 * The book is served by the test through `page.route`, the same hermetic
 * approach `book.spec.ts` takes — no fixture in `public/`, which would be
 * deployed, and no dependence on a repository staying where it is.
 */

const ORIGIN = 'https://books.example.test/course/'
const ROUTE = /^https:\/\/books\.example\.test\/course\//
const ROOT = `${ORIGIN}book.json`

/** Anything the page asks for and does not get; none of it is a fault here. */
const EXPECTED_MISSES = [/books\.example\.test/, /\/api\/proxy/]

const FILES: Record<string, string> = {
  'book.json': JSON.stringify({
    name: 'Course',
    children: [
      { id: 'io', name: 'Outputs and inputs', bookLink: 'io/book.json' },
      { id: 'sel', name: 'Selection', bookLink: 'sel/book.json' },
      { id: 'loops', name: 'Loops', bookLink: 'loops/book.json' },
    ],
  }),
  // Two of four ticked below — a part-finished section.
  'io/book.json': JSON.stringify({
    name: 'Outputs and inputs',
    children: [
      { id: 'io-1', name: 'Ex. 1', py: 'ex.py', isExample: 'True' },
      { id: 'io-2', name: 'Ex. 2', py: 'ex.py', isExample: 'True' },
      { id: 'io-3', name: 'Ex. 3', py: 'ex.py', isExample: 'True' },
      { id: 'io-4', name: 'Ex. 4', py: 'ex.py', isExample: 'True' },
    ],
  }),
  // Both ticked — a finished section.
  'sel/book.json': JSON.stringify({
    name: 'Selection',
    children: [
      { id: 'sel-1', name: 'Ex. 1', py: 'ex.py', isExample: 'True' },
      { id: 'sel-2', name: 'Ex. 2', py: 'ex.py', isExample: 'True' },
    ],
  }),
  // Untouched, and nested one level deeper to prove the count reaches down.
  'loops/book.json': JSON.stringify({
    name: 'Loops',
    children: [
      { id: 'loops-1', name: 'Ex. 1', py: 'ex.py', isExample: 'True' },
      { id: 'while', name: 'While loops', bookLink: 'while/book.json' },
    ],
  }),
  'loops/while/book.json': JSON.stringify({
    name: 'While loops',
    children: [{ id: 'while-1', name: 'Ex. 1', py: 'ex.py', isExample: 'True' }],
  }),
  'ex.py': 'print("hello")\n',
  'io/ex.py': 'print("hello")\n',
  'sel/ex.py': 'print("hello")\n',
  'loops/ex.py': 'print("hello")\n',
  'loops/while/ex.py': 'print("hello")\n',
}

/** 4 of the book's 8 activities: two in `io`, both of `sel`. */
const TICKED = ['io-1', 'io-2', 'sel-1', 'sel-2']

async function serveBook(page: Page): Promise<void> {
  await page.route(ROUTE, async route => {
    const name = route.request().url().slice(ORIGIN.length)
    const body = FILES[name]
    if (body === undefined) { await route.fulfill({ status: 404, body: 'Not Found' }); return }
    await route.fulfill({
      status: 200,
      contentType: name.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body,
    })
  })
}

/** Tick the completions before the app boots, as if the student had done them. */
async function seedCompletions(page: Page): Promise<void> {
  await page.addInitScript(([root, ids]: [string, string[]]) => {
    const completions: Record<string, boolean> = {}
    for (const id of ids) completions[`${root}::${id}`] = true
    localStorage.setItem('pythoncoder-book-completions', JSON.stringify(completions))
  }, [ROOT, TICKED] as [string, string[]])
}

const section = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^${name}`) })

test.beforeEach(async ({ page }) => {
  await seedCompletions(page)
  await serveBook(page)
})

test('the root of the book shows how much of it is done', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: EXPECTED_MISSES })
  await page.goto(`/?book=${encodeURIComponent(ROOT)}`)

  // 4 of 8 activities, counted through two levels of sub-book.
  await expect(page.getByText('50% complete')).toBeVisible()
  expect(problems).toEqual([])
})

test('each section says how far through it the student is', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: EXPECTED_MISSES })
  await page.goto(`/?book=${encodeURIComponent(ROOT)}`)

  // Part-finished sections carry their count; a finished one is just ticked.
  await expect(section(page, 'Outputs and inputs')).toContainText('2/4')
  await expect(section(page, 'Selection')).not.toContainText('/')
  await expect(section(page, 'Selection'))
    .toHaveAttribute('title', 'Selection — 2 of 2 completed')
  // Nothing done in Loops, so it says nothing rather than showing an empty ring.
  await expect(section(page, 'Loops')).not.toContainText('/')

  expect(problems).toEqual([])
})

test('the arrows step from one section to the next and back', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: EXPECTED_MISSES })
  await page.goto(`/?book=${encodeURIComponent(ROOT)}`)

  await section(page, 'Outputs and inputs').click()
  await expect(page.getByRole('button', { name: 'Ex. 4' })).toBeVisible()

  // At the first section there is nowhere back to, but there is a way on.
  await expect(page.getByRole('button', { name: 'Previous section' })).toBeDisabled()
  await page.getByRole('button', { name: 'Next section' }).click()

  await expect(page.getByRole('button', { name: 'Ex. 2' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ex. 4' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Previous section' }).click()
  await expect(page.getByRole('button', { name: 'Ex. 4' })).toBeVisible()

  expect(problems).toEqual([])
})

test('the percentage is the whole book, not the section being read', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: EXPECTED_MISSES })
  await page.goto(`/?book=${encodeURIComponent(ROOT)}`)

  await expect(page.getByText('50% complete')).toBeVisible()
  await section(page, 'Selection').click()

  // Inside a section (2 of 2 done) the bar is gone rather than reading 100%.
  await expect(page.getByText('% complete')).toHaveCount(0)
  expect(problems).toEqual([])
})
