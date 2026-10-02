import { describe, expect, it } from 'vitest'
import {
  applyIsolationHeaders, embedderPolicyFor, isolationHeadersFor, isWebKitUserAgent, wantsStrictIsolation,
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
  it('sends everyone credentialless — which leaves WebKit not isolated, on purpose', () => {
    // WebKit reads the value as no policy. Sent require-corp instead, every
    // real Safari became isolated and could no longer start a worker.
    expect(embedderPolicyFor(undefined)).toBe('credentialless')
    expect(embedderPolicyFor('')).toBe('credentialless')
    expect(embedderPolicyFor('theme=dark; other=1')).toBe('credentialless')
  })
  it('sends require-corp only to a browser that asked for it with the cookie', () => {
    expect(embedderPolicyFor('coder_isolation=require-corp')).toBe('require-corp')
    expect(embedderPolicyFor('theme=dark; coder_isolation=require-corp; other=1')).toBe('require-corp')
  })
  it('is not fooled by a cookie that merely looks like it', () => {
    expect(wantsStrictIsolation('coder_isolation=off')).toBe(false)
    expect(wantsStrictIsolation('coder_isolation=require-corp-ish')).toBe(false)
    expect(wantsStrictIsolation('not_coder_isolation=require-corp')).toBe(false)
    expect(wantsStrictIsolation('x=coder_isolation=require-corp')).toBe(false)
  })
  it('always sends the rest of what isolation needs', () => {
    for (const cookie of [undefined, 'coder_isolation=require-corp']) {
      const headers = isolationHeadersFor(cookie)
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

  it('does not treat a Safari user agent specially any more', () => {
    const res = fakeResponse()
    applyIsolationHeaders({ headers: { 'user-agent': WEBKIT['Chrome on iPad'] } }, res as never)
    expect(res.headers.get('Cross-Origin-Embedder-Policy')).toBe('credentialless')
  })

  it('reads the cookie, and varies the response on it', () => {
    const res = fakeResponse()
    applyIsolationHeaders({ headers: { cookie: 'coder_isolation=require-corp' } }, res as never)
    expect(res.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp')
    // A worker script is cached for a year and must match the page that starts it.
    expect(res.headers.get('Vary')).toBe('Cookie')
  })

  it('adds to an existing Vary rather than replacing it, and only once', () => {
    const res = fakeResponse({ Vary: 'Origin' })
    applyIsolationHeaders({ headers: {} }, res as never)
    applyIsolationHeaders({ headers: {} }, res as never)
    expect(res.headers.get('Vary')).toBe('Origin, Cookie')
  })
})
