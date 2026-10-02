// Cross-origin isolation headers.
//
// `crossOriginIsolated` gives the page SharedArrayBuffer, which is the trace
// worker's first choice for blocking on input() and on Step/Continue. It takes
// `Cross-Origin-Opener-Policy: same-origin` plus a Cross-Origin-Embedder-Policy.
//
// Everyone is sent COEP `credentialless`: cross-origin subresources load
// without credentials, so a CDN script inside a plotly figure or an image in a
// student's HTML page works without that server's co-operation. Chromium and
// Firefox honour it and are isolated.
//
// WebKit (Safari on Mac, and every browser on iPad/iPhone: Chrome, Edge and
// Firefox on iOS are all WebKit underneath) has never implemented
// `credentialless`; it reads the unknown value as no policy at all, so **a
// WebKit page is not isolated, deliberately**. For a week WebKit was sent
// `require-corp` instead, which it does honour, and the result on every real
// Safari it met (two Macs and an iPad) was a page that *was* isolated and
// could not start a single worker: `new Worker(...)` fired a bare `error`
// event, although the worker script arrived with a matching `require-corp`
// (checked against the live site as Safari, compressed, revalidated and from
// an iPad). Neither WebKitGTK nor Playwright's WebKit does this, and the cause
// is still unknown. A WebKit page that is not isolated starts workers like any
// other site, and the trace worker no longer needs isolation: it waits on a
// service worker there instead (src/utils/traceSyncProtocol.ts), which is how
// Python Sponge always worked on Safari.
//
// The cookie below is how the isolated arrangement is still reached, on
// purpose and on one device: `?isolation=on` sets it (src/utils/isolationSwitch.ts)
// and from then on that browser is sent `require-corp`, page and worker
// scripts alike. It exists so the Safari failure can be investigated without
// putting any student back in it. `?isolation=off` clears it.
//
// Shared by vite.config.ts (dev/preview), server.mjs (Node production) and
// functions/_middleware.ts (Cloudflare Pages).
//
// public/vfs-preview-sw.js keeps sending `credentialless` for the HTML preview
// frame whatever the page has, so a student's page can use images from any
// server: giving the frame `require-corp` blocked every image whose server
// sends no CORP header (checked in WebKitGTK 2.52).

export const ISOLATION_COOKIE = 'coder_isolation'
const STRICT_COOKIE = new RegExp(`(?:^|;\\s*)${ISOLATION_COOKIE}=require-corp\\s*(?:;|$)`)

const IOS_BROWSER = /\b(CriOS|FxiOS|EdgiOS|OPiOS|GSA)\//
const BLINK_BRANDS = /\b(Chrome|Chromium|HeadlessChrome|Edg|OPR|SamsungBrowser|YaBrowser)\//

/**
 * True for Safari and anything else running on the WebKit engine. The headers
 * no longer depend on it; the page uses it to explain itself
 * (src/utils/isolationStatus.ts).
 */
export function isWebKitUserAgent(userAgent) {
  const ua = String(userAgent ?? '')
  if (IOS_BROWSER.test(ua)) return true
  if (!/AppleWebKit\//.test(ua)) return false
  return !BLINK_BRANDS.test(ua)
}

/** Has this browser asked, through `?isolation=on`, to be sent `require-corp`? */
export function wantsStrictIsolation(cookieHeader) {
  return STRICT_COOKIE.test(String(cookieHeader ?? ''))
}

/** The Cross-Origin-Embedder-Policy value for a request carrying these cookies. */
export function embedderPolicyFor(cookieHeader) {
  return wantsStrictIsolation(cookieHeader) ? 'require-corp' : 'credentialless'
}

/** Every header cross-origin isolation needs. */
export function isolationHeadersFor(cookieHeader) {
  return {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': embedderPolicyFor(cookieHeader),
    'Origin-Agent-Cluster': '?1',
  }
}

/**
 * Set the isolation headers on a Node response. `Vary: Cookie` stops any cache
 * handing a response chosen for one cookie to a request with another — which
 * matters for worker scripts, cached for a year, whose policy has to match
 * the page that starts them.
 */
export function applyIsolationHeaders(req, res) {
  const headers = isolationHeadersFor(req?.headers?.cookie)
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value)
  const vary = String(res.getHeader?.('Vary') ?? '')
  if (!/\bcookie\b/i.test(vary)) res.setHeader('Vary', vary ? `${vary}, Cookie` : 'Cookie')
}
