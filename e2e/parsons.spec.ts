import { test, expect, type Page } from '@playwright/test'
import { consoleCopy, editorModelState, watchForErrors } from './helpers'

/**
 * Parsons puzzles: one view of the program, its movable lines arranged in
 * place, distractors hidden, indentation given or the student's — and the
 * teacher's side, marking lines Fixed / Movable / Distractor and previewing.
 *
 * The book is served by the test through `page.route`, as in book.spec.ts.
 */

const BOOK_ORIGIN = 'https://books.example.test/parsons/'
const BOOK_ROUTE = /^https:\/\/books\.example\.test\/parsons\//
const BOOK_URL = `${BOOK_ORIGIN}book.json`

const FILES: Record<string, string> = {
  'book.json': JSON.stringify({
    name: 'Parsons e2e',
    id: 'parsons-e2e',
    children: [
      { id: 'blocks', name: 'Two blocks', guide: 'guide.md', py: 'blocks.py', typ: 'parsons', parsons: { indent: 'given' } },
      { id: 'indent', name: 'Indent it', guide: 'guide.md', py: 'indent.py', typ: 'parsons' },
    ],
  }),
  'guide.md': '# Puzzle\n\nPut the lines in order.\n',
  // p0 p1 | p2 p3 p4, and p5 the distractor.
  'blocks.py': [
    'def area(w, h):',
    '    # start',
    '    a = w * h',
    '    return a',
    '    # end',
    '',
    'def main():',
    '    # start',
    '    w = 3',
    '    h = 4',
    '    print("Area:", area(w, h))',
    '    print("Area:", w + h) #distractor',
    '    # end',
    '',
    'main()',
    '',
  ].join('\n'),
  // p0 p1 p2; the student indents p1.
  'indent.py': [
    'total = 0',
    '# start',
    'for n in range(3):',
    '    total = total + n',
    'print(total)',
    '# end',
    '',
  ].join('\n'),
}

async function serveBook(page: Page) {
  await page.route(BOOK_ROUTE, async route => {
    const body = FILES[route.request().url().slice(BOOK_ORIGIN.length)]
    if (body === undefined) { await route.fulfill({ status: 404, body: 'Not Found' }); return }
    await route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body,
    })
  })
}

const EXPECTED_MISSES = [/books\.example\.test/, /\/api\/proxy/]

async function openPuzzle(page: Page, id: string) {
  await page.goto(`/?book=${encodeURIComponent(BOOK_URL)}&challenge=${id}`)
  await expect(page.locator('.parsons-view [data-frag-id]').first()).toBeVisible({ timeout: 30_000 })
}

const row = (page: Page, id: string) => page.locator(`.parsons-view [data-frag-id="${id}"]`)

/** The fragment ids of one block, in the order shown. */
const blockOrder = (page: Page, blockId: string) =>
  page.locator(`.parsons-view [data-block-id="${blockId}"] [data-frag-id]`)
    .evaluateAll(els => els.map(e => (e as HTMLElement).dataset.fragId!))

/** Put a block into `target` order with the keyboard alone (Alt+↑). */
async function arrange(page: Page, blockId: string, target: string[]) {
  for (let t = 0; t < target.length; t++) {
    const order = await blockOrder(page, blockId)
    const at = order.indexOf(target[t])
    if (at === t) continue
    await row(page, target[t]).focus()
    for (let i = at; i > t; i--) await page.keyboard.press('Alt+ArrowUp')
    await expect.poll(() => blockOrder(page, blockId).then(o => o.indexOf(target[t]))).toBe(t)
  }
}

/** What the code editor holds, once Monaco can be reached (a cold dev server takes a moment). */
const editorText = (page: Page) => editorModelState(page).then(s => s.value).catch(() => '')

const submit = (page: Page) => page.getByRole('button', { name: 'Submit', exact: true }).click()

test('a given-indentation puzzle with two blocks: arrange, hide, Submit, Run', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: EXPECTED_MISSES })
  await serveBook(page)
  await openPuzzle(page, 'blocks')

  // Fixed lines sit in place between the blocks, numbered as the program is.
  await expect(page.locator('.parsons-view')).toContainText('def area(w, h):')
  await expect(page.locator('.parsons-view [data-block-id]')).toHaveCount(2)

  await arrange(page, 'b0', ['p0', 'p1'])
  await arrange(page, 'b1', ['p2', 'p3', 'p4', 'p5'])
  // A line cannot leave its block.
  await row(page, 'p2').focus()
  await page.keyboard.press('Alt+ArrowUp')
  expect(await blockOrder(page, 'b1')).toEqual(['p2', 'p3', 'p4', 'p5'])

  // Kept, the distractor fails the puzzle and is flagged.
  await submit(page)
  await expect(page.locator('.parsons-view')).toContainText('too many code fragments')

  // Hidden, a line leaves its block for the list below the program, unnumbered.
  await row(page, 'p5').focus()
  await page.keyboard.press('Delete')
  await expect(row(page, 'p5')).toHaveAttribute('aria-label', /^Hidden/)
  await expect(page.getByRole('list', { name: 'Hidden lines' }).locator('[data-frag-id="p5"]')).toHaveCount(1)
  expect(await blockOrder(page, 'b1')).toEqual(['p2', 'p3', 'p4'])
  // It cannot be moved until it is shown again, and then it comes back at the
  // end of its block.
  await row(page, 'p2').focus()
  await page.keyboard.press('Delete')
  await expect(row(page, 'p2').getByRole('button', { name: 'Indent more' })).toHaveCount(0)
  await page.keyboard.press('Alt+ArrowUp')
  expect(await blockOrder(page, 'b1')).toEqual(['p3', 'p4'])
  await row(page, 'p2').getByRole('button', { name: 'Show line' }).click()
  expect(await blockOrder(page, 'b1')).toEqual(['p3', 'p4', 'p2'])
  await arrange(page, 'b1', ['p2', 'p3', 'p4'])
  await submit(page)
  await expect(page.locator('.parsons-view')).toContainText('Correct — well done.')
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem('pythoncoder-book-completions')
    return raw ? Object.keys(JSON.parse(raw) as Record<string, unknown>).some(k => k.endsWith('::blocks')) : false
  })).toBe(true)

  // The program is the arrangement, the hidden line left out.
  await expect.poll(() => editorText(page)).toBe(
    'def area(w, h):\n    a = w * h\n    return a\n\ndef main():\n    w = 3\n    h = 4\n    print("Area:", area(w, h))\n\nmain()\n')
  await page.keyboard.press('Control+F5')
  await expect.poll(() => consoleCopy(page).catch(() => ''), { timeout: 60_000 }).toContain('Area: 12')

  // A reload brings the same arrangement back.
  await openPuzzle(page, 'blocks')
  expect(await blockOrder(page, 'b1')).toEqual(['p2', 'p3', 'p4'])
  await expect(row(page, 'p5')).toHaveAttribute('aria-label', /^Hidden/)

  // Shuffle starts again, never already solved.
  await page.getByRole('button', { name: 'Shuffle' }).click()
  await expect(page.locator('.parsons-view [aria-label^="Hidden"]')).toHaveCount(0)
  expect(problems).toEqual([])
})

test('student indentation: ←/→ indent a line, at most one level past the line above', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: EXPECTED_MISSES })
  await serveBook(page)
  await openPuzzle(page, 'indent')

  await arrange(page, 'b0', ['p0', 'p1', 'p2'])
  // Every line starts unindented; the first cannot be indented at all.
  await row(page, 'p0').focus()
  await page.keyboard.press('ArrowRight')
  await row(page, 'p1').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => editorText(page)).toBe('total = 0\nfor n in range(3):\n    total = total + n\nprint(total)\n')

  await submit(page)
  await expect(page.locator('.parsons-view')).toContainText('Correct — well done.')

  await page.keyboard.press('Control+F5')
  await expect.poll(() => consoleCopy(page).catch(() => ''), { timeout: 60_000 }).toContain('3')
  expect(problems).toEqual([])
})

test('a line is dragged by its handle, within its block', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: EXPECTED_MISSES })
  await serveBook(page)
  await openPuzzle(page, 'blocks')
  await arrange(page, 'b1', ['p2', 'p3', 'p4', 'p5'])

  const from = await row(page, 'p4').boundingBox()
  const to = await row(page, 'p2').boundingBox()
  if (!from || !to) throw new Error('rows not laid out')
  await page.mouse.move(from.x + 40, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + 40, to.y + 2, { steps: 8 })
  await page.mouse.up()
  expect(await blockOrder(page, 'b1')).toEqual(['p4', 'p2', 'p3', 'p5'])
  expect(problems).toEqual([])
})

test('the debugger’s line is highlighted in the puzzle while tracing', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: EXPECTED_MISSES })
  await serveBook(page)
  await openPuzzle(page, 'indent')
  await arrange(page, 'b0', ['p0', 'p1', 'p2'])
  await row(page, 'p1').focus()
  await page.keyboard.press('ArrowRight')

  await page.keyboard.press('Control+Shift+F5')
  // The trace pauses on line 1, a fixed line.
  await expect(page.locator('.parsons-view .parsons-active-line')).toContainText('total = 0', { timeout: 60_000 })
  await page.keyboard.press('F10')
  await expect(page.locator('.parsons-view .parsons-active-line')).toHaveAttribute('data-frag-id', 'p0')
  await page.keyboard.press('Shift+F5')
  expect(problems).toEqual([])
})

test('a two-panel arrangement saved before is kept, its bank hidden', async ({ page }) => {
  const problems = watchForErrors(page, { ignoreRequestsTo: EXPECTED_MISSES })
  await serveBook(page)
  await page.addInitScript(url => {
    if (localStorage.getItem('parsons-e2e-seeded')) return
    localStorage.setItem('parsons-e2e-seeded', '1')
    localStorage.setItem('pythoncoder-parsons-state', JSON.stringify({
      [`${url}::indent`]: { source: ['p2'], solution: [{ id: 'p1', indent: 0 }, { id: 'p0', indent: 0 }] },
    }))
  }, BOOK_URL)
  await openPuzzle(page, 'indent')
  expect(await blockOrder(page, 'b0')).toEqual(['p1', 'p0'])
  await expect(row(page, 'p2')).toHaveAttribute('aria-label', /^Hidden/)
  expect(problems).toEqual([])
})

/** Teacher Tools → New learning book, named `name` (as in share.spec.ts). */
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

test('a teacher adds a puzzle, marks a line Movable, and previews it as a student', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await newBook(page, 'Puzzle Book')

  await page.getByRole('button', { name: 'Add exercise' }).click()
  await page.getByRole('menuitem', { name: /Parsons puzzle/ }).click()
  await page.getByRole('button', { name: /^Puzzle 3/ }).click()

  const bar = page.getByRole('group', { name: 'Mark the selected lines' })
  await expect(bar).toBeVisible()
  await expect(page.getByText('3 lines to place · 1 distractor')).toBeVisible()
  await expect.poll(() => editorText(page)).toContain('total = 0\n# start\n')

  // Put the cursor on line 2 (`total = 0`, fixed) and make it Movable.
  await page.locator('.monaco-editor .view-lines').click()
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('ArrowDown')
  await bar.getByRole('button', { name: /^Movable/ }).click()
  await expect(page.getByText('4 lines to place · 1 distractor')).toBeVisible()
  await expect.poll(() => editorText(page)).toContain('# start\ntotal = 0\nfor n in range(1, 4):')

  await page.getByRole('button', { name: 'Preview as student' }).click()
  await expect(page.locator('.parsons-view [data-frag-id]')).toHaveCount(5)
  await page.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(page.locator('.parsons-view')).toContainText('Code fragments in your program are wrong')

  // Back to the answer, which the preview never touched.
  await page.getByRole('button', { name: 'Answer', exact: true }).click()
  await expect(page.locator('.parsons-view')).toHaveCount(0)
  await expect.poll(() => editorText(page)).toBe(
    '# Lines outside the block stay where they are.\n# start\ntotal = 0\nfor n in range(1, 4):\n    total = total + n\nprint(total)\nprint(n) #distractor\n# end\n')
  expect(problems).toEqual([])
})
