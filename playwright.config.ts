import { defineConfig, devices } from '@playwright/test'

/**
 * Black-box tests: a real browser, the real dev server, the real Pyodide.
 *
 * These are deliberately few. Everything that can be decided from the source
 * alone belongs in a vitest unit test, and the recorder's contract is covered by
 * `tracer.worker.integration.test.ts` running the worker's own Python. What is
 * left over is the part no unit test can reach — does the page actually load,
 * does a program actually run, does its output actually appear — and that is
 * what has historically been checked by hand, one change at a time.
 *
 * They need the network: Pyodide and its packages come from a CDN on first use,
 * which is why the timeouts are in tens of seconds rather than the usual few.
 */
export default defineConfig({
  testDir: './e2e',
  // One worker: every test drives the same dev server and downloads the same
  // Pyodide, and racing them only makes the CDN the bottleneck.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 60_000 },
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The Safari engine. Every browser on an iPad is WebKit, and WebKit needs
    // its own cross-origin isolation header (scripts/isolationPolicy.mjs), so
    // the input and isolation specs run here too: `npm run test:e2e:webkit`
    // after `npx playwright install webkit`.
    {
      name: 'webkit',
      testMatch: ['isolation.spec.ts', 'input.spec.ts'],
      use: {
        ...devices['Desktop Safari'],
        launchOptions: {
          // Playwright's WebKit ships SharedArrayBuffer switched off, even on
          // an isolated page (microsoft/playwright#28513); Safari turns it on.
          // This JavaScriptCore option does the same, as it does for WebKitGTK.
          // Where it has no effect the SharedArrayBuffer tests skip themselves.
          env: { ...process.env, JSC_useSharedArrayBuffer: 'true' },
        },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
