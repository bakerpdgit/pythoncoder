import { test, expect } from '@playwright/test'

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

test('?isolation=on asks for require-corp from then on, and ?isolation=off stops asking', async ({ page }) => {
  // The switch sets a cookie and reloads without itself, so the first
  // navigation is replaced before it has finished loading.
  const settle = async (address: string) => {
    await page.goto(address, { waitUntil: 'commit' })
    await page.waitForURL(url => !url.searchParams.has('isolation'))
    await page.waitForLoadState('load')
    return page.reload()
  }

  const isolatedResponse = await settle('/?isolation=on&transport=xhr')
  expect(isolatedResponse?.headers()['cross-origin-embedder-policy']).toBe('require-corp')
  expect(isolatedResponse?.headers()['vary']).toMatch(/cookie/i)
  // The rest of the address survives the switch.
  expect(new URL(page.url()).searchParams.get('transport')).toBe('xhr')

  const relaxedResponse = await settle('/?isolation=off')
  expect(relaxedResponse?.headers()['cross-origin-embedder-policy']).toBe('credentialless')
})
