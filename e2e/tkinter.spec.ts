import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { consoleCopy, setProgramViaApi, watchForErrors } from './helpers'

/**
 * tkinter programs, against Coder's browser tkinter (src/python/tkinter and
 * utils/tkinterRenderer.ts): a window appears in the Display pane, its widgets
 * answer clicks and typing, message boxes wait for an answer, and the run ends
 * when the window is closed or Stop is pressed.
 *
 * Every scenario runs twice: in the trace worker, which is where a tkinter
 * program runs (so it can be debugged; it draws through
 * utils/tkWorkerBridge.ts), and on the main thread (`?tk=main`), which is
 * where it runs on a tab with no worker. The program is set through Monaco's
 * API: tkinter programs are mostly indented callbacks, and inserted text has
 * every line after a colon re-indented.
 */

const windowEl = (page: Page) => page.locator('.tkx-window').first()
const runButton = (page: Page) => page.getByRole('button', { name: /^(Run|Debug)$/ })
const consoleText = (page: Page) => consoleCopy(page).catch(() => '')

/** Start the program with Run (Ctrl+F5), which gives the window the whole output area. */
async function runIt(page: Page) {
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  await page.keyboard.press('Control+F5')
}

async function runProgram(page: Page, source: string) {
  await setProgramViaApi(page, source)
  await runIt(page)
  await expect(windowEl(page)).toBeVisible()
}

interface Runtime {
  name: string
  url: string
  /** What the console says when a Run ends by itself. */
  finished: string
  /** How a Run that was stopped shows it. */
  expectStopped: (page: Page) => Promise<void>
}

const RUNTIMES: Runtime[] = [
  {
    name: 'in the trace worker',
    url: '/',
    finished: '[RUN FINISHED]',
    expectStopped: async page => {
      await expect(page.getByText('Worker runtime stopped.')).toBeVisible()
      await expect(windowEl(page)).toContainText('not running')
    },
  },
  {
    name: 'on the main thread',
    url: '/?tk=main',
    finished: '[MAIN-THREAD RUN FINISHED]',
    expectStopped: async page => {
      await expect(runButton(page)).toBeVisible()
      await expect.poll(() => consoleText(page)).toContain('[MAIN-THREAD RUN STOPPED]')
    },
  },
]

for (const runtime of RUNTIMES) {
  test.describe(runtime.name, () => {
    test('a form: typing, a button, a message box and closing the window', async ({ page }) => {
      const problems = watchForErrors(page)
      await page.goto(runtime.url)
      await runProgram(page, [
        'import tkinter as tk',
        'from tkinter import messagebox',
        '',
        'root = tk.Tk()',
        'root.title("Greeter")',
        'name = tk.StringVar()',
        'tk.Label(root, text="Name:").grid(row=0, column=0, padx=5, pady=5)',
        'entry = tk.Entry(root, textvariable=name)',
        'entry.grid(row=0, column=1, padx=5)',
        'out = tk.Label(root, text="")',
        'out.grid(row=1, column=0, columnspan=2)',
        '',
        'def greet():',
        '    out.config(text="Hello, " + name.get() + "!")',
        '    if messagebox.askyesno("Again?", "Clear the name?"):',
        '        entry.delete(0, tk.END)',
        '        print("cleared")',
        '',
        'tk.Button(root, text="Greet", command=greet).grid(row=2, column=0, columnspan=2, pady=5)',
        'root.mainloop()',
        'print("window closed")',
      ].join('\n'))

      await expect(windowEl(page).locator('.tkx-titletext')).toHaveText('Greeter')
      await windowEl(page).locator('input.tkx-entry').fill('Ada')
      await windowEl(page).getByRole('button', { name: 'Greet' }).click()
      await expect(windowEl(page)).toContainText('Hello, Ada!')

      const dialog = page.locator('.tkx-dialog')
      await expect(dialog).toContainText('Clear the name?')
      await dialog.getByRole('button', { name: 'Yes' }).click()
      await expect(windowEl(page).locator('input.tkx-entry')).toHaveValue('')
      await expect.poll(() => consoleText(page)).toContain('cleared')

      await windowEl(page).locator('.tkx-close').click()
      await expect.poll(() => consoleText(page)).toContain(runtime.finished)
      await expect(runButton(page)).toBeVisible()
      // Closing the window ended mainloop(), and the program carried on after it.
      expect(await consoleText(page)).toContain('window closed')
      expect(problems).toEqual([])
    })

    test('a canvas animated with after() and steered with the arrow keys', async ({ page }) => {
      const problems = watchForErrors(page)
      await page.goto(runtime.url)
      await runProgram(page, [
        'import tkinter as tk',
        'root = tk.Tk()',
        'c = tk.Canvas(root, width=300, height=200, bg="white", highlightthickness=0)',
        'c.pack()',
        'player = c.create_rectangle(140, 90, 160, 110, fill="red", tags="player")',
        'ticks = c.create_text(10, 10, anchor="nw", text="0")',
        'count = 0',
        '',
        'def tick():',
        '    global count',
        '    count += 1',
        '    c.itemconfig(ticks, text=str(count))',
        '    if count < 5:',
        '        root.after(50, tick)',
        '',
        'def left(event):',
        '    c.move(player, -10, 0)',
        '    print("x is now", c.coords(player)[0])',
        '',
        'root.bind("<Left>", left)',
        'root.after(50, tick)',
        'root.mainloop()',
      ].join('\n'))

      const canvas = windowEl(page).locator('.tkx-canvas')
      await expect(canvas.locator('text')).toHaveText('5')
      await canvas.click({ position: { x: 20, y: 150 } })
      await page.keyboard.press('ArrowLeft')
      await expect.poll(() => consoleText(page)).toContain('x is now 130.0')
      await expect(canvas.locator('rect').last()).toHaveAttribute('x', '130')

      await page.getByRole('button', { name: /stop/i }).click()
      await runtime.expectStopped(page)
      expect(problems).toEqual([])
    })

    test('ttk widgets: a combobox, a treeview and notebook tabs', async ({ page }) => {
      const problems = watchForErrors(page)
      await page.goto(runtime.url)
      await runProgram(page, [
        'import tkinter as tk',
        'from tkinter import ttk',
        'root = tk.Tk()',
        'nb = ttk.Notebook(root)',
        'nb.pack(fill="both", expand=True)',
        'one = ttk.Frame(nb, padding=10)',
        'two = ttk.Frame(nb, padding=10)',
        'nb.add(one, text="Pick")',
        'nb.add(two, text="Table")',
        'combo = ttk.Combobox(one, values=["Red", "Green", "Blue"], state="readonly")',
        'combo.pack()',
        'combo.bind("<<ComboboxSelected>>", lambda e: print("picked", combo.get()))',
        'tree = ttk.Treeview(two, columns=("name", "score"), show="headings", height=3)',
        'tree.heading("name", text="Name")',
        'tree.heading("score", text="Score")',
        'for row in [("Ada", 12), ("Alan", 9)]:',
        '    tree.insert("", "end", values=row)',
        'tree.pack()',
        'def chosen(event):',
        '    item = tree.focus()',
        '    print("row", tree.item(item)["values"])',
        'tree.bind("<<TreeviewSelect>>", chosen)',
        'nb.bind("<<NotebookTabChanged>>", lambda e: print("tab", nb.index("current")))',
        'root.mainloop()',
      ].join('\n'))

      await windowEl(page).locator('.tkx-combo button').click()
      await page.locator('.tkx-dropdown div', { hasText: 'Green' }).click()
      await expect.poll(() => consoleText(page)).toContain('picked Green')

      await windowEl(page).locator('.tkx-tab', { hasText: 'Table' }).click()
      await expect.poll(() => consoleText(page)).toContain('tab 1')
      await windowEl(page).locator('.tkx-tree td', { hasText: 'Alan' }).click()
      await expect.poll(() => consoleText(page)).toContain("row ['Alan', 9]")

      await windowEl(page).locator('.tkx-close').click()
      await expect.poll(() => consoleText(page)).toContain(runtime.finished)
      expect(problems).toEqual([])
    })

    test('a game loop of update() and time.sleep() keeps the page alive until Stop', async ({ page }) => {
      const problems = watchForErrors(page)
      await page.goto(runtime.url)
      await runProgram(page, [
        'import tkinter as tk',
        'import time',
        'root = tk.Tk()',
        'c = tk.Canvas(root, width=200, height=60, bg="black")',
        'c.pack()',
        'ball = c.create_oval(0, 20, 20, 40, fill="yellow")',
        'frames = tk.Label(root, text="0")',
        'frames.pack()',
        'n = 0',
        'while True:',
        '    n += 1',
        '    c.move(ball, 2, 0)',
        '    if c.coords(ball)[0] > 180:',
        '        c.coords(ball, 0, 20, 20, 40)',
        '    frames.config(text=str(n))',
        '    root.update()',
        '    time.sleep(0.02)',
      ].join('\n'))

      // The page keeps painting while the loop runs: the frame count climbs.
      const counter = windowEl(page).locator('.tkx-label')
      await expect.poll(async () => Number(await counter.textContent())).toBeGreaterThan(10)
      await page.getByRole('button', { name: /stop/i }).click()
      await runtime.expectStopped(page)
      expect(problems).toEqual([])
    })

    test('pages stacked in one grid cell and switched with tkraise()', async ({ page }) => {
      const problems = watchForErrors(page)
      await page.goto(runtime.url)
      await runProgram(page, [
        'import tkinter as tk',
        'root = tk.Tk()',
        'pages = {}',
        'for name in ("Menu", "Scores"):',
        '    f = tk.Frame(root, width=200, height=80)',
        '    f.grid(row=0, column=0, sticky="nsew")',
        '    tk.Label(f, text=name + " page").pack()',
        '    pages[name] = f',
        'tk.Button(pages["Menu"], text="Show scores", command=pages["Scores"].tkraise).pack()',
        'pages["Menu"].tkraise()',
        'root.mainloop()',
      ].join('\n'))

      const visibleLabel = async () => page.evaluate(() => {
        const labels = [...document.querySelectorAll('.tkx-label')] as HTMLElement[]
        const box = (el: HTMLElement) => el.getBoundingClientRect()
        const b = box(labels[0])
        return (document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) as HTMLElement | null)?.textContent
      })
      await expect.poll(visibleLabel).toBe('Menu page')
      await windowEl(page).getByRole('button', { name: 'Show scores' }).click()
      await expect.poll(visibleLabel).toBe('Scores page')
      expect(problems).toEqual([])
    })

    test('a login window closed before the main window opens, then another run', async ({ page }) => {
      const problems = watchForErrors(page)
      await page.goto(runtime.url)
      await runProgram(page, [
        'import tkinter as tk',
        'login = tk.Tk()',
        'login.title("Login")',
        'tk.Button(login, text="Log in", command=login.destroy).pack()',
        'login.mainloop()',
        'main = tk.Tk()',
        'main.title("Main")',
        'tk.Label(main, text="Welcome").pack()',
        'main.mainloop()',
      ].join('\n'))

      await expect(windowEl(page).locator('.tkx-titletext')).toHaveText('Login')
      await windowEl(page).getByRole('button', { name: 'Log in' }).click()
      await expect(windowEl(page).locator('.tkx-titletext')).toHaveText('Main')
      await expect(page.locator('.tkx-window')).toHaveCount(1)
      await windowEl(page).locator('.tkx-close').click()
      await expect(runButton(page)).toBeVisible()
      await expect.poll(() => consoleText(page)).toContain(runtime.finished)

      // A second run reuses the cached Pyodide: it gets a fresh tkinter, with no
      // windows or timers from the last run, and its own page-friendly time.sleep.
      await setProgramViaApi(page, [
        'import time, tkinter as tk',
        'print("windows left over:", len(tk._app.roots), "| sleep:", time.sleep.__name__)',
        'root = tk.Tk()',
        'root.after(100, root.destroy)',
        'root.mainloop()',
      ].join('\n'))
      await runIt(page)
      await expect.poll(() => consoleText(page)).toContain(runtime.finished)
      await expect(page.locator('.tkx-window')).toHaveCount(0)
      expect(await consoleText(page)).toContain('windows left over: 0 | sleep: _coder_patched_sleep')
      expect(problems).toEqual([])
    })
  })
}

test('a GUI kept in an imported module runs in the worker, and can be debugged', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  // Write gui.py by running a program that creates it, then run one that imports it.
  await setProgramViaApi(page, [
    'with open("gui.py", "w") as f:',
    '    f.write("import tkinter as tk\\n")',
    '    f.write("def show(message):\\n")',
    '    f.write("    root = tk.Tk()\\n")',
    '    f.write("    tk.Label(root, text=message).pack()\\n")',
    '    f.write("    root.after(200, root.destroy)\\n")',
    '    f.write("    root.mainloop()\\n")',
    'print("written")',
  ].join('\n'))
  await runIt(page)
  await expect.poll(() => consoleText(page)).toContain('written')
  await expect(runButton(page)).toBeVisible()

  await setProgramViaApi(page, 'import gui\ngui.show("from a module")\nprint("done")')
  // Debug (F5): a tkinter program is no longer sent to the main thread.
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  await page.keyboard.press('F5')
  await expect.poll(() => consoleText(page)).toContain('[DEBUG FINISHED]')
  const text = await consoleText(page)
  expect(text).not.toContain('runs on the main thread')
  // It carried on after the window closed itself.
  expect(text).toContain('done')
  expect(problems).toEqual([])
})

test('Debug steps a tkinter callback when the button is pressed', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await setProgramViaApi(page, [
    'import tkinter as tk',
    'root = tk.Tk()',
    'def pressed():',
    '    print("pressed")',
    'tk.Button(root, text="Press", command=pressed).pack()',
    'root.mainloop()',
  ].join('\n'))
  // A breakpoint on line 4, inside the callback: the glyph margin, left of its number.
  const lineFour = (await page.locator('.monaco-editor .line-numbers', { hasText: /^4$/ }).boundingBox())!
  await page.mouse.click(lineFour.x - 8, lineFour.y + lineFour.height / 2)
  await expect(page.locator('.monaco-editor .monaco-breakpoint-glyph')).not.toHaveCount(0)
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  await page.keyboard.press('F5')
  await expect(windowEl(page)).toBeVisible()
  await windowEl(page).getByRole('button', { name: 'Press' }).click()
  // Paused in the callback, before its print.
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
  expect(await consoleText(page)).not.toContain('pressed')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect.poll(() => consoleText(page)).toContain('pressed')
  await page.getByRole('button', { name: /stop/i }).click()
  await expect(page.getByText('Worker runtime stopped.')).toBeVisible()
  expect(problems).toEqual([])
})

test('without JSPI on the main thread: mainloop() returns at once, yet the window still works', async ({ page }) => {
  // As on a browser that predates JSPI (an older iPad) with no worker: Python
  // cannot pause, so the bootstrap keeps the window alive from an async loop
  // once the program's last line has run, and message boxes are the browser's own.
  await page.addInitScript(() => {
    try { delete (WebAssembly as unknown as Record<string, unknown>).Suspending } catch { /* ignore */ }
  })
  const problems = watchForErrors(page)
  const popups: string[] = []
  page.on('dialog', dialog => {
    popups.push(dialog.message())
    void dialog.accept()
  })
  await page.goto('/?tk=main')
  await runProgram(page, [
    'import tkinter as tk',
    'from tkinter import messagebox',
    'root = tk.Tk()',
    'def ask():',
    '    print("answer:", messagebox.askyesno("Check", "Carry on?"))',
    'tk.Button(root, text="Ask", command=ask).pack()',
    'root.mainloop()',
    'print("after mainloop")',
  ].join('\n'))

  await expect.poll(() => consoleText(page)).toContain('after mainloop')
  await expect(page.getByText(/cannot pause Python/)).toBeVisible()
  await windowEl(page).getByRole('button', { name: 'Ask' }).click()
  await expect.poll(() => consoleText(page)).toContain('answer: True')
  expect(popups).toEqual(['Check\n\nCarry on?'])

  await windowEl(page).locator('.tkx-close').click()
  await expect.poll(() => consoleText(page)).toContain('[MAIN-THREAD RUN FINISHED]')
  expect(problems).toEqual([])
})

// The shipped Tkinter book, served from the repository by the test itself: every
// page opens, runs, draws its window, and leaves no error behind — in the
// worker on shared memory, in the worker on the service worker, and on the
// main thread.
const BOOK_ORIGIN = 'https://books.example.test/tkinter/'
const BOOK_DIR = join(process.cwd(), 'Tkinter')

const BOOK_RUNS = [
  { name: 'in the worker', query: '' },
  { name: 'in the worker, waiting on the service worker', query: '&transport=xhr' },
  { name: 'on the main thread', query: '&tk=main' },
]

for (const bookRun of BOOK_RUNS) {
  test(`every page of the Tkinter book runs and draws its window, ${bookRun.name}`, async ({ page }) => {
    test.setTimeout(300_000)
    const problems = watchForErrors(page)
    await page.route(/^https:\/\/books\.example\.test\/tkinter\//, async route => {
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
    const book = JSON.parse(readFileSync(join(BOOK_DIR, 'book.json'), 'utf8')) as { children: { id: string; name: string }[] }
    expect(book.children).toHaveLength(12)

    for (const activity of book.children) {
      await page.goto(`/?book=${encodeURIComponent(BOOK_ORIGIN + 'book.json')}&challenge=${activity.id}${bookRun.query}`)
      await expect(page.locator('.monaco-editor .view-lines').first()).toContainText('import tkinter')
      await runIt(page)
      await expect(windowEl(page), activity.name).toBeVisible()
      await page.waitForTimeout(300)
      await windowEl(page).screenshot({ path: `test-results/tkinter-book/${activity.id}.png` })
      await page.getByRole('button', { name: /stop/i }).click()
      await expect(runButton(page)).toBeVisible()
      const text = await consoleText(page)
      expect(text, activity.name).not.toMatch(/Traceback|Exception in Tkinter callback|\[ERROR\]/)
    }
    expect(problems).toEqual([])
  })
}
