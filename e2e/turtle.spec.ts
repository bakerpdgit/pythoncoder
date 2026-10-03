import { test, expect, type Page } from '@playwright/test'
import { consoleCopy, hasJspi, setProgramViaApi, watchForErrors } from './helpers'

/**
 * The Python turtle: CPython's own turtle.py (src/python/turtle.py) drawn by
 * Coder's tkinter in the Display pane. It runs in the trace worker, so Run
 * animates, Debug and Trace step through a drawing, keys and clicks and
 * textinput() reach the program, and Stop ends it; on the main thread (no
 * worker) it still animates. A finished drawing ends its run, a replay slider
 * steps back through it, and the two older turtles stay available in Settings.
 *
 * (A program that only draws keeps its console folded, so the transcript is
 * read through the console's Copy button rather than its rows.)
 */

const windowEl = (page: Page) => page.locator('.tkx-window').first()
/** The turtle's own shape is the third canvas item turtle.py creates. */
const turtleShape = (page: Page) => page.locator('.tkx-canvas [data-tki="3"] polygon')
/** Every line on the live canvas, as its points. */
const canvasLines = (page: Page) => page.locator('.tkx-canvas svg > g').first().locator('polyline')
  .evaluateAll(els => els.map(el => (el.getAttribute('points') ?? '').trim()))

const SETTINGS_KEY = 'coder_app_settings'

async function chooseTurtle(page: Page, engine: 'cpython' | 'pyo-js-turtle' | 'basthon-svg') {
  await page.addInitScript(([key, value]) => {
    localStorage.setItem(key, JSON.stringify({ turtleEngine: value }))
  }, [SETTINGS_KEY, engine])
}

/** Start a run the way a student would from the keyboard (utils/shortcuts.ts). */
async function start(page: Page, mode: 'run' | 'debug' | 'trace') {
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  await page.keyboard.press(mode === 'run' ? 'Control+F5' : mode === 'debug' ? 'F5' : 'Control+Shift+F5')
}

const transcript = (page: Page) => consoleCopy(page).catch(() => '')

/** The line the debugger is paused on, read from the editor's highlight (0 when none). */
const pausedLine = (page: Page) => page.evaluate(() => {
  const highlight = document.querySelector('.monaco-editor .monaco-trace-line') as HTMLElement | null
  const top = (highlight?.parentElement as HTMLElement | null)?.style.top
  if (!top) return 0
  const number = [...document.querySelectorAll('.monaco-editor .line-numbers')]
    .find(el => (el.parentElement as HTMLElement).style.top === top)
  return Number(number?.textContent ?? 0)
})

/** Step Over from line `from`, and wait until the debugger has paused on the next line. */
async function stepOver(page: Page, from: number) {
  await expect.poll(() => pausedLine(page)).toBe(from)
  await page.getByRole('button', { name: 'Over' }).click()
  await expect.poll(() => pausedLine(page)).toBe(from + 1)
}

test.describe('in the trace worker', () => {
  test('Run animates the turtle, and a finished drawing ends the run', async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto('/')
    await setProgramViaApi(page, [
      'import turtle',
      't = turtle.Turtle()',
      't.speed(1)',
      't.forward(200)',
      'print("at", t.pos(), turtle.__file__)',
      'turtle.done()',
      'print("done returned")',
    ].join('\n'))
    await start(page, 'run')
    await expect(windowEl(page)).toBeVisible()

    // Part-way through the move the turtle is somewhere between 0 and 200.
    const xs: number[] = []
    await expect.poll(async () => {
      const points = await turtleShape(page).getAttribute('points', { timeout: 1000 }).catch(() => null)
      if (points) xs.push(Number(points.split(/[ ,]/)[0]))
      return xs.some(x => x > 20 && x < 180)
    }, { intervals: [50] }).toBe(true)

    await expect.poll(() => transcript(page), { timeout: 30_000 }).toContain('[RUN FINISHED]')
    const text = await transcript(page)
    expect(text).not.toContain('[MAIN-THREAD')
    expect(text).toContain('at (200.00,0.00) /lib/coder_tk/turtle.py')
    expect(text).toContain('done returned')
    await expect(windowEl(page)).toContainText('Python Turtle Graphics — not running')
    expect(problems).toEqual([])
  })

  test('Trace steps through a drawing, which shows what each line has drawn', async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto('/')
    await setProgramViaApi(page, [
      'import turtle',
      't = turtle.Turtle()',
      't.forward(100)',
      't.left(90)',
      't.forward(50)',
    ].join('\n'))
    await start(page, 'trace')
    // Lines 1 and 2: import, make the turtle. Then line 3 draws one side.
    await stepOver(page, 1)
    await stepOver(page, 2)
    await expect(windowEl(page)).toBeVisible()
    expect((await canvasLines(page)).join(' ')).not.toContain('100,0')
    await stepOver(page, 3)
    // Paused on line 4, the first side is on screen and the second is not.
    await expect.poll(() => canvasLines(page).then(lines => lines.join(' '))).toContain('100,0')
    expect((await canvasLines(page)).join(' ')).not.toContain('100,-50')
    await page.getByRole('button', { name: 'Continue' }).click()
    // A trace opens on its table; the transcript is on the Console tab.
    await page.locator('#console-tab-console').click()
    await expect.poll(() => transcript(page), { timeout: 30_000 }).toContain('[TRACE FINISHED]')
    await expect.poll(() => canvasLines(page).then(lines => lines.join(' '))).toContain('100,-50')
    expect(problems).toEqual([])
  })

  test('keys and clicks reach the program, and Stop ends it', async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto('/')
    await setProgramViaApi(page, [
      'import turtle',
      's = turtle.Screen()',
      't = turtle.Turtle()',
      't.speed(0)',
      'def up():',
      '    t.forward(30)',
      '    print("up", t.pos())',
      'def click(x, y):',
      '    print("click", round(x), round(y))',
      's.onkey(up, "Up")',
      's.onscreenclick(click)',
      's.listen()',
      'turtle.done()',
    ].join('\n'))
    await start(page, 'run')
    await expect(windowEl(page)).toBeVisible()

    // listen() gave the canvas the keyboard.
    await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('tkx-canvas'))).toBe(true)
    await page.keyboard.press('ArrowUp')
    await expect.poll(() => transcript(page)).toContain('up (30.00,0.00)')

    // The middle of the canvas is (0, 0), give or take the border Tk insets it by.
    const box = (await page.locator('.tkx-canvas').first().boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect.poll(() => transcript(page)).toMatch(/click -?\d+ -?\d+/)
    const [, cx, cy] = (await transcript(page)).match(/click (-?\d+) (-?\d+)/)!.map(Number)
    expect(Math.abs(cx)).toBeLessThanOrEqual(6)
    expect(Math.abs(cy)).toBeLessThanOrEqual(6)

    await page.getByRole('button', { name: /^Stop$/ }).click()
    await expect(windowEl(page)).toContainText('not running')
    await expect(page.getByText('Worker runtime stopped.')).toBeVisible()
    expect(problems).toEqual([])
  })

  test('Stop ends a drawing that would never finish', async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto('/')
    await setProgramViaApi(page, [
      'import turtle',
      't = turtle.Turtle()',
      't.speed(0)',
      'while True:',
      '    t.forward(3)',
      '    t.left(2)',
    ].join('\n'))
    await start(page, 'run')
    await expect(windowEl(page)).toBeVisible()
    await expect(turtleShape(page)).toHaveCount(1)
    await page.getByRole('button', { name: /^Stop$/ }).click()
    await expect(windowEl(page)).toContainText('not running', { timeout: 5_000 })
    expect(problems).toEqual([])
  })

  test('textinput() and numinput() ask in a dialog', async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto('/')
    await setProgramViaApi(page, [
      'import turtle',
      's = turtle.Screen()',
      'name = s.textinput("Name", "What is your name?")',
      'sides = s.numinput("Sides", "How many sides?", 4, minval=3, maxval=10)',
      'print("got", repr(name), sides)',
    ].join('\n'))
    await start(page, 'run')
    const dialog = page.locator('.tkx-dialog')
    await expect(dialog).toContainText('What is your name?')
    await dialog.locator('input').fill('Ada')
    await dialog.getByRole('button', { name: 'OK' }).click()
    await expect(dialog).toContainText('How many sides?')
    await dialog.locator('input').fill('6')
    await dialog.getByRole('button', { name: 'OK' }).click()
    await expect.poll(() => transcript(page)).toContain('[RUN FINISHED]')
    expect(await transcript(page)).toContain("got 'Ada' 6.0")
    expect(problems).toEqual([])
  })

  test('the replay slider steps back through a finished drawing, one turtle command at a time', async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto('/')
    await setProgramViaApi(page, [
      'import turtle',
      't = turtle.Turtle()',
      't.speed(0)',
      'for _ in range(4):',
      '    t.forward(80)',
      '    t.left(90)',
    ].join('\n'))
    await start(page, 'run')
    await expect.poll(() => transcript(page), { timeout: 30_000 }).toContain('[RUN FINISHED]')

    // The turtle appearing, then one step per command; the newest is the live drawing.
    const counter = page.getByTitle('Current step / total steps')
    await expect(counter).toHaveText('9/9')
    const live = page.locator('.tkx-canvas svg > g').first()
    await expect(live).toBeVisible()

    // Step 3 is the first side drawn and the first turn: one line, 80 long.
    for (let i = 0; i < 6; i++) await page.getByTitle('Previous step').click()
    await expect(counter).toHaveText('3/9')
    await expect(live).toBeHidden()
    const replayed = page.locator('.tkx-canvas svg > g:not([data-tki]):visible').last()
    const lines = await replayed.locator('polyline').evaluateAll(els => els.map(el => (el.getAttribute('points') ?? '').trim()))
    expect(lines).toContain('0,0 80,0')
    expect(lines.join(' ')).not.toContain('80,-80')

    // Play runs it forward again, to the live drawing.
    await page.getByTitle('Play from start').click()
    await expect(counter).toHaveText('9/9', { timeout: 10_000 })
    await expect(live).toBeVisible()

    // Closing the slider leaves the drawing.
    await page.getByTitle('Close scrubber').click()
    await expect(counter).toHaveCount(0)
    await expect(live).toBeVisible()
    expect(problems).toEqual([])
  })
})

test.describe('waiting on the service worker', () => {
  test('Trace steps a drawing, keys reach it, and Stop ends it', async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto('/?transport=xhr')
    await setProgramViaApi(page, [
      'import turtle',
      's = turtle.Screen()',
      't = turtle.Turtle()',
      't.forward(60)',
      's.onkey(lambda: print("key", t.xcor()), "space")',
      's.listen()',
      'turtle.done()',
    ].join('\n'))
    await start(page, 'trace')
    // Line 4 draws; paused on line 5, the line is on screen.
    for (let line = 1; line <= 4; line++) await stepOver(page, line)
    await expect.poll(() => canvasLines(page).then(lines => lines.join(' '))).toContain('60,0')
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.locator('#console-tab-console').click()
    // done() is waiting for the key.
    await page.locator('.tkx-canvas').first().click()
    await page.keyboard.press('Space')
    await expect.poll(() => transcript(page)).toContain('key 60.0')
    // A trace is stopped cooperatively: the worker hears it while waiting for keys.
    await page.getByRole('button', { name: /^Stop$/ }).click()
    await expect(page.getByText('Worker runtime stopped.')).toBeVisible()
    await expect(windowEl(page)).toContainText('not running')
    expect(problems).toEqual([])
  })
})

test.describe('on the main thread', () => {
  test('the turtle still animates, and a finished drawing ends the run', async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto('/?transport=none')
    test.skip(!(await hasJspi(page)), 'the page cannot pause between steps without JSPI')
    await setProgramViaApi(page, [
      'import turtle',
      't = turtle.Turtle()',
      't.speed(1)',
      't.forward(200)',
      'turtle.done()',
      'print("done returned")',
    ].join('\n'))
    await start(page, 'run')
    await expect(windowEl(page)).toBeVisible()
    const xs: number[] = []
    await expect.poll(async () => {
      const points = await turtleShape(page).getAttribute('points', { timeout: 1000 }).catch(() => null)
      if (points) xs.push(Number(points.split(/[ ,]/)[0]))
      return xs.some(x => x > 20 && x < 180)
    }, { intervals: [50] }).toBe(true)
    await expect.poll(() => transcript(page), { timeout: 30_000 }).toContain('[MAIN-THREAD RUN FINISHED]')
    expect(await transcript(page)).toContain('done returned')
    expect(problems).toEqual([])
  })

  test('without JSPI the drawing appears at the end, and its keys still work', async ({ page }) => {
    // As on a browser that cannot suspend WebAssembly: nothing can wait for the
    // page, so delays are skipped and the event loop runs after the last line.
    await page.addInitScript(() => {
      try { delete (WebAssembly as unknown as Record<string, unknown>).Suspending } catch { /* ignore */ }
    })
    const problems = watchForErrors(page)
    await page.goto('/?transport=none')
    await setProgramViaApi(page, [
      'import turtle',
      's = turtle.Screen()',
      't = turtle.Turtle()',
      't.speed(1)',
      't.circle(50)',
      's.onkey(lambda: print("key", t.heading()), "space")',
      's.listen()',
      'turtle.done()',
      'print("after done")',
    ].join('\n'))
    await start(page, 'run')
    await expect.poll(() => transcript(page)).toContain('after done')
    await expect(page.locator('.tkx-canvas [data-tki]')).not.toHaveCount(0)
    await page.locator('.tkx-canvas').first().click()
    await page.keyboard.press('Space')
    await expect.poll(() => transcript(page)).toContain('key 0.0')
    await page.getByRole('button', { name: /^Stop$/ }).click()
    await expect.poll(() => transcript(page)).toContain('[MAIN-THREAD RUN STOPPED]')
    expect(problems).toEqual([])
  })
})

test.describe('in a book', () => {
  const origin = 'https://books.example.test/turtles/'
  const files: Record<string, string> = {
    'book.json': JSON.stringify({
      name: 'Turtle tests',
      id: 'turtle-tests',
      children: [{
        id: 'square',
        name: 'A square',
        guide: 'guide.md',
        py: 'square.py',
        additionalFiles: [{ filename: 'square_sol.py', visible: false }],
        tests: [{ in: '100', out: [{ typ: 't', filename: 'square_sol.py' }] }],
      }],
    }),
    'guide.md': '# A square\n\nDraw a square whose side you are told.\n\n![preview](turtlepreview)\n',
    // The same square by another route: two half sides, and three-quarter turns.
    'square.py': [
      'import turtle',
      'side = int(input("Side? "))',
      't = turtle.Turtle()',
      'for _ in range(4):',
      '    t.forward(side / 2)',
      '    t.forward(side / 2)',
      '    t.right(270)',
      '',
    ].join('\n'),
    'square_sol.py': [
      'import turtle',
      'side = int(input())',
      't = turtle.Turtle()',
      'for _ in range(4):',
      '    t.forward(side)',
      '    t.left(90)',
      '',
    ].join('\n'),
  }

  test('Submit marks a drawing against the solution, and the guide previews it', async ({ page, browserName }) => {
    await page.route(/^https:\/\/books\.example\.test\/turtles\//, async route => {
      const body = files[route.request().url().slice(origin.length)]
      if (body === undefined) await route.fulfill({ status: 404, body: 'Not Found' })
      else await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body })
    })
    const problems = watchForErrors(page, { ignoreRequestsTo: [/books\.example\.test/, /\/api\/proxy/] })
    // page.route cannot see past a service worker, which a WebKit page registers as it loads.
    const rung = browserName === 'webkit' ? '&transport=none' : ''
    await page.goto(`/?book=${encodeURIComponent(`${origin}book.json`)}&challenge=square${rung}`)
    await expect(page.getByText('square.py', { exact: true }).first()).toBeVisible()

    // The preview is the solution's drawing, turtle and all.
    const preview = page.locator('.turtle-preview-wrapper svg')
    await expect(preview).toBeVisible({ timeout: 120_000 })
    expect(await preview.locator('line').count()).toBe(4)
    expect(await preview.locator('polygon').count()).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByText('All passed')).toBeVisible({ timeout: 120_000 })

    // A triangle is not that square.
    await setProgramViaApi(page, 'import turtle\nside = int(input())\nt = turtle.Turtle()\nfor _ in range(3):\n    t.forward(side)\n    t.left(120)\n')
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByText('0/1 passed')).toBeVisible({ timeout: 120_000 })
    expect(problems).toEqual([])
  })
})

const SQUARE = [
  'import turtle',
  't = turtle.Turtle()',
  'for _ in range(4):',
  '    t.forward(60)',
  '    t.left(90)',
].join('\n')

test('each turtle choice in Settings draws on its own surface', async ({ page }) => {
  const problems = watchForErrors(page)

  await chooseTurtle(page, 'pyo-js-turtle')
  await page.goto('/')
  await setProgramViaApi(page, SQUARE)
  await start(page, 'run')
  await expect.poll(() => transcript(page)).toContain('[MAIN-THREAD RUN FINISHED]')
  await expect(page.locator('#canvas')).toBeVisible()
  await expect(page.locator('.tkx-window')).toHaveCount(0)

  await chooseTurtle(page, 'basthon-svg')
  await page.goto('/')
  await setProgramViaApi(page, SQUARE)
  await start(page, 'run')
  // The SVG turtle runs in the trace worker and draws no window.
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('svg line').length)).toBeGreaterThan(0)
  await expect(page.locator('.tkx-window')).toHaveCount(0)

  await chooseTurtle(page, 'cpython')
  await page.goto('/')
  await setProgramViaApi(page, SQUARE)
  await start(page, 'run')
  await expect(windowEl(page)).toBeVisible()
  await expect.poll(() => transcript(page), { timeout: 30_000 }).toContain('[RUN FINISHED]')
  expect(problems).toEqual([])
})

test('a program with key handlers gets the Python turtle even when SVG is chosen', async ({ page }) => {
  const problems = watchForErrors(page)
  await chooseTurtle(page, 'basthon-svg')
  await page.goto('/')
  await setProgramViaApi(page, [
    'import turtle',
    's = turtle.Screen()',
    's.onkey(lambda: print("pressed"), "Up")',
    's.listen()',
    'turtle.done()',
  ].join('\n'))
  await start(page, 'run')
  await expect(windowEl(page)).toBeVisible()
  await expect.poll(() => transcript(page)).toContain('running with the Python turtle')
  await page.getByRole('button', { name: /^Stop$/ }).click()
  await expect(windowEl(page)).toContainText('not running')
  expect(problems).toEqual([])
})
