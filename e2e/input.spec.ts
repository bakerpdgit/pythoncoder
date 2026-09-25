import { test, expect, type Page } from '@playwright/test'
import { consolePanel, run, setProgram, watchForErrors } from './helpers'

/**
 * input() in every runtime: the student must be able to read what the program
 * has printed before they answer it, and the answer belongs in the console.
 *
 * On the main thread this used to be a blocking window.prompt that froze the
 * page, so nothing printed since the run began was on screen when the pop-up
 * asked its question, and the whole transcript arrived at once when the program
 * ended. That is what Safari/iPad students saw, because Safari could not run
 * the trace worker at all (scripts/isolationPolicy.mjs).
 */

const QUIZ = [
  'print("Welcome to the quiz")',
  'name = input("Name? ")',
  'print("Hello " + name)',
  'age = input("Age? ")',
  'print("Next year you will be", int(age) + 1)',
].join('\n')

async function answer(page: Page, text: string): Promise<void> {
  // The console focuses itself when input() asks; type exactly as a student would.
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

async function useMainThread(page: Page): Promise<void> {
  await page.getByTitle('Settings').click()
  await page.getByRole('button', { name: /^Execution:/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Main Thread/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

/**
 * Everything in the console, not just the rows on screen. xterm renders only
 * its visible rows, and a turtle or pygame run gives the console a thin strip
 * above the drawing, so earlier lines scroll out of the DOM. The console's own
 * Copy button copies the whole buffer; the test catches what it hands to the
 * clipboard rather than reading the clipboard back, which needs permissions
 * WebKit's Playwright build does not offer.
 */
async function consoleTranscript(page: Page): Promise<string> {
  await page.evaluate(() => {
    const w = window as unknown as { __copiedConsole?: string }
    delete w.__copiedConsole
    navigator.clipboard.writeText = async (text: string) => { w.__copiedConsole = text }
  })
  await page.getByRole('button', { name: 'Copy console output' }).click()
  const copied = await page.waitForFunction(() => (window as unknown as { __copiedConsole?: string }).__copiedConsole)
  return String(await copied.jsonValue())
}

/** The app's own check that this browser can suspend Python (JSPI). */
const hasJspi = (page: Page) => page.evaluate(() => typeof (WebAssembly as unknown as Record<string, unknown>).Suspending === 'function')

test('the trace worker shows each line printed before the question that follows it', async ({ page }) => {
  const problems = watchForErrors(page)
  await page.goto('/')
  test.skip(!(await page.evaluate(() => window.crossOriginIsolated && typeof SharedArrayBuffer === 'function')),
    'this browser build has no SharedArrayBuffer, so the trace worker cannot run')

  await setProgram(page, QUIZ)
  await run(page)

  await expect(consolePanel(page)).toContainText('Name?')
  await expect(consolePanel(page)).toContainText('Welcome to the quiz')
  await answer(page, 'Ada')
  await expect(consolePanel(page)).toContainText('Age?')
  await expect(consolePanel(page)).toContainText('Hello Ada')
  await answer(page, '7')
  await expect(consolePanel(page)).toContainText('Next year you will be 8')
  expect(problems).toEqual([])
})

test.describe('on the main thread', () => {
  test('input() is answered in the console, with the output so far on screen', async ({ page }) => {
    const problems = watchForErrors(page)
    const popups: string[] = []
    page.on('dialog', dialog => { popups.push(dialog.message()); void dialog.dismiss() })
    await page.goto('/')
    test.skip(!(await hasJspi(page)), 'this browser cannot suspend WebAssembly (no JSPI)')
    await useMainThread(page)

    await setProgram(page, QUIZ)
    await run(page)

    // Python is suspended inside input() here, yet the page has painted what it
    // printed first. Under the old window.prompt this line was not on screen.
    await expect(consolePanel(page)).toContainText('Name?')
    await expect(consolePanel(page)).toContainText('Welcome to the quiz')
    await answer(page, 'Ada')
    await expect(consolePanel(page)).toContainText('Age?')
    await expect(consolePanel(page)).toContainText('Hello Ada')
    await answer(page, '7')
    await expect(consolePanel(page)).toContainText('Next year you will be 8')
    await expect(consolePanel(page)).toContainText('[MAIN-THREAD RUN FINISHED]')
    expect(popups).toEqual([])
    expect(problems).toEqual([])
  })

  test('Stop while input() is waiting ends the run cleanly', async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto('/')
    test.skip(!(await hasJspi(page)), 'this browser cannot suspend WebAssembly (no JSPI)')
    await useMainThread(page)

    await setProgram(page, QUIZ)
    await run(page)
    await expect(consolePanel(page)).toContainText('Name?')

    await page.getByRole('button', { name: 'Stop', exact: true }).first().click()
    await expect(consolePanel(page)).toContainText('[MAIN-THREAD RUN STOPPED]')
    await expect(consolePanel(page)).not.toContainText('Hello')
    await expect(page.getByRole('button', { name: /^Run$/ })).toBeEnabled()

    // The runtime is still healthy: the next run starts from the top.
    await setProgram(page, 'print("after the stop")')
    await run(page)
    await expect(consolePanel(page)).toContainText('after the stop')
    expect(problems).toEqual([])
  })

  test('without JSPI the pop-up shows the latest output, and the console keeps the exchange', async ({ page }) => {
    // Hide JSPI before Pyodide loads, as on a browser that predates it (an
    // older iPad). Python then cannot be suspended and input() must block.
    await page.addInitScript(() => {
      try { delete (WebAssembly as unknown as Record<string, unknown>).Suspending } catch { /* ignore */ }
    })
    const problems = watchForErrors(page)
    const popups: string[] = []
    const answers = ['Ada', '7']
    page.on('dialog', dialog => {
      popups.push(dialog.message())
      void dialog.accept(answers.shift() ?? '')
    })
    await page.goto('/')
    expect(await hasJspi(page)).toBe(false)
    await useMainThread(page)

    await setProgram(page, QUIZ)
    await run(page)

    await expect(consolePanel(page)).toContainText('Next year you will be 8')
    expect(popups).toEqual([
      'Welcome to the quiz\n\nName?',
      'Welcome to the quiz\nName? Ada\nHello Ada\n\nAge?',
    ])
    // The questions and answers are in the transcript, in order.
    const text = (await consolePanel(page).innerText()).replace(/\s+/g, ' ')
    expect(text).toContain('Welcome to the quiz Name? Ada Hello Ada Age? 7 Next year you will be 8')
    expect(problems).toEqual([])
  })

  test('a turtle program, which always runs here, asks in the console too', async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto('/')
    test.skip(!(await hasJspi(page)), 'this browser cannot suspend WebAssembly (no JSPI)')

    await setProgram(page, [
      'import turtle',
      'print("Square drawer")',
      'side = int(input("Side length? "))',
      't = turtle.Turtle()',
      // No indented block: Monaco re-indents inserted lines after a colon.
      't.forward(side); t.left(90); t.forward(side); t.left(90)',
      't.forward(side); t.left(90); t.forward(side); t.left(90)',
      'print("Drew a square of side", side)',
    ].join('\n'))
    await run(page)

    await expect(consolePanel(page)).toContainText('Side length?')
    await expect(consolePanel(page)).toContainText('Square drawer')
    await answer(page, '50')
    await expect(page.getByRole('button', { name: /^Run$/ })).toBeEnabled()
    expect(await consoleTranscript(page)).toMatch(/Square drawer\s+Side length\? 50\s+Drew a square of side 50/)
    expect(problems).toEqual([])
  })

  test('so does a pygame program', async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto('/')
    test.skip(!(await hasJspi(page)), 'this browser cannot suspend WebAssembly (no JSPI)')

    await setProgram(page, [
      'import pygame',
      'print("Game setup")',
      'name = input("Player name? ")',
      'pygame.init()',
      'screen = pygame.display.set_mode((200, 100))',
      'screen.fill((0, 0, 255))',
      'pygame.display.flip()',
      'print("Welcome", name)',
    ].join('\n'))
    await run(page)

    await expect(consolePanel(page)).toContainText('Player name?', { timeout: 120_000 })
    await expect(consolePanel(page)).toContainText('Game setup')
    await answer(page, 'Ada')
    await expect(page.getByRole('button', { name: /^Run$/ })).toBeEnabled()
    expect(await consoleTranscript(page)).toMatch(/Game setup\s+Player name\? Ada[\s\S]*Welcome Ada/)
    expect(problems).toEqual([])
  })

  test('fixed inputs answer input() without asking', async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto('/')
    await useMainThread(page)
    await page.getByTitle('Settings').click()
    await page.getByRole('button', { name: /Use Fixed Inputs/ }).click()
    await page.locator('#console-tab-inputs').click()
    await page.getByPlaceholder('Enter inputs, one per line...').fill('Ada\n7')

    await setProgram(page, QUIZ)
    await run(page)

    await expect(page.getByRole('button', { name: /^Run$/ })).toBeEnabled()
    expect(await consoleTranscript(page))
      .toMatch(/Welcome to the quiz\s+Name\? Ada\s+Hello Ada\s+Age\? 7\s+Next year you will be 8/)
    expect(problems).toEqual([])
  })

  for (const mode of [
    { label: 'Inline input field', fill: (page: Page) => page.getByPlaceholder('type here and press Enter…') },
    { label: 'Pop-up dialog', fill: (page: Page) => page.getByPlaceholder('Enter value...') },
  ]) {
    test(`the "${mode.label}" input mode works here too`, async ({ page }) => {
      const problems = watchForErrors(page)
      await page.goto('/')
      test.skip(!(await hasJspi(page)), 'this browser cannot suspend WebAssembly (no JSPI)')
      await useMainThread(page)
      await page.getByTitle('Settings').click()
      await page.getByRole('button', { name: /More settings/ }).click()
      await page.getByRole('button', { name: new RegExp(mode.label) }).click()
      await page.getByRole('button', { name: 'Close', exact: true }).click()

      await setProgram(page, QUIZ)
      await run(page)

      await mode.fill(page).fill('Ada')
      await mode.fill(page).press('Enter')
      await mode.fill(page).fill('7')
      await mode.fill(page).press('Enter')
      await expect(consolePanel(page)).toContainText('Next year you will be 8')
      await expect(consolePanel(page)).toContainText('Hello Ada')
      expect(problems).toEqual([])
    })
  }

  test('a sys.stdctx canvas program asks in the console too', async ({ page }) => {
    const problems = watchForErrors(page)
    await page.goto('/')
    test.skip(!(await hasJspi(page)), 'this browser cannot suspend WebAssembly (no JSPI)')
    await useMainThread(page)

    await setProgram(page, [
      'from sys import stdctx',
      'print("Box painter")',
      'colour = input("Colour? ")',
      'stdctx.fillStyle = colour',
      'stdctx.fillRect(10, 10, 100, 60)',
      'print("Painted a", colour, "box")',
    ].join('\n'))
    await run(page)

    await expect(consolePanel(page)).toContainText('Colour?')
    await expect(consolePanel(page)).toContainText('Box painter')
    await answer(page, 'red')
    await expect(page.getByRole('button', { name: /^Run$/ })).toBeEnabled()
    expect(await consoleTranscript(page)).toMatch(/Box painter\s+Colour\? red\s+Painted a red box/)
    expect(problems).toEqual([])
  })
})
