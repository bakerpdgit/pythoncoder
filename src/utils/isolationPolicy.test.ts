import { describe, expect, it } from 'vitest'
import {
  applyIsolationHeaders, embedderPolicyFor, isolationHeadersFor, isWebKitUserAgent,
} from '../../scripts/isolationPolicy.mjs'

// Real user-agent strings, one per browser a student might plausibly use.
const WEBKIT = {
  'Safari 18 on macOS': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  'Safari on iPad (desktop-class UA)': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  'Safari on iPhone': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  'Chrome on iPad': 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.101 Mobile/15E148 Safari/604.1',
  'Edge on iPad': 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/140.3485.94 Mobile/15E148 Safari/605.1.15',
  'Firefox on iPhone': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/143.0 Mobile/15E148 Safari/605.1.15',
  'Google app on iOS': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/384.0.786708001 Mobile/15E148 Safari/604.1',
  'WebKitGTK MiniBrowser': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/60.5 Safari/605.1.15',
  'Playwright WebKit': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
}
const NOT_WEBKIT = {
  'Chrome on Windows': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'Chrome on macOS': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'Chromebook': 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'Edge on Windows': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  'Chrome on Android': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  'Samsung Internet': 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  'Headless Chrome (Playwright)': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36',
  'Firefox on Windows': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0',
  'Firefox on macOS': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0',
  'no user agent': '',
}

describe('isWebKitUserAgent', () => {
  for (const [name, ua] of Object.entries(WEBKIT)) {
    it(`treats ${name} as WebKit`, () => expect(isWebKitUserAgent(ua)).toBe(true))
  }
  for (const [name, ua] of Object.entries(NOT_WEBKIT)) {
    it(`does not treat ${name} as WebKit`, () => expect(isWebKitUserAgent(ua)).toBe(false))
  }
  it('copes with a missing header', () => {
    expect(isWebKitUserAgent(undefined)).toBe(false)
    expect(isWebKitUserAgent(null)).toBe(false)
  })
})

describe('embedderPolicyFor / isolationHeadersFor', () => {
  it('gives WebKit require-corp, the only COEP it can honour', () => {
    expect(embedderPolicyFor(WEBKIT['Safari on iPhone'])).toBe('require-corp')
  })
  it('keeps credentialless for everyone else', () => {
    expect(embedderPolicyFor(NOT_WEBKIT['Chrome on Windows'])).toBe('credentialless')
    expect(embedderPolicyFor(NOT_WEBKIT['Firefox on Windows'])).toBe('credentialless')
  })
  it('always sends the rest of what isolation needs', () => {
    for (const ua of [...Object.values(WEBKIT), ...Object.values(NOT_WEBKIT)]) {
      const headers = isolationHeadersFor(ua)
      expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin')
      expect(headers['Origin-Agent-Cluster']).toBe('?1')
    }
  })
})

describe('applyIsolationHeaders', () => {
  const fakeResponse = (initial: Record<string, string> = {}) => {
    const headers = new Map(Object.entries(initial))
    return {
      headers,
      setHeader: (name: string, value: string) => { headers.set(name, value) },
      getHeader: (name: string) => headers.get(name),
    }
  }

  it('sets the per-browser policy and varies the response on the user agent', () => {
    const res = fakeResponse()
    applyIsolationHeaders({ headers: { 'user-agent': WEBKIT['Chrome on iPad'] } }, res as never)
    expect(res.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp')
    expect(res.headers.get('Vary')).toBe('User-Agent')
  })

  it('adds to an existing Vary rather than replacing it, and only once', () => {
    const res = fakeResponse({ Vary: 'Origin' })
    applyIsolationHeaders({ headers: {} }, res as never)
    applyIsolationHeaders({ headers: {} }, res as never)
    expect(res.headers.get('Vary')).toBe('Origin, User-Agent')
  })
})
