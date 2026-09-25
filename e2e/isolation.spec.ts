import { test, expect } from '@playwright/test'

/**
 * Cross-origin isolation is what lets the trace worker run (SharedArrayBuffer),
 * and WebKit cannot honour the COEP value everyone else gets
 * (scripts/isolationPolicy.mjs). Without the per-browser header, Safari and
 * every iPad browser silently fell back to the main thread.
 */

test('the page is sent the embedder policy this browser can honour', async ({ page, browserName }) => {
  const response = await page.goto('/')
  const coep = response?.headers()['cross-origin-embedder-policy']
  expect(coep).toBe(browserName === 'webkit' ? 'require-corp' : 'credentialless')
  expect(response?.headers()['cross-origin-opener-policy']).toBe('same-origin')
})

test('the page is cross-origin isolated, so the trace worker is offered', async ({ page, browserName }) => {
  await page.goto('/')
  const isolated = await page.evaluate(() => window.crossOriginIsolated === true)
  const shared = await page.evaluate(() => typeof SharedArrayBuffer === 'function')
  // Playwright's WebKit build may lack isolation altogether (see
  // microsoft/playwright#28513), in which case the header test above is the
  // guard. Real Safari, and WebKitGTK, do isolate with require-corp.
  test.skip(browserName === 'webkit' && !isolated, 'this WebKit build does not implement cross-origin isolation')
  expect(isolated).toBe(true)
  test.skip(!shared, 'this browser build has SharedArrayBuffer switched off even when isolated')
  await expect(page.getByRole('button', { name: /^(Run|Debug|Trace)$/ }).first()).toBeEnabled()
  await expect(page.getByText("The step-by-step runner isn't available in this tab.")).toHaveCount(0)
})
