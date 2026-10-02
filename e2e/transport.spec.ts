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

test('shared memory that does not work steps the tab down to the service worker', async ({ page, context, browserName, baseURL }) => {
  test.setTimeout(180_000)
  const problems = watchForErrors(page)
  // WebKit is only isolated when it asks to be (scripts/isolationPolicy.mjs).
  if (browserName === 'webkit') {
    await context.addCookies([{ name: 'coder_isolation', value: 'require-corp', url: baseURL! }])
  }
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

/**
 * What Safari did on an isolated page: `new Worker(<address>)` fired a bare
 * `error` event and nothing else, for the trace worker and the test runner
 * alike. Here the app's workers, asked for by address, are sent to an address
 * that has no script — the same bare event — while a worker started from a
 * blob: copy is left alone (utils/workerBoot.ts).
 */
test.describe('a browser that will not start a worker from its address', () => {
  // The refused worker loads are the point; the browser reports each as an error.
  // (WebKit runs the dev server's stand-in page as a script and reports its first character.)
  const expected = (text: string) => /no-such-worker|MIME type|Failed to load resource|module script|Unexpected token '<'/i.test(text)

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const RealWorker = window.Worker
      window.Worker = class extends RealWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(/(tracer|tester)\.worker/.test(String(url)) ? '/no-such-worker.js' : url, options)
        }
      }
    })
  })

  test('still gets the step-by-step runner, started from a copy', async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto('/')
    await setProgram(page, QUIZ)
    await run(page)

    await expect(consolePanel(page)).toContainText('Name?', { timeout: 90_000 })
    await answer(page, 'Ada')
    await expect(consolePanel(page)).toContainText('Age?')
    await answer(page, '7')
    // The worker's own ending: this did not fall back to the main thread.
    await expect(consolePanel(page)).toContainText('[DEBUG FINISHED]')
    expect(await consoleTranscript(page)).toMatch(/Name\? Ada\s+Hello Ada\s+Age\? 7\s+Next year you will be 8/)
    await expect(page.getByText(UNAVAILABLE)).toHaveCount(0)
    expect(problems.filter(text => !expected(text))).toEqual([])
  })

  test('still gets Submit, whose test runner is a worker too', async ({ page, browserName }) => {
    const origin = 'https://books.example.test/tested/'
    const files: Record<string, string> = {
      'book.json': JSON.stringify({
        name: 'Tested book',
        id: 'tested-book',
        children: [{
          id: 'greet',
          name: 'Greet',
          guide: 'guide.md',
          py: 'greet.py',
          tests: [{ in: 'Joe', out: '.*Hello Joe' }, { in: 'Alice', out: '.*Hello Alice' }],
        }],
      }),
      'guide.md': '# Greet\n\nSay hello.\n',
      'greet.py': 'name = input("Name? ")\nprint("Hello " + name)\n',
    }
    await page.route(/^https:\/\/books\.example\.test\/tested\//, async route => {
      const body = files[route.request().url().slice(origin.length)]
      if (body === undefined) await route.fulfill({ status: 404, body: 'Not Found' })
      else await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body })
    })
    const problems = watchForErrors(page, { ignoreRequestsTo: [/books\.example\.test/, /\/api\/proxy/] })
    // The book is served by `page.route`, which cannot see a request once a
    // service worker controls the page — and a WebKit page, not being
    // isolated, registers one as it loads. Submit does not use the trace
    // worker's rung at all, so in WebKit this test goes without one.
    const rung = browserName === 'webkit' ? '&transport=none' : ''
    await page.goto(`/?book=${encodeURIComponent(`${origin}book.json`)}&challenge=greet${rung}`)
    await expect(page.getByText('greet.py', { exact: true }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByText('All passed')).toBeVisible({ timeout: 120_000 })
    expect(problems.filter(text => !expected(text))).toEqual([])
  })
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
