import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { consoleCopy, hasJspi, setProgramViaApi, watchForErrors } from './helpers'

/**
 * p5 sketches, against Coder's p5 (src/python/p5), drawn on an HTML canvas in
 * a window of Coder's tkinter (utils/p5Draw.ts): a sketch runs in the trace
 * worker and on the main thread, follows the mouse and the keys, can be
 * debugged inside draw(), and ends when its window closes or when it can do
 * nothing more. Then the shipped Python p5 book: every page runs, and every
 * task's solution passes Submit while its starter code fails — the pixel
 * comparison of utils/p5Compare.ts, run for real in the tester worker.
 */

const windowEl = (page: Page) => page.locator('.tkx-window').first()
const sketch = (page: Page) => page.locator('canvas.tkx-p5').first()
const runButton = (page: Page) => page.getByRole('button', { name: /^(Run|Debug)$/ })
const consoleText = (page: Page) => consoleCopy(page).catch(() => '')

async function runIt(page: Page) {
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  await page.keyboard.press('Control+F5')
}

/** The colour of sketch pixel (x, y), whatever the screen's pixel ratio. */
async function pixel(page: Page, x: number, y: number): Promise<number[]> {
  return sketch(page).evaluate((canvas: HTMLCanvasElement, [px, py]) => {
    const ratio = canvas.width / parseFloat(canvas.style.width)
    const data = canvas.getContext('2d')!.getImageData(Math.round(px * ratio), Math.round(py * ratio), 1, 1).data
    return [data[0], data[1], data[2], data[3]]
  }, [x, y])
}

const FOLLOWER = [
  'from p5 import *',
  '',
  'def setup():',
  '    size(300, 200)',
  '    print("setup", width, height)',
  '',
  'def draw():',
  '    background(220)',
  '    no_stroke()',
  '    fill(255, 0, 0)',
  '    circle(mouse_x, mouse_y, 40)',
  '    if frame_count == 20:',
  '        print("twenty frames")',
  '',
  'run()',
  'print("after run")',
].join('\n')

const RUNTIMES = [
  { name: 'in the trace worker', url: '/', finished: '[RUN FINISHED]' },
  { name: 'in the trace worker, waiting on the service worker', url: '/?transport=xhr', finished: '[RUN FINISHED]' },
  { name: 'on the main thread', url: '/?tk=main', finished: '[MAIN-THREAD RUN FINISHED]' },
]

for (const runtime of RUNTIMES) {
  test(`a sketch draws, follows the mouse and ends when its window closes, ${runtime.name}`, async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto(runtime.url)
    if (runtime.url.includes('tk=main')) test.skip(!(await hasJspi(page)), 'the main thread animates through JSPI')
    await setProgramViaApi(page, FOLLOWER)
    await runIt(page)
    await expect(sketch(page)).toBeVisible()
    await expect(windowEl(page).locator('.tkx-titletext')).toHaveText('p5 sketch')
    await expect.poll(() => consoleText(page)).toContain('twenty frames')
    expect(await consoleText(page)).toContain('setup 300 200')
    expect(await sketch(page).evaluate((c: HTMLCanvasElement) => c.style.width)).toBe('300px')

    const box = (await sketch(page).boundingBox())!
    const zoom = box.width / 300
    await page.mouse.move(box.x + 200 * zoom, box.y + 120 * zoom)
    await expect.poll(() => pixel(page, 200, 120)).toEqual([255, 0, 0, 255])
    // The background where the circle is not.
    expect(await pixel(page, 20, 20)).toEqual([220, 220, 220, 255])

    await windowEl(page).locator('.tkx-close').click()
    await expect.poll(() => consoleText(page)).toContain(runtime.finished)
    await expect(runButton(page)).toBeVisible()
    // run() returned when the window closed, and the program carried on.
    expect(await consoleText(page)).toContain('after run')
    expect(problems).toEqual([])
  })
}

test('without JSPI on the main thread: run() returns at once, and the sketch still animates', async ({ page }) => {
  // As on a browser that predates JSPI with no worker: Python cannot pause, so
  // Coder's tkinter keeps the window's timers going from an async loop once
  // the program has ended, and every frame of the sketch comes from there.
  await page.addInitScript(() => {
    try { delete (WebAssembly as unknown as Record<string, unknown>).Suspending } catch { /* ignore */ }
  })
  const problems = watchForErrors(page)
  await page.goto('/?tk=main')
  await setProgramViaApi(page, FOLLOWER)
  await runIt(page)
  await expect(sketch(page)).toBeVisible()
  await expect.poll(() => consoleText(page)).toContain('twenty frames')
  // The program's last line ran before the first frame did.
  const text = await consoleText(page)
  expect(text.indexOf('after run')).toBeLessThan(text.indexOf('twenty frames'))
  const box = (await sketch(page).boundingBox())!
  const zoom = box.width / 300
  await page.mouse.move(box.x + 100 * zoom, box.y + 50 * zoom)
  await expect.poll(() => pixel(page, 100, 50)).toEqual([255, 0, 0, 255])
  await windowEl(page).locator('.tkx-close').click()
  await expect.poll(() => consoleText(page)).toContain('[MAIN-THREAD RUN FINISHED]')
  expect(problems).toEqual([])
})

test('Trace records a sketch line by line, and ends with it', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await setProgramViaApi(page, [
    'from p5 import *',
    'def setup():',
    '    size(100, 100)',
    'def draw():',
    '    background(0, 0, 255)',
    '    if frame_count == 3:',
    '        no_loop()',
    'run()',
    'print("done")',
  ].join('\n'))
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  await page.keyboard.press('Control+Shift+F5')
  // A trace starts paused on its first line.
  await page.getByRole('button', { name: 'Continue' }).click()
  // It opens on its table; the transcript is on the Console tab.
  await page.locator('#console-tab-console').click()
  await expect.poll(() => consoleText(page), { timeout: 60_000 }).toContain('[TRACE FINISHED]')
  expect(await consoleText(page)).toContain('done')
  expect(await pixel(page, 50, 50)).toEqual([0, 0, 255, 255])
  expect(problems).toEqual([])
})

test('a sketch that stops looping, with nothing to listen for, finishes by itself', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await setProgramViaApi(page, [
    'from p5 import *',
    'def setup():',
    '    size(200, 200)',
    '    no_loop()',
    'def draw():',
    '    background(0, 0, 255)',
    '    print("drawn", frame_count)',
  ].join('\n'))
  await runIt(page)
  // No run(): the sketch starts after the program's last line, as pyp5js does.
  await expect.poll(() => consoleText(page)).toContain('[RUN FINISHED]')
  expect(await consoleText(page)).toContain('drawn 1')
  expect(await pixel(page, 100, 100)).toEqual([0, 0, 255, 255])
  // Its last frame stays on screen.
  await expect(sketch(page)).toBeVisible()
  expect(problems).toEqual([])
})

test('an error in draw() stops the sketch and is reported against the student’s line', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await setProgramViaApi(page, [
    'from p5 import *',
    'def draw():',
    '    if frame_count == 3:',
    '        circle(10, 10, "big")',
    'run()',
  ].join('\n'))
  await runIt(page)
  await expect.poll(() => consoleText(page)).toMatch(/must be a number/)
  const text = await consoleText(page)
  expect(text).toContain('line 4')
  await expect(runButton(page)).toBeVisible()
  expect(problems).toEqual([])
})

test('the keyboard: key_is_down() moves, key_pressed() fires once a press', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await setProgramViaApi(page, [
    'from p5 import *',
    'x = 50',
    'presses = 0',
    'def setup():',
    '    size(200, 100)',
    'def draw():',
    '    global x',
    '    if key_is_down(RIGHT_ARROW):',
    '        x = x + 5',
    '    background(255)',
    '    fill(0)',
    '    square(x, 40, 10)',
    'def key_pressed():',
    '    global presses',
    '    presses += 1',
    '    print("pressed", key, key_code, presses)',
    'run()',
  ].join('\n'))
  await runIt(page)
  await expect(sketch(page)).toBeVisible()
  await sketch(page).click()
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(400)
  await page.keyboard.up('ArrowRight')
  await page.keyboard.press('a')
  await expect.poll(() => consoleText(page)).toContain('pressed a 65')
  const text = await consoleText(page)
  // Held down, the arrow repeated in the browser but was one press to the sketch.
  expect(text).toContain('pressed ArrowRight 39 1')
  expect(text).toContain('pressed a 65 2')
  // And the square moved while it was held.
  expect(await pixel(page, 55, 45)).toEqual([255, 255, 255, 255])
  await page.getByRole('button', { name: /stop/i }).click()
  await expect(runButton(page)).toBeVisible()
  expect(problems).toEqual([])
})

test('Debug pauses inside draw(), with the frame drawn so far on the canvas', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await setProgramViaApi(page, [
    'from p5 import *',
    'def setup():',
    '    size(200, 200)',
    'def draw():',
    '    background(0, 200, 0)',
    '    fill(255, 0, 0)',
    '    rect(0, 0, 100, 100)',
    'run()',
  ].join('\n'))
  // A breakpoint on line 6: after the background, before the red square.
  const lineSix = (await page.locator('.monaco-editor .line-numbers', { hasText: /^6$/ }).boundingBox())!
  await page.mouse.click(lineSix.x - 8, lineSix.y + lineSix.height / 2)
  await expect(page.locator('.monaco-editor .monaco-breakpoint-glyph')).not.toHaveCount(0)
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  await page.keyboard.press('F5')
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
  await expect(sketch(page)).toBeVisible()
  // Paused before the square: the background is there, the square not yet.
  await expect.poll(() => pixel(page, 50, 50)).toEqual([0, 200, 0, 255])
  await page.getByRole('button', { name: 'Continue' }).click()
  // The next frame pauses at the same line again, with the square from the last frame drawn over.
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
  await page.getByRole('button', { name: /stop/i }).click()
  await expect(runButton(page)).toBeVisible()
  expect(problems).toEqual([])
})

// ── The Python p5 book ──────────────────────────────────────────────────────

const BOOK_ORIGIN = 'https://books.example.test/p5/'
const BOOK_DIR = join(process.cwd(), 'P5')

interface Activity { id: string; name: string; py: string; isExample?: boolean; tests?: { out: { filename: string }[] }[] }

const book = JSON.parse(readFileSync(join(BOOK_DIR, 'book.json'), 'utf8')) as { children: Activity[] }

async function serveBook(page: Page) {
  await page.route(/^https:\/\/books\.example\.test\/p5\//, async route => {
    const name = decodeURIComponent(route.request().url().slice(BOOK_ORIGIN.length))
    try {
      await route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        contentType: name.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8',
        body: readFileSync(join(BOOK_DIR, name), 'utf8'),
      })
    } catch {
      await route.fulfill({ status: 404, body: 'Not Found' })
    }
  })
}

const openActivity = (page: Page, id: string) =>
  page.goto(`/?book=${encodeURIComponent(BOOK_ORIGIN + 'book.json')}&challenge=${id}`)

test('every page of the Python p5 book runs and draws its sketch', async ({ page }) => {
  test.setTimeout(300_000)
  const problems = watchForErrors(page)
  await serveBook(page)
  expect(book.children).toHaveLength(20)
  for (const activity of book.children) {
    await openActivity(page, activity.id)
    await expect(page.locator('.monaco-editor .view-lines').first()).toContainText('from p5 import')
    await runIt(page)
    await expect(sketch(page), activity.name).toBeVisible()
    await page.waitForTimeout(400)
    await windowEl(page).screenshot({ path: `test-results/p5-book/${activity.id}.png` })
    const stop = page.getByRole('button', { name: /stop/i })
    if (await stop.isVisible()) await stop.click()
    await expect(runButton(page)).toBeVisible()
    const text = await consoleText(page)
    expect(text, activity.name).not.toMatch(/Traceback|Exception in Tkinter callback|\[ERROR\]/)
  }
  expect(problems).toEqual([])
})

test('every task of the book: the solution passes Submit, the starter code fails with pictures', async ({ page }) => {
  test.setTimeout(400_000)
  const problems = watchForErrors(page)
  await serveBook(page)
  const tasks = book.children.filter(a => a.tests?.length)
  expect(tasks).toHaveLength(8)
  for (const task of tasks) {
    await openActivity(page, task.id)
    await expect(page.locator('.monaco-editor .view-lines').first()).toContainText('from p5 import')
    // The guide shows the picture to aim for.
    await expect(page.locator('img.p5-preview'), task.name).toBeVisible()

    // The starter code, as the student first sees it, draws too little.
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByText(/^0\/\d+ passed$/), task.name).toBeVisible({ timeout: 120_000 })
    // What failed is shown as pictures: the expected drawing, the student's, and the differences.
    await page.getByRole('button', { name: 'Show test cases' }).click()
    await expect(page.getByRole('img', { name: 'Expected drawing' }).first(), task.name).toBeVisible()
    await expect(page.getByRole('img', { name: 'Your drawing' }).first(), task.name).toBeVisible()
    await expect(page.getByRole('img', { name: 'Differences drawing' }).first(), task.name).toBeVisible()

    // The solution, written into the activity's own file, passes.
    const solution = readFileSync(join(BOOK_DIR, task.tests![0].out[0].filename), 'utf8')
    await setProgramViaApi(page, solution)
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByText('All passed'), task.name).toBeVisible({ timeout: 120_000 })
  }
  expect(problems).toEqual([])
})
