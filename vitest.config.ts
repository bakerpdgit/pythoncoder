import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // The TraceTable suite renders thousands of rows through jsdom; its heaviest
    // cases sit at 3-5s on an idle machine and tip over vitest's 5s default the
    // moment anything else is running (a dev server, a browser, CI). Raising the
    // ceiling is the honest fix — the alternative is a suite that fails for
    // reasons that have nothing to do with the code under test.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    passWithNoTests: true,
    clearMocks: true,
    restoreMocks: true,
  },
})
