import JSZip from 'jszip'
import { test, expect, type Page } from '@playwright/test'
import { editorModelState, watchForErrors } from './helpers'

/**
 * Opening from the web or this computer decides what it opened by what is
 * there — book.json → a learning book, 01.py → a simple learning book,
 * anything else → files — with nothing to tick. The teacher's student-link
 * dialog uses the same rule to refuse a link to something that is not the kind
 * of book they said.
 *
 * Every host is served through `page.route`. In WebKit the page is kept off the
 * service-worker rung (`?transport=none`), which `page.route` cannot see past.
 */

const HOST = 'https://files.example.test'
const CORS = { 'Access-Control-Allow-Origin': '*' }
/** Probing for files that are not there is how a simple book finds its end. */
const MISSES = [/files\.example\.test/, /raw\.githubusercontent\.com/, /\/api\/proxy/]

let keepOffServiceWorker = false
test.beforeEach(({ browserName }) => {
  keepOffServiceWorker = browserName === 'webkit'
  // Each fresh WebKit tab loads the dev server's unbundled modules from cold,
  // and these tests open several.
  test.slow(browserName === 'webkit')
})
/** The app, with the File System panel on screen (it is off in the default view). */
async function home(page: Page) {
  await page.goto(keepOffServiceWorker ? '/?transport=none' : '/')
  // A cold WebKit can take longer than a click's timeout to draw the page.
  await expect(page.getByRole('button', { name: 'Panels' })).toBeVisible()
  await page.getByRole('button', { name: 'Panels' }).click()
  await page.getByLabel('File System').check()
  await page.keyboard.press('Escape')
  // A narrow window starts with the left sidebar folded to a rail.
  const rail = page.getByRole('button', { name: 'File System Variables' })
  if (await rail.isVisible()) await rail.click()
  await expect(page.getByTitle('Open a ZIP, connect a local folder, or open a book from the web')).toBeVisible()
}

const editorText = (page: Page) => editorModelState(page).then(state => state.value, () => '')

async function zipOf(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip()
  for (const [path, text] of Object.entries(files)) zip.file(path, text)
  return zip.generateAsync({ type: 'nodebuffer' })
}

async function serveZip(page: Page, name: string, files: Record<string, string>) {
  const body = await zipOf(files)
  await page.route(`${HOST}/${name}`, route => route.fulfill({ body, contentType: 'application/zip', headers: CORS }))
}

/** Open → Open from the web → a tab of the finder. */
async function openFromWeb(page: Page, tab: 'GitHub' | 'Google Drive' | 'Another address') {
  await page.getByTitle('Open a ZIP, connect a local folder, or open a book from the web').click()
  const dialog = page.getByRole('dialog', { name: 'Open a source' })
  await expect(dialog).not.toContainText('Simple learning book (no book.json)')
  await dialog.getByRole('button', { name: /Open from the web/ }).click()
  await dialog.getByRole('tab', { name: tab }).click()
  return dialog
}

async function openAddress(page: Page, url: string) {
  const dialog = await openFromWeb(page, 'Another address')
  await dialog.getByLabel('Address').fill(url)
  await dialog.getByRole('button', { name: 'Open', exact: true }).click()
}

const BOOK_JSON = JSON.stringify({ name: 'Zipped Book', children: [{ id: 'z1', name: 'Zip activity', py: 'ex01.py', isExample: true }] })

test('a ZIP with a book.json opens as a learning book', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: MISSES })
  await serveZip(page, 'book.zip', { 'book/book.json': BOOK_JSON, 'book/ex01.py': 'print("zip book")\n' })
  await home(page)
  await openAddress(page, `${HOST}/book.zip`)
  await page.getByRole('button', { name: 'Zip activity' }).click()
  await expect.poll(() => editorText(page)).toBe('print("zip book")\n')
  expect(problems).toEqual([])
})

test('a ZIP of numbered exercises opens as a simple learning book', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: MISSES })
  await serveZip(page, 'simple.zip', { '01.py': 'print("one")\n', '02.py': 'print("two")\n' })
  await home(page)
  await openAddress(page, `${HOST}/simple.zip`)
  await expect(page.getByRole('button', { name: '02', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '01', exact: true }).click()
  await expect.poll(() => editorText(page)).toBe('print("one")\n')
  expect(problems).toEqual([])
})

test('a ZIP of plain files opens as files, connected to where it came from', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: MISSES })
  await serveZip(page, 'project.zip', { 'project/main.py': 'print("project")\n', 'project/notes.txt': 'hi\n' })
  await home(page)
  await openAddress(page, `${HOST}/project.zip`)
  await expect.poll(() => editorText(page)).toBe('print("project")\n')
  await expect(page.getByText('notes.txt', { exact: true })).toBeVisible()
  await expect(page.getByTitle('Reset to the online version')).toBeVisible()

  // Opening it again finds the copy already made.
  await openAddress(page, `${HOST}/project.zip`)
  const question = page.getByRole('dialog', { name: 'You have opened this before' })
  await question.getByRole('button', { name: 'Resume my copy' }).click()
  await expect.poll(() => editorText(page)).toBe('print("project")\n')
  expect(problems).toEqual([])
})

test('a GitHub repository chosen by browsing opens by what is in it', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: MISSES })
  await page.route('https://api.github.com/repos/me/proj', route => route.fulfill({
    body: JSON.stringify({ default_branch: 'main' }), contentType: 'application/json', headers: CORS,
  }))
  await page.route('https://api.github.com/repos/me/proj/contents?ref=main', route => route.fulfill({
    body: JSON.stringify([
      { name: '01.py', path: '01.py', type: 'file' },
      { name: 'README.md', path: 'README.md', type: 'file' },
    ]),
    contentType: 'application/json', headers: CORS,
  }))
  await page.route(/^https:\/\/raw\.githubusercontent\.com\/me\/proj\/main\//, route => {
    const name = route.request().url().split('/main/')[1]
    return name === '01.py'
      ? route.fulfill({ body: 'print("from github")\n', contentType: 'text/plain', headers: CORS })
      : route.fulfill({ status: 404, body: 'Not Found', headers: CORS })
  })
  await home(page)
  const dialog = await openFromWeb(page, 'GitHub')
  await dialog.getByRole('button', { name: 'Paste an address' }).click()
  await dialog.getByLabel('GitHub address').fill('https://github.com/me/proj')
  await dialog.getByRole('button', { name: 'Look inside' }).click()
  // Every file is listed, but only a folder (or a ZIP) can be chosen.
  await expect(dialog.getByText('README.md')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'README.md' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Use this repository (proj)' }).click()
  await dialog.getByRole('button', { name: 'Open', exact: true }).click()
  await page.getByRole('button', { name: '01', exact: true }).click()
  await expect.poll(() => editorText(page)).toBe('print("from github")\n')
  expect(problems).toEqual([])
})

test('a local ZIP of numbered exercises opens as a simple learning book', async ({ page }) => {
  const problems = watchForErrors(page)
  await home(page)
  await page.getByLabel('Open ZIP file').setInputFiles({
    name: 'lesson.zip', mimeType: 'application/zip', buffer: await zipOf({ '01.py': 'print("local")\n' }),
  })
  await page.getByRole('button', { name: '01', exact: true }).click()
  await expect.poll(() => editorText(page)).toBe('print("local")\n')
  expect(problems).toEqual([])
})

test('a teacher\'s student link asks which kind of book, and refuses one that is not', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: MISSES })
  await serveZip(page, 'plain.zip', { 'main.py': 'print(1)\n' })
  await serveZip(page, 'lesson.zip', { '01.py': 'print(1)\n', '02.py': 'print(2)\n' })
  await home(page)
  await page.getByRole('button', { name: 'Panels' }).click()
  await page.getByLabel('Teacher Tools').check()
  await page.keyboard.press('Escape')
  const back = () => page.getByRole('button', { name: 'Back', exact: true })
  await page.getByRole('button', { name: /Link to a learning book/ }).click()

  // Site tutorials are a dropdown now, not a long list.
  await page.getByTestId('link-type-tutorial').click()
  await expect(page.getByLabel('Tutorial').locator('option')).not.toHaveCount(1)
  await back().click()

  // A plain ZIP is no learning book.
  await page.getByTestId('link-type-book').click()
  await page.getByRole('tab', { name: 'Another address' }).click()
  await page.getByLabel('Address').fill(`${HOST}/plain.zip`)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'No book.json here.' })).toBeVisible()
  await back().click()

  // A ZIP of numbered exercises is a simple one, and its link says so.
  await page.getByTestId('link-type-simple').click()
  await page.getByRole('tab', { name: 'Another address' }).click()
  await page.getByLabel('Address').fill(`${HOST}/lesson.zip`)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('button', { name: '02' })).toBeVisible()
  await expect(page.locator('input[readonly]')).toHaveValue(/&simple=1/)
  expect(problems).toEqual([])
})
