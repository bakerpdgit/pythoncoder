import { test, expect, type Page } from '@playwright/test'
import { consolePanel, run, watchForErrors } from './helpers'

/**
 * A book.json activity whose files live in subfolders, and whose program ends
 * with quit() — the shape of a real multi-file project brought into a book.
 *
 * Served by the test itself through `page.route`, like book.spec.ts, so it
 * needs no fixture in `public/`.
 */

const BOOK_ORIGIN = 'https://books.example.test/project/'
const BOOK_ROUTE = /^https:\/\/books\.example\.test\/project\//

const FILES: Record<string, string> = {
  'book.json': JSON.stringify({
    name: 'Project book',
    id: 'project-book',
    children: [{
      id: 'project-run',
      name: 'Run the project',
      guide: 'guide.md',
      py: 'main.py',
      isExample: true,
      additionalFiles: [
        { filename: 'helpers/tools.py', visible: true },
        { filename: 'numbers_folder/numbers.txt', visible: true },
        { filename: 'answers_folder/answer.txt', visible: false },
      ],
    }],
  }),
  'guide.md': '# A project\n\nRun it.\n',
  'main.py': `from helpers.tools import total
with open("numbers_folder/numbers.txt") as f:
    print("total", total(int(line) for line in f))
quit()
print("never printed")
`,
  'helpers/tools.py': 'def total(values):\n    return sum(values)\n',
  'numbers_folder/numbers.txt': '1\n2\n3\n',
  'answers_folder/answer.txt': '6\n',
}

async function serveBook(page: Page): Promise<void> {
  await page.route(BOOK_ROUTE, async route => {
    const body = FILES[route.request().url().slice(BOOK_ORIGIN.length)]
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
}

const openActivity = (page: Page) =>
  page.goto(`/?book=${encodeURIComponent(`${BOOK_ORIGIN}book.json`)}&challenge=project-run&mode=run`)

test('shows the subfolders a book activity brings, except one holding only hidden files', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: [/books\.example\.test/, /\/api\/proxy/] })
  await serveBook(page)
  await openActivity(page)

  await expect(page.getByText('main.py', { exact: true }).first()).toBeVisible()
  // Each subfolder used to be stored with no folder entry of its own, so the
  // file browser — which lists children by parent path from the root — could
  // never reach the files inside it.
  await expect(page.getByText('helpers', { exact: true })).toBeVisible()
  await expect(page.getByText('numbers_folder', { exact: true })).toBeVisible()
  // A folder whose only file is hidden is hidden with it.
  await expect(page.getByText('answers_folder', { exact: true })).toHaveCount(0)

  await page.getByText('numbers_folder', { exact: true }).click()
  await expect(page.getByText('numbers.txt', { exact: true })).toBeVisible()
  expect(problems).toEqual([])
})

test('a program that ends with quit() finishes cleanly instead of failing', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: [/books\.example\.test/, /\/api\/proxy/] })
  await serveBook(page)
  await openActivity(page)

  await expect(page.getByText('main.py', { exact: true }).first()).toBeVisible()
  await run(page)

  // The nested module and data file were mounted where the program looks.
  await expect(consolePanel(page)).toContainText('total 6')
  await expect(consolePanel(page)).toContainText('[RUN FINISHED]')
  await expect(consolePanel(page)).not.toContainText('SystemExit')
  await expect(consolePanel(page)).not.toContainText('never printed')
  expect(problems).toEqual([])
})
