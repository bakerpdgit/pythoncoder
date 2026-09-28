import { test, expect, type Page } from '@playwright/test'
import { consolePanel, setProgram, watchForErrors } from './helpers'

/**
 * The Display pane from one run to the next: every run starts from an empty
 * one, the console gives the drawing its room until the program has something
 * to say, and in the tab group input() borrows the Console tab only until the
 * program draws again.
 */

const runButton = (page: Page) => page.getByRole('button', { name: /^(Run|Debug|Trace)$/ })
const displayPane = (page: Page) => page.getByTitle('Display zoom')
const expandConsole = (page: Page) => page.getByRole('button', { name: 'Expand console' })
const collapseConsole = (page: Page) => page.getByRole('button', { name: 'Collapse console' })

/**
 * Everything the console holds. A console folded for a drawing, or squeezed
 * beside one, draws few or none of its rows, so they cannot be read back; its
 * own Copy button hands over the whole buffer.
 */
async function consoleTranscript(page: Page): Promise<string> {
  await page.evaluate(() => {
    const w = window as unknown as { __copiedConsole?: string }
    delete w.__copiedConsole
    navigator.clipboard.writeText = async (text: string) => { w.__copiedConsole = text }
  })
  await page.getByRole('button', { name: 'Copy console output' }).click()
  const copied = await page.waitForFunction(() => (window as unknown as { __copiedConsole?: string }).__copiedConsole)
  // A console folded to nothing wraps at whatever width it last had.
  return String(await copied.jsonValue()).replace(/\n/g, '')
}

/** Wait for the run to end: the split button is back in place of Stop. */
async function runEnded(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0, { timeout: 60_000 })
  await expect(runButton(page)).toBeEnabled()
}

/** Answer input() in the console, as a student would type it. */
async function answer(page: Page, text: string): Promise<void> {
  await expect(page.locator('#console-panel-console .xterm-helper-textarea')).toBeFocused()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

test('a run that draws nothing leaves no Display from the run before it', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  // A finished tkinter window is kept on screen, inert — until the next run.
  await setProgram(page, [
    'import tkinter as tk',
    'root = tk.Tk()',
    'tk.Label(root, text="left over").pack()',
    'root.update()',
  ].join('\n'))
  await page.keyboard.press('Control+F5')
  await expect(page.locator('.tkx-window').first()).toBeVisible()
  // An open window keeps the program alive, as in IDLE, until Stop.
  await page.getByRole('button', { name: 'Stop' }).click()
  await runEnded(page)
  await expect(page.locator('.tkx-window').first()).toBeVisible()

  await setProgram(page, 'print("hello")')
  await page.keyboard.press('Control+F5')
  await expect(consolePanel(page)).toContainText('[RUN FINISHED]')
  await expect(consolePanel(page)).toContainText('hello')
  await expect(page.locator('.tkx-window')).toBeHidden()
  await expect(displayPane(page)).toBeHidden()
  expect(problems).toEqual([])
})

test('the console folds for a drawing and opens when the program prints', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await setProgram(page, [
    'import time',
    'from sys import stdctx',
    'stdctx.fillRect(10, 10, 50, 50)',
    'time.sleep(2)',
    'print("after the drawing")',
  ].join('\n'))
  await page.keyboard.press('Control+F5')

  await expect(displayPane(page)).toBeVisible()
  await expect(expandConsole(page)).toBeVisible()
  await expect(collapseConsole(page)).toBeVisible({ timeout: 30_000 })
  await runEnded(page)
  expect(await consoleTranscript(page)).toContain('after the drawing')
  expect(problems).toEqual([])
})

test('a program that only draws ends with the console still folded', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await setProgram(page, [
    'from sys import stdctx',
    'stdctx.fillRect(10, 10, 50, 50)',
  ].join('\n'))
  await page.keyboard.press('Control+F5')
  await expect(expandConsole(page)).toBeVisible()
  // [RUN FINISHED] is the app talking, not the program: it opens nothing.
  await runEnded(page)
  await expect(expandConsole(page)).toBeVisible()
  expect(await consoleTranscript(page)).toContain('[RUN FINISHED]')
  await expandConsole(page).click()
  await expect(collapseConsole(page)).toBeVisible()
  expect(problems).toEqual([])
})

test('in the tab group, input() borrows the Console tab until the next drawing', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Panels' }).click()
  await page.getByRole('button', { name: /Tab group/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Tab Group' })
  await dialog.getByLabel('Console').check()
  await dialog.getByLabel('Display').check()
  await dialog.getByRole('button', { name: 'Done' }).click()

  await setProgram(page, [
    'import time',
    'from sys import stdctx',
    'stdctx.fillRect(10, 10, 50, 50)',
    'size = input("Size? ")',
    'print("You chose " + size)',
    'time.sleep(1.5)',
    'stdctx.fillRect(100, 100, int(size), int(size))',
  ].join('\n'))
  await page.keyboard.press('Control+F5')

  const tabs = page.getByRole('tablist', { name: 'Tabbed panels' })
  const consoleTab = tabs.getByRole('tab', { name: 'Console' })
  const displayTab = tabs.getByRole('tab', { name: 'Display' })
  await expect(consoleTab).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 })
  await answer(page, '30')
  // What the program printed in reply stays in front of the student...
  await page.waitForTimeout(500)
  await expect(consoleTab).toHaveAttribute('aria-selected', 'true')
  // ...until it draws again.
  await expect(displayTab).toHaveAttribute('aria-selected', 'true', { timeout: 10_000 })
  await runEnded(page)
  await consoleTab.click()
  expect(await consoleTranscript(page)).toContain('You chose 30')
  expect(problems).toEqual([])
})
