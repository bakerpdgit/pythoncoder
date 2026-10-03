import { test, expect, type Page } from '@playwright/test'
import { consolePanel, setProgram, setProgramViaApi, watchForErrors } from './helpers'

/**
 * The keyboard and layout conveniences students asked for: the function-key
 * shortcuts, the full-screen editor, staying on the run view, a new file
 * opening in the editor, and the central column's tab group.
 */

const editor = (page: Page) => page.locator('.monaco-editor').first()

/** Focus the editor, as a student about to press a shortcut would have it. */
async function focusEditor(page: Page): Promise<void> {
  await expect(editor(page)).toBeVisible()
  await editor(page).click()
}

/** The split button's main half: its name is the current Debug / Run / Trace choice. */
const runButton = (page: Page) => page.getByRole('button', { name: /^(Run|Debug|Trace)$/ })

test('Ctrl+Shift+> and Ctrl+Shift+< size the editor font, as in Python Sponge', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await focusEditor(page)
  const size = page.getByTitle('Editor font size')
  const before = Number(await size.inputValue())

  await page.keyboard.press('Control+Shift+Period')
  await expect(size).toHaveValue(String(before + 1))
  await page.keyboard.press('Control+Shift+Comma')
  await page.keyboard.press('Control+Shift+Comma')
  await expect(size).toHaveValue(String(before - 1))
  expect(problems).toEqual([])
})

test('F5, Ctrl+F5 and Ctrl+Shift+F5 start Debug, Run and Trace, and become the menu choice', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await setProgram(page, 'print("from the keyboard")')

  await page.keyboard.press('Control+F5')
  await expect(consolePanel(page)).toContainText('[RUN FINISHED]')
  await expect(consolePanel(page)).toContainText('from the keyboard')
  await expect(runButton(page)).toHaveText('Run')

  // Trace pauses on the first line: the step keys work, and Shift+F5 stops.
  await focusEditor(page)
  await page.keyboard.press('Control+Shift+F5')
  await expect(page.getByRole('button', { name: 'Into' })).toBeVisible()
  await page.keyboard.press('Shift+F5')
  await expect(runButton(page)).toHaveText('Trace')

  await focusEditor(page)
  await page.keyboard.press('F5')
  await expect(consolePanel(page)).toContainText('[DEBUG FINISHED]')
  await expect(runButton(page)).toHaveText('Debug')
  // The page was never reloaded by any of those F5s: the program is still there.
  await expect(editor(page)).toContainText('from the keyboard')
  expect(problems).toEqual([])
})

test('F11 shows the editor on its own, and puts the layout back with the console intact', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await setProgram(page, 'print("still here")')
  await page.keyboard.press('Control+F5')
  await expect(consolePanel(page)).toContainText('still here')

  await focusEditor(page)
  await page.keyboard.press('F11')
  await expect(consolePanel(page)).toBeHidden()
  await expect(page.getByTitle('Expand sidebar')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Exit full-screen editor' })).toBeVisible()

  await page.keyboard.press('F11')
  await expect(consolePanel(page)).toBeVisible()
  // Hidden, never unmounted: the transcript survived.
  await expect(consolePanel(page)).toContainText('still here')
  expect(problems).toEqual([])
})

test('Stay on run view keeps a finished run on screen until a layout is chosen', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await setProgram(page, 'print("look at me")')

  await page.getByRole('button', { name: /^Choose run mode/ }).click()
  await page.getByLabel('Stay on run view when the program ends').check()
  // A setting, not a way to start: the menu is still open.
  await expect(page.getByLabel('Stay on run view when the program ends')).toBeChecked()
  await page.keyboard.press('Control+F5')

  const bar = page.getByRole('region', { name: 'Return to editor view' })
  await expect(bar).toBeVisible()
  await expect(consolePanel(page)).toContainText('look at me')
  await expect(editor(page)).toBeHidden()

  await bar.getByRole('button', { name: 'Previous' }).click()
  await expect(bar).toBeHidden()
  await expect(editor(page)).toBeVisible()
  expect(problems).toEqual([])
})

/** The panels a reload will come back to. */
const savedPanels = (page: Page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem('pythoncoder-layout-prefs') ?? '{}').visiblePanels as Record<string, boolean> | undefined)

test('a reload in the middle of a Run comes back to the editor, not the run view', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await setProgramViaApi(page, [
    'import time',
    'i = 0',
    'while True:',
    '    print("tick", i)',
    '    i += 1',
    '    time.sleep(0.2)',
  ].join('\n'))
  await page.keyboard.press('Control+F5')
  await expect(consolePanel(page)).toContainText('tick')
  // The run has the screen...
  await expect(editor(page)).toBeHidden()
  // ...but what is saved is the layout the run will give back.
  expect(await savedPanels(page)).toMatchObject({ code: true, output: true })

  await page.reload()
  await expect(editor(page)).toBeVisible()
  await expect(editor(page)).toContainText('while True:')
  expect(problems).toEqual([])
})

test('a reload on a held run view comes back to the editor too', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await setProgram(page, 'print("held")')
  await page.getByRole('button', { name: /^Choose run mode/ }).click()
  await page.getByLabel('Stay on run view when the program ends').check()
  await page.keyboard.press('Control+F5')
  await expect(page.getByRole('region', { name: 'Return to editor view' })).toBeVisible()
  await expect(editor(page)).toBeHidden()
  expect(await savedPanels(page)).toMatchObject({ code: true, output: true })

  await page.reload()
  await expect(editor(page)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Return to editor view' })).toHaveCount(0)
  expect(problems).toEqual([])
})

test('a new file opens in the editor, after the unsaved one is settled', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await setProgram(page, 'print("unsaved work")')
  await page.getByTitle('Expand sidebar').click()

  // The menu opens on hover (a click would toggle it straight back shut).
  await page.getByTitle('New file or folder').hover()
  await page.getByRole('button', { name: 'New file', exact: true }).click()
  const ask = page.getByRole('dialog', { name: 'New file' }).filter({ hasText: 'before creating a new file' })
  await expect(ask).toBeVisible()
  await ask.getByRole('button', { name: 'Save', exact: true }).click()

  const naming = page.getByRole('dialog', { name: 'New file' })
  await naming.getByPlaceholder('filename.py').fill('second.py')
  await naming.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(page.getByText('Code Editor (second.py)')).toBeVisible()
  await expect(editor(page)).not.toContainText('unsaved work')
  // The work was saved, not lost: main.py still holds it.
  await page.getByText('main.py', { exact: true }).click()
  await expect(editor(page)).toContainText('unsaved work')
  expect(problems).toEqual([])
})

test('the tab group puts panels behind tabs without losing what they hold', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await setProgram(page, 'print("behind a tab")')
  await page.keyboard.press('Control+F5')
  await expect(consolePanel(page)).toContainText('behind a tab')

  await page.getByRole('button', { name: 'Panels' }).click()
  await page.getByRole('button', { name: /Tab group/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Tab Group' })
  await dialog.getByLabel('Code').check()
  await dialog.getByLabel('Console').check()
  await dialog.getByRole('button', { name: 'Done' }).click()

  // The run just watched was in the console, so that is the tab on show.
  const tabs = page.getByRole('tablist', { name: 'Tabbed panels' })
  await expect(tabs.getByRole('tab', { name: 'Console' })).toHaveAttribute('aria-selected', 'true')
  await expect(editor(page)).toBeHidden()
  await expect(consolePanel(page)).toContainText('behind a tab')

  await tabs.getByRole('tab', { name: 'Code' }).click()
  await expect(editor(page)).toBeVisible()
  await expect(consolePanel(page)).toBeHidden()
  await expect(editor(page)).toContainText('behind a tab')

  // Hidden, never unmounted: the console's transcript is still there.
  await tabs.getByRole('tab', { name: 'Console' }).click()
  await expect(consolePanel(page)).toContainText('behind a tab')

  // Choosing a view is a fresh start: the group is broken up.
  await page.getByRole('button', { name: 'Panels' }).click()
  await page.getByRole('button', { name: 'Minimal' }).click()
  await expect(page.getByRole('tablist', { name: 'Tabbed panels' })).toHaveCount(0)
  await expect(consolePanel(page)).toBeVisible()
  expect(problems).toEqual([])
})

test('the Display tab arrives with the first drawing and is brought forward by it', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Panels' }).click()
  await page.getByRole('button', { name: /Tab group/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Tab Group' })
  await dialog.getByLabel('Console').check()
  await dialog.getByLabel('Display').check()
  await dialog.getByRole('button', { name: 'Done' }).click()

  // Nothing to display yet, so there is no group to show.
  await expect(page.getByRole('tablist', { name: 'Tabbed panels' })).toHaveCount(0)

  await setProgram(page, [
    'from sys import stdctx',
    'stdctx.fillStyle = "red"',
    'stdctx.fillRect(10, 10, 50, 50)',
    'print("drawn")',
  ].join('\n'))
  await page.keyboard.press('Control+F5')

  const tabs = page.getByRole('tablist', { name: 'Tabbed panels' })
  await expect(tabs.getByRole('tab', { name: 'Display' })).toHaveAttribute('aria-selected', 'true')
  await tabs.getByRole('tab', { name: 'Console' }).click()
  await expect(consolePanel(page)).toContainText('drawn')
  expect(problems).toEqual([])
})
