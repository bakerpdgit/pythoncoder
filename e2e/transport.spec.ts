import { test, expect, type Page } from '@playwright/test'
import { consolePanel, run, setProgram, watchForErrors } from './helpers'

/**
 * The trace worker has two ways of waiting for the page (shared memory, and a
 * request held open by a service worker — utils/traceSyncProtocol.ts), and a
 * tab steps down from one to the next, and finally to the main thread, when a
 * run shows that one does not work (utils/runtimeFallback.ts).
 *
 * That exists because a browser can pass every check made at page load and
 * still fail every run: Safari was cross-origin isolated, was offered the
 * worker, and gave students nothing but an error in the console.
 */

const QUIZ = [
  'print("Welcome to the quiz")',
  'name = input("Name? ")',
  'print("Hello " + name)',
  'age = input("Age? ")',
  'print("Next year you will be", int(age) + 1)',
].join('\n')

async function answer(page: Page, text: string): Promise<void> {
  await expect(page.locator('#console-panel-console .xterm-helper-textarea')).toBeFocused()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

/** Everything in the console (see input.spec.ts for why not the rendered rows). */
async function consoleTranscript(page: Page, timeout = 15_000): Promise<string> {
  await page.evaluate(() => {
    const w = window as unknown as { __copiedConsole?: string }
    delete w.__copiedConsole
    navigator.clipboard.writeText = async (text: string) => { w.__copiedConsole = text }
  })
  await page.getByRole('button', { name: 'Copy console output' }).click()
  const copied = await page.waitForFunction(() => (window as unknown as { __copiedConsole?: string }).__copiedConsole, null, { timeout })
  return String(await copied.jsonValue())
}

const UNAVAILABLE = "The step-by-step runner isn't available in this tab."
const sharedMemory = (page: Page) => page.evaluate(() => window.crossOriginIsolated && typeof SharedArrayBuffer === 'function')

test('a tab that is not cross-origin isolated still gets the step-by-step runner', async ({ page }) => {
  const problems = watchForErrors(page)
  // What a school web filter does: the page arrives without its isolation
  // headers, so there is no SharedArrayBuffer for the worker to wait on.
  await page.route(url => url.pathname === '/', async route => {
    const response = await route.fetch()
    const headers = { ...response.headers() }
    delete headers['cross-origin-embedder-policy']
    delete headers['cross-origin-opener-policy']
    await route.fulfill({ response, headers })
  })
  await page.goto('/')
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(false)
  await expect(page.getByText(UNAVAILABLE)).toHaveCount(0)

  await setProgram(page, QUIZ)
  await run(page)

  await expect(consolePanel(page)).toContainText('Name?')
  await expect(consolePanel(page)).toContainText('Welcome to the quiz')
  await answer(page, 'Ada')
  await expect(consolePanel(page)).toContainText('Age?')
  await answer(page, '7')
  // Only the worker ends a run this way; the main thread says otherwise.
  await expect(consolePanel(page)).toContainText('[DEBUG FINISHED]')
  expect(await consoleTranscript(page)).toMatch(/Welcome to the quiz\s+Name\? Ada\s+Hello Ada\s+Age\? 7\s+Next year you will be 8/)
  // Rewriting the document's headers makes Chromium refuse Vite's own
  // hot-reload socket, which is the test's doing and nothing to do with the app.
  expect(problems.filter(text => !/WebSocket|\[vite\]/.test(text))).toEqual([])
})

test.describe('waiting on the service worker', () => {
  test('Trace steps a line at a time', async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto('/?transport=xhr')
    await setProgram(page, 'print("one")\nprint("two")\nprint("three")')

    await page.keyboard.press('Control+Shift+F5')
    const over = page.getByRole('button', { name: 'Over' })
    await expect(over).toBeVisible()
    // A trace opens on its table; the program's output is on the Console tab.
    await page.locator('#console-tab-console').click()
    // Paused on the first line: nothing has run yet.
    await expect(consolePanel(page)).not.toContainText('one')
    await over.click()
    await expect(consolePanel(page)).toContainText('one')
    await expect(consolePanel(page)).not.toContainText('two')
    await over.click()
    await expect(consolePanel(page)).toContainText('two')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(consolePanel(page)).toContainText('[TRACE FINISHED]')
    expect(await consoleTranscript(page)).toMatch(/one\s+two\s+three/)
    expect(problems).toEqual([])
  })

  test('Stop reaches a trace that is waiting for input()', async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto('/?transport=xhr')
    await setProgram(page, 'print("before")\nname = input("Name? ")\nprint("after")')

    await page.keyboard.press('Control+Shift+F5')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(consolePanel(page)).toContainText('Name?')
    await page.getByRole('button', { name: 'Stop' }).click()
    // The worker heard the request, flushed its trace and said so: a stop
    // that had to be forced reports a missing trace table instead.
    await expect(page.getByText('Worker runtime stopped.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Trace$/ })).toBeEnabled()
    expect(problems).toEqual([])
  })

  test('time.sleep() in a canvas program parks the worker', async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto('/?transport=xhr')
    await setProgram(page, [
      'import time',
      'from sys import stdctx',
      'started = time.time()',
      'stdctx.fillRect(10, 10, 20, 20)',
      'time.sleep(0.4)',
      'stdctx.fillRect(40, 10, 20, 20)',
      'print("slept", time.time() - started >= 0.4, stdctx.check_key(65))',
    ].join('\n'))
    await run(page)

    // A program that draws can leave its console folded, so the transcript is
    // read through the Copy button rather than the rows — and asked for again
    // until the run has ended, since an empty console copies nothing.
    await expect.poll(() => consoleTranscript(page, 2_000).catch(() => ''), { timeout: 60_000 })
      .toContain('[DEBUG FINISHED]')
    expect(await consoleTranscript(page)).toContain('slept True False')
    expect(problems).toEqual([])
  })
})

test('shared memory that does not work steps the tab down to the service worker', async ({ page }) => {
  test.setTimeout(180_000)
  const problems = watchForErrors(page)
  // The page believes it has shared memory, and nothing it writes arrives:
  // isolated, SharedArrayBuffer present, and a worker that is never answered.
  // (Silencing notify alone is not enough. The page usually answers before
  // the worker has begun to wait, and the changed value is answer enough.)
  await page.addInitScript(() => {
    Atomics.store = ((_array: unknown, _index: number, value: number) => value) as typeof Atomics.store
    Atomics.notify = () => 0
  })
  await page.goto('/')
  test.skip(!(await sharedMemory(page)), 'this browser build has no SharedArrayBuffer to fail')

  await setProgram(page, 'print("made it")')
  await run(page)

  await expect(consolePanel(page)).toContainText('[DEBUG FINISHED]', { timeout: 90_000 })
  const first = await consoleTranscript(page)
  expect(first).toContain('did not work using shared memory')
  expect(first).toContain('What went wrong:')
  expect(first).toContain('made it')

  // The tab remembers: the next run goes straight to the transport that works.
  await run(page)
  await expect(consolePanel(page)).toContainText('[DEBUG FINISHED]')
  const second = await consoleTranscript(page)
  expect(second).toContain('made it')
  expect(second).not.toContain('did not work using')
  expect(problems).toEqual([])
})

test.describe('with no service worker either', () => {
  test.use({ serviceWorkers: 'block' })

  test('the program runs on the main thread, and the tab says why', async ({ page }) => {
    await page.goto('/?transport=xhr')
    await setProgram(page, 'print("made it anyway")')
    await run(page)

    await expect(consolePanel(page)).toContainText('made it anyway', { timeout: 90_000 })
    const transcript = await consoleTranscript(page)
    expect(transcript).toContain('running on the main thread instead')
    expect(transcript).toContain('What went wrong:')
    await expect(page.getByText(UNAVAILABLE)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    // Not left stranded: the next run starts without being asked to choose.
    await expect(page.getByRole('button', { name: /^Run$/ })).toBeEnabled()
  })
})
