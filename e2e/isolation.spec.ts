import { test, expect } from '@playwright/test'
import { ISOLATION_COOKIE } from '../scripts/isolationPolicy.mjs'

/**
 * Cross-origin isolation gives the trace worker shared memory to wait on, and
 * it is no longer what decides whether the worker is offered at all.
 *
 * Everyone is sent COEP `credentialless`. Chromium honours it and is isolated;
 * WebKit reads it as no policy and is not — on purpose, because every real
 * Safari sent `require-corp` became isolated and could then not start a single
 * worker (scripts/isolationPolicy.mjs). A page that is not isolated runs the
 * worker over a service worker instead.
 */

const UNAVAILABLE = "The step-by-step runner isn't available in this tab."

test('everyone is sent credentialless, and nobody require-corp unasked', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.headers()['cross-origin-embedder-policy']).toBe('credentialless')
  expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin')
})

test('the step-by-step runner is offered whether or not the page is isolated', async ({ page, browserName }) => {
  await page.goto('/')
  const isolated = await page.evaluate(() => window.crossOriginIsolated === true)
  // WebKit must NOT be isolated by these headers: that is the arrangement in
  // which Safari could start no worker.
  expect(isolated).toBe(browserName !== 'webkit')
  await expect(page.getByRole('button', { name: /^(Run|Debug|Trace)$/ }).first()).toBeEnabled()
  await expect(page.getByText(UNAVAILABLE)).toHaveCount(0)
})

test('?isolation=on asks for require-corp from then on, and ?isolation=off stops asking', async ({ context }) => {
  // The switch sets a cookie and replaces the navigation with one without
  // itself, before the first has finished loading. Following that race is
  // what made this test flaky in WebKit — `goto` failing with "internal
  // error", `waitForURL` never seeing the second address, a later `goto`
  // "interrupted by another navigation" — so the switch gets a tab of its
  // own, which is closed, replacement and all, once the cookie it exists to
  // set is there; the headers are then read from a tab with nothing pending.
  // That the rest of the address survives is isolationSwitch.test.ts's job.
  const cookieSet = async () =>
    (await context.cookies()).some(c => c.name === ISOLATION_COOKIE && c.value !== '')
  const flip = async (address: string, on: boolean) => {
    const switching = await context.newPage()
    await switching.goto(address, { waitUntil: 'commit' }).catch(() => { /* replaced mid-flight */ })
    await expect.poll(cookieSet).toBe(on)
    await switching.close()
    const page = await context.newPage()
    const response = await page.goto('/')
    await page.close()
    return response
  }

  const isolatedResponse = await flip('/?isolation=on', true)
  expect(isolatedResponse?.headers()['cross-origin-embedder-policy']).toBe('require-corp')
  expect(isolatedResponse?.headers()['vary']).toMatch(/cookie/i)

  const relaxedResponse = await flip('/?isolation=off', false)
  expect(relaxedResponse?.headers()['cross-origin-embedder-policy']).toBe('credentialless')
})
