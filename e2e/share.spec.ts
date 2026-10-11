import JSZip from 'jszip'
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { editorModelState, setProgram, setProgramViaApi, watchForErrors, type ErrorWatchOptions } from './helpers'

/**
 * Share my code: the wizard that ends in a link, and the link opening the code
 * for somebody else.
 *
 * Every host is served by the test through `route` — a gist, a Drive file
 * (including the fallback through this site's own proxy), a plain address — so
 * nothing depends on an account or a repository staying where it is. The
 * recipient is a second browser context, as a different person would be: it
 * shares no storage with the sender.
 *
 * Runs in WebKit too. `page.route` cannot see a request once a service worker
 * controls the page, and a WebKit page registers one for the debugger, so
 * there every address is opened with `?transport=none` (see CLAUDE.md).
 */

let keepOffServiceWorker = false
test.beforeEach(({ browserName }) => {
  keepOffServiceWorker = browserName === 'webkit'
  // Each fresh WebKit tab loads the dev server's unbundled modules from cold,
  // and these tests open several.
  test.slow(browserName === 'webkit')
})

/** Open an address in the app, kept off the service-worker rung in WebKit. */
function go(page: Page, address: string) {
  if (!keepOffServiceWorker) return page.goto(address)
  const hash = address.indexOf('#')
  const [before, after] = hash === -1 ? [address, ''] : [address.slice(0, hash), address.slice(hash)]
  return page.goto(`${before}${before.includes('?') ? '&' : '?'}transport=none${after}`)
}

const CODE_HOST = 'https://code.example.test'

const shareButton = (page: Page) => page.getByRole('button', { name: 'Share your code', exact: true })
const shareDialog = (page: Page) => page.getByRole('dialog', { name: 'Share your code' })

async function openShare(page: Page) {
  await shareButton(page).click()
  const dialog = shareDialog(page)
  await expect(dialog).toBeVisible()
  return dialog
}

/** The link the wizard's final step offers. */
async function finishedLink(page: Page): Promise<string> {
  const box = shareDialog(page).locator('input[readonly]')
  await expect(box).toHaveValue(/^http/)
  return box.inputValue()
}

/** A second person: their own context, so no filesystem of the sender's is in it. */
async function recipient(browser: Browser, baseURL: string | undefined): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL })
  return { context, page: await context.newPage() }
}

/** The editor's text, or '' while Monaco is still mounting. */
const editorText = (page: Page) => editorModelState(page).then(state => state.value, () => '')

/** The question a link with code inside asks before anything is created. */
function sharedCodeQuestion(page: Page) {
  return page.getByRole('dialog', { name: 'Open shared code' })
}

/**
 * Answer that question. Waited for with the (long) expect timeout, not a
 * click's: a fresh WebKit tab on the dev server can take longer than a click
 * timeout just to draw the page.
 */
async function answerSharedCode(page: Page, answer: string | RegExp) {
  const question = sharedCodeQuestion(page)
  await expect(question).toBeVisible()
  await question.getByRole('button', { name: answer }).click()
}

async function zipOf(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip()
  for (const [path, text] of Object.entries(files)) zip.file(path, text)
  return zip.generateAsync({ type: 'nodebuffer' })
}

/**
 * Open an address again in a new tab of the same browser, closing the old one.
 *
 * Not `reload()`: reloading a WebKit page while Pyodide and Monaco are still
 * downloading makes the outgoing page report every cancelled load as an error.
 * A new tab shares the same storage, which is all "opening the link again"
 * needs. Its console errors are added to `problems` when it closes.
 */
async function reopen(old: Page, address: string, problems: string[], options: ErrorWatchOptions = {}): Promise<Page> {
  const page = await old.context().newPage()
  await old.close()
  const seen = watchForErrors(page, options)
  page.on('close', () => problems.push(...seen))
  await go(page, address)
  return page
}

test('a short file travels inside the link and opens as the recipient\'s own copy', async ({ page, browser, baseURL }) => {
  const problems = watchForErrors(page)
  await go(page, '/')
  await setProgram(page, 'print("shared by link")')

  const dialog = await openShare(page)
  // The editor's Share starts at its file.
  await expect(dialog.getByTestId('share-route-link')).toContainText(/\d+ characters/)
  await dialog.getByTestId('share-route-link').click()
  const link = await finishedLink(page)
  expect(link).toContain('#share=')
  expect(link).not.toContain('?')

  const other = await recipient(browser, baseURL)
  const otherProblems = watchForErrors(other.page)
  await go(other.page, link)

  // Nothing is created until the recipient chooses. A new filesystem needs a
  // name nobody has already used.
  let question = sharedCodeQuestion(other.page)
  await expect(question).toContainText('main.py (1 line)')
  await expect(question).toBeVisible()
  await question.getByRole('button', { name: 'Save as a new filesystem' }).click()
  const naming = other.page.getByRole('dialog', { name: 'Name the new filesystem' })
  await naming.getByRole('textbox').fill('default')
  await expect(naming.getByRole('alert')).toContainText('You already have a filesystem with that name.')
  await expect(naming.getByRole('button', { name: 'Create' })).toBeDisabled()
  await naming.getByRole('textbox').fill('From a friend')
  await naming.getByRole('button', { name: 'Create' }).click()
  await expect(other.page.getByText('Saved the shared code as “From a friend”.')).toBeVisible()
  await expect.poll(() => editorText(other.page)).toBe('print("shared by link")')

  // The link is not remembered: opening it again asks again. This time, a
  // temporary filesystem — with a bar saying so, and a way to keep it.
  let again = await reopen(other.page, link, otherProblems)
  question = sharedCodeQuestion(again)
  await expect(question).toBeVisible()
  await question.getByRole('button', { name: 'Use a temporary filesystem' }).click()
  const bar = again.getByRole('region', { name: 'Temporary filesystem' })
  await expect(bar).toContainText('is lost when you close this tab')
  await expect.poll(() => editorText(again)).toBe('print("shared by link")')
  await bar.getByRole('button', { name: 'Keep as a new filesystem' }).click()
  const keeping = again.getByRole('dialog', { name: 'Keep as a new filesystem' })
  await keeping.getByRole('textbox').fill('Kept copy')
  await keeping.getByRole('button', { name: 'Create' }).click()
  await expect(bar).toHaveCount(0)
  await expect(again.getByText('Kept as “Kept copy”.')).toBeVisible()

  // The recipient's own default filesystem was not touched.
  again = await reopen(again, '/', otherProblems)
  await expect.poll(() => editorText(again)).toContain('Hello, World!')
  await again.close()
  await other.context.close()

  expect(problems).toEqual([])
  expect(otherProblems).toEqual([])
})

test('a program too long for a link has that option greyed out, with the reason', async ({ page }) => {
  const problems = watchForErrors(page)
  await go(page, '/')
  // Digits that do not repeat do not compress, so this cannot squeeze into a link.
  let seed = 12345
  const lines = Array.from({ length: 1500 }, () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return `print(${seed})`
  })
  await setProgramViaApi(page, lines.join('\n'))

  const dialog = await openShare(page)
  // The editor's Share starts at its file.
  const linkOption = dialog.getByTestId('share-route-link')
  await expect(linkOption).toContainText(/Too long for a link — [\d,]+ characters \(the limit is 8,000\)/)
  await expect(linkOption).toBeDisabled()
  await expect(dialog.getByTestId('share-route-github')).toBeEnabled()
  await expect(dialog.getByTestId('share-route-drive')).toBeEnabled()
  expect(problems).toEqual([])
})

test('a ZIP opened from an address, then all its files shared by link', async ({ page, browser, baseURL }) => {
  const problems = watchForErrors(page)
  const zip = await zipOf({ 'project/main.py': 'import helper\nhelper.hello()\n', 'project/helper.py': 'def hello():\n    print("hi")\n' })
  await page.route(`${CODE_HOST}/project.zip`, route => route.fulfill({
    body: zip, contentType: 'application/zip', headers: { 'Access-Control-Allow-Origin': '*' },
  }))
  await go(page, `/?filesystem=${encodeURIComponent(`${CODE_HOST}/project.zip`)}`)
  await expect.poll(() => editorText(page)).toBe('import helper\nhelper.hello()\n')

  const dialog = await openShare(page)
  await dialog.getByRole('button', { name: 'Back' }).click()
  await expect(dialog.getByTestId('share-scope-filesystem')).toContainText('2 files')
  await dialog.getByTestId('share-scope-filesystem').click()
  await dialog.getByTestId('share-route-link').click()
  const link = await finishedLink(page)

  const other = await recipient(browser, baseURL)
  await go(other.page, link)
  const question = sharedCodeQuestion(other.page)
  await expect(question).toContainText('2 files')
  await expect(question).toBeVisible()
  await question.getByRole('button', { name: 'Use a temporary filesystem' }).click()
  await expect(other.page.getByText('main.py (temporary)').first()).toBeVisible()
  await expect(other.page.getByText('helper.py', { exact: true })).toBeVisible()
  await expect.poll(() => editorText(other.page)).toBe('import helper\nhelper.hello()\n')
  await other.context.close()
  expect(problems).toEqual([])
})

test('a file shared through a gist is checked before the link is offered, and opens', async ({ page, browser, baseURL }) => {
  const problems = watchForErrors(page)
  const code = 'print("from a gist")'
  const raw = 'https://gist.githubusercontent.com/someone/0123456789abcdef0123456789abcdef/raw/main.py'
  const serveGist = (target: Page | BrowserContext) => target.route(raw, route => route.fulfill({
    body: code, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' },
  }))
  await serveGist(page)
  await go(page, '/')
  await setProgram(page, code)

  const dialog = await openShare(page)
  // The editor's Share starts at its file.
  await dialog.getByTestId('share-route-github').click()
  await expect(dialog).toContainText('Put your code in a gist')
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByLabel('Gist address').fill(raw)
  await dialog.getByRole('button', { name: 'Use this' }).click()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await expect(dialog.getByTestId('share-verify-ok')).toContainText('Found main.py (1 line)')
  await expect(dialog.getByTestId('share-verify-ok')).toContainText('It matches the code you have here.')
  const link = await finishedLink(page)
  expect(link).toContain(`?filesystem=${encodeURIComponent(raw)}`)

  const other = await recipient(browser, baseURL)
  await serveGist(other.context)
  await go(other.page, link)
  await expect.poll(() => editorText(other.page)).toBe(code)
  await other.context.close()
  expect(problems).toEqual([])
})

test('a Drive file that is not public is caught before a link is handed out', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.route('https://drive.google.com/**', route => route.fulfill({
    body: '<!DOCTYPE html><html><head><title>Sign in</title></head></html>',
    contentType: 'text/html', headers: { 'Access-Control-Allow-Origin': '*' },
  }))
  await go(page, '/')
  await setProgram(page, 'print("drive")')

  const dialog = await openShare(page)
  // The editor's Share starts at its file.
  await dialog.getByTestId('share-route-drive').click()
  await dialog.getByRole('button', { name: 'Next' }).click() // past Download
  await dialog.getByRole('button', { name: 'Next' }).click() // past the upload instructions
  await dialog.getByLabel('Google Drive link').fill('https://drive.google.com/file/d/AbC123/view?usp=sharing')
  await dialog.getByRole('button', { name: 'Next' }).click()
  await expect(dialog.getByTestId('share-verify-failed')).toContainText('Anyone with the link')
  await expect(dialog.locator('input[readonly]')).toHaveCount(0)
  expect(problems).toEqual([])
})

test('a Drive ZIP opens through this site\'s proxy when Drive refuses the page', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: [/drive\.google\.com/] })
  const zip = await zipOf({ 'main.py': 'print("zipped")\n', 'notes.txt': 'hello\n' })
  await page.route('https://drive.google.com/**', route => route.abort())
  await page.route(/\/api\/proxy\?url=/, route => route.fulfill({ body: zip, contentType: 'application/octet-stream' }))
  await go(page, `/?filesystem=${encodeURIComponent('https://drive.google.com/uc?export=download&id=Zip1')}`)
  await expect.poll(() => editorText(page)).toBe('print("zipped")\n')
  await expect(page.getByText('notes.txt', { exact: true })).toBeVisible()
  expect(problems).toEqual([])
})

test('an online copy stays connected: resume it, or reset it to the online version', async ({ page }) => {
  const problems = watchForErrors(page)
  let body = 'print("version 1")\n'
  await page.context().route(`${CODE_HOST}/game.py`, route => route.fulfill({
    body, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' },
  }))
  const link = `/?filesystem=${encodeURIComponent(`${CODE_HOST}/game.py`)}`
  await go(page, link)
  await expect.poll(() => editorText(page)).toBe('print("version 1")\n')
  await expect(page.getByText('Opened “game.py”.', { exact: false })).toBeVisible()

  // The recipient's own change, saved.
  await setProgram(page, 'print("my change")')
  await page.getByRole('button', { name: 'Save to virtual filesystem' }).click()

  // A revisit asks; resuming keeps the change.
  let again = await reopen(page, link, problems)
  let question = again.getByRole('dialog', { name: 'You have opened this before' })
  await expect(question).not.toContainText('has changed')
  await expect(question).toBeVisible()
  await question.getByRole('button', { name: 'Resume my copy' }).click()
  await expect.poll(() => editorText(again)).toBe('print("my change")')

  // The sharer changes it: the question says so, and resetting asks first.
  body = 'print("version 2")\n'
  again = await reopen(again, link, problems)
  question = again.getByRole('dialog', { name: 'You have opened this before' })
  await expect(question).toContainText('The online version has changed since you last loaded it.')
  await expect(question).toBeVisible()
  await question.getByRole('button', { name: 'Reset to the online version' }).click()
  const warning = again.getByRole('dialog', { name: 'Reset to the online version?' })
  await expect(warning).toContainText('Changes you have made here will be lost.')
  await warning.getByRole('button', { name: 'Reset' }).click()
  await expect.poll(() => editorText(again)).toBe('print("version 2")\n')

  // The File System panel's refresh icon does the same at any time.
  await setProgram(again, 'print("changed again")')
  await again.getByRole('button', { name: 'Save to virtual filesystem' }).click()
  await again.getByRole('button', { name: 'Reset to the online version' }).click()
  await again.getByRole('dialog', { name: 'Reset to the online version?' }).getByRole('button', { name: 'Reset' }).click()
  await expect.poll(() => editorText(again)).toBe('print("version 2")\n')
  await again.close()
  expect(problems).toEqual([])
})

test('a link to an address with nothing there says so', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: [/code\.example\.test/] })
  await page.route(`${CODE_HOST}/missing.py`, route => route.fulfill({ status: 404, body: 'Not Found', headers: { 'Access-Control-Allow-Origin': '*' } }))
  await go(page, `/?filesystem=${encodeURIComponent(`${CODE_HOST}/missing.py`)}`)
  await expect(page.getByText(/Could not open the shared code: Nothing was found at that address/)).toBeVisible()
  expect(problems).toEqual([])
})

test('inside a book activity only the file is shared, and it can open back inside the book', async ({ page, browser, baseURL }) => {
  const origin = 'https://books.example.test/share/'
  const misses = [/books\.example\.test/, /\/api\/proxy/]
  const problems = watchForErrors(page, { ignoreRequestsTo: misses })
  const serveBook = (target: Page | BrowserContext) => target.route(/^https:\/\/books\.example\.test\/share\//, route => {
    const name = route.request().url().slice(origin.length)
    return name === '01.py'
      ? route.fulfill({ body: 'print("exercise")\n', contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' } })
      : route.fulfill({ status: 404, body: 'Not Found', headers: { 'Access-Control-Allow-Origin': '*' } })
  })
  await serveBook(page)
  await go(page, `/?book=${encodeURIComponent(origin)}&simple=1`)
  await page.getByRole('button', { name: '01', exact: true }).click()
  await expect.poll(() => editorText(page)).toBe('print("exercise")\n')
  await setProgram(page, 'print("my answer")')

  const dialog = await openShare(page)
  await dialog.getByRole('button', { name: 'Back' }).click()
  await expect(dialog.getByTestId('share-scope-filesystem')).toBeDisabled()
  await expect(dialog.getByTestId('share-scope-filesystem')).toContainText('In a learning book you can share the file you are working on')
  await dialog.getByTestId('share-scope-file').click()
  await expect(dialog).toContainText('Only this file is shared')
  await expect(dialog).toContainText('The link also lets them open it inside the learning book')
  await dialog.getByTestId('share-route-link').click()
  const link = await finishedLink(page)

  // A second person opens it inside the book, at the same activity.
  const other = await recipient(browser, baseURL)
  const otherProblems = watchForErrors(other.page, { ignoreRequestsTo: misses })
  await serveBook(other.context)
  await go(other.page, link)
  await answerSharedCode(other.page, /Open it in the learning book/)
  await expect.poll(() => editorText(other.page)).toBe('print("my answer")')

  // Their own work there is replaced only once they agree.
  await setProgram(other.page, 'print("their own work")')
  await other.page.getByRole('button', { name: 'Save to virtual filesystem' }).click()
  const again = await reopen(other.page, link, otherProblems, { ignoreRequestsTo: misses })
  await answerSharedCode(again, /Open it in the learning book/)
  const replace = again.getByRole('dialog', { name: 'Replace your work?' })
  await expect(replace).toContainText('You have already worked on “01”.')
  await replace.getByRole('button', { name: 'Keep mine' }).click()
  await expect.poll(() => editorText(again)).toBe('print("their own work")')
  await again.close()
  await other.context.close()
  expect(problems).toEqual([])
  expect(otherProblems).toEqual([])
})

test('files Pyodide once swept in without their folder are cleared away', async ({ page }) => {
  const problems = watchForErrors(page)
  await go(page, '/')
  await expect.poll(() => editorText(page)).toContain('Hello, World!')
  // What the old post-run sweep left: the stdlib ZIP, with no /lib folder entry.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('pythoncoder-vfs')
    open.onsuccess = () => {
      const store = open.result.transaction('entries', 'readwrite').objectStore('entries')
      const put = store.put({
        id: 'orphan-stdlib', fsId: 'default', parentPath: '/lib', path: '/lib/python313.zip', name: 'python313.zip',
        type: 'file', content: new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0xff]).buffer, mimeType: 'application/zip', size: 7, modifiedAt: 0,
      })
      put.onsuccess = () => resolve()
      put.onerror = () => reject(put.error)
    }
    open.onerror = () => reject(open.error)
  }))
  const again = await reopen(page, '/', problems)
  await expect.poll(() => editorText(again)).toContain('Hello, World!')
  const dialog = await openShare(again)
  await dialog.getByRole('button', { name: 'Back' }).click()
  await expect(dialog.getByTestId('share-scope-filesystem')).toContainText('1 file in')
  await dialog.getByTestId('share-scope-filesystem').click()
  await expect(dialog.getByTestId('share-route-link')).toBeEnabled()
  await again.close()
  expect(problems).toEqual([])
})

/** Teacher Tools → New learning book, named `name`. */
async function newBook(page: Page, name: string) {
  await page.getByRole('button', { name: 'Panels' }).click()
  await page.getByLabel('Teacher Tools').check()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /New learning book/ }).click()
  const prompt = page.getByRole('dialog', { name: 'New learning book' })
  await prompt.getByRole('textbox').fill(name)
  await prompt.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText(name).first()).toBeVisible()
}

test('a book being edited is shared whole: in a link, opened by a second person as a book', async ({ page, browser, baseURL }) => {
  const problems = watchForErrors(page)
  await go(page, '/')
  await newBook(page, 'Shared Book')
  // No single file is offered for sharing while a book is edited.
  await expect(shareButton(page)).toHaveCount(0)

  await page.getByRole('button', { name: 'Share this book with students…' }).click()
  const dialog = shareDialog(page)
  await expect(dialog).toContainText('Share “Shared Book”')
  await expect(dialog.getByTestId('share-route-link')).toContainText('not recommended')
  await dialog.getByRole('button', { name: 'Why is a link not recommended for a book?' }).click()
  await expect(dialog).toContainText('each student’s ticks belong to the copy they opened'.replace('’', "'"))
  await dialog.getByTestId('share-route-link').click()
  const link = await finishedLink(page)

  const other = await recipient(browser, baseURL)
  const otherProblems = watchForErrors(other.page)
  await go(other.page, link)
  const question = sharedCodeQuestion(other.page)
  await expect(question).toContainText('the learning book “Shared Book”')
  await expect(question).toBeVisible()
  await question.getByRole('button', { name: 'Open the learning book' }).click()
  await expect(other.page.getByText('Shared Book').first()).toBeVisible()
  await expect(other.page.getByRole('button', { name: 'Example', exact: true }).first()).toBeVisible()
  await other.context.close()
  expect(problems).toEqual([])
  expect(otherProblems).toEqual([])
})

test('a book being edited, put on Drive, goes straight on to its student link', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: [/drive\.google\.com/] })
  const zip = await zipOf({
    'book.json': JSON.stringify({ name: 'Drive Book', children: [{ id: 'act-1', name: 'First activity', py: 'ex01.py' }] }),
    'ex01.py': 'print(1)\n',
  })
  await page.route('https://drive.google.com/**', route => route.fulfill({
    body: zip, contentType: 'application/zip', headers: { 'Access-Control-Allow-Origin': '*' },
  }))
  await go(page, '/')
  await newBook(page, 'Drive Book')
  await page.getByRole('button', { name: 'Share this book with students…' }).click()
  const dialog = shareDialog(page)
  await dialog.getByTestId('share-route-drive').click()
  await expect(dialog).toContainText('Download the book')
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByLabel('Google Drive link').fill('https://drive.google.com/file/d/BookZip1/view?usp=sharing')
  await dialog.getByRole('button', { name: 'Next: the student link' }).click()

  // The Student links dialog checks what is there and offers its activities.
  await expect(page.getByRole('button', { name: 'First activity' })).toBeVisible()
  const studentLink = page.locator('input[readonly]')
  await expect(studentLink).toHaveValue(new RegExp(`\\?book=${encodeURIComponent('https://drive.google.com/uc?export=download&id=BookZip1').replace(/[?.]/g, '\\$&')}`))
  expect(problems).toEqual([])
})
