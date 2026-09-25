// Cross-origin isolation headers, chosen per browser engine.
//
// Coder needs `crossOriginIsolated` for SharedArrayBuffer, which the trace
// worker uses to block on input() and on Step/Continue. That takes
// `Cross-Origin-Opener-Policy: same-origin` plus a Cross-Origin-Embedder-Policy.
//
// Chromium and Firefox get COEP `credentialless`: cross-origin subresources
// load without credentials, so a CDN script inside a plotly figure or an image
// in a student's HTML page works without that server's co-operation.
//
// WebKit (Safari on Mac, and every browser on iPad/iPhone: Chrome, Edge and
// Firefox on iOS are all WebKit underneath) has never implemented
// `credentialless`. It treats the unknown value as no policy at all, so the
// page was never isolated there and Safari students were pushed onto the
// main-thread runtime with pop-up input. WebKit does implement `require-corp`,
// so that is what it gets. The cost is WebKit-only: a cross-origin resource
// loaded without CORS must now send `Cross-Origin-Resource-Policy`
// (jsDelivr and raw.githubusercontent.com do).
//
// Getting the engine wrong is never worse than before: a Chromium browser
// mistaken for WebKit is still isolated (just more strictly), and a WebKit
// browser mistaken for Chromium is exactly where it was before this existed.
//
// Shared by vite.config.ts (dev/preview), server.mjs (Node production) and
// functions/_middleware.ts (Cloudflare Pages).
//
// public/vfs-preview-sw.js deliberately keeps sending `credentialless` for the
// HTML preview frame in every browser. WebKit reads it as "no policy" and still
// frames it inside the require-corp page, so a student's page can use images
// from any server; giving the frame `require-corp` there blocked every image
// whose server sends no CORP header (checked in WebKitGTK 2.52).

const IOS_BROWSER = /\b(CriOS|FxiOS|EdgiOS|OPiOS|GSA)\//
const BLINK_BRANDS = /\b(Chrome|Chromium|HeadlessChrome|Edg|OPR|SamsungBrowser|YaBrowser)\//

/** True for Safari and anything else running on the WebKit engine. */
export function isWebKitUserAgent(userAgent) {
  const ua = String(userAgent ?? '')
  if (IOS_BROWSER.test(ua)) return true
  if (!/AppleWebKit\//.test(ua)) return false
  return !BLINK_BRANDS.test(ua)
}

/** The Cross-Origin-Embedder-Policy value this browser can actually honour. */
export function embedderPolicyFor(userAgent) {
  return isWebKitUserAgent(userAgent) ? 'require-corp' : 'credentialless'
}

/** Every header cross-origin isolation needs, for this browser. */
export function isolationHeadersFor(userAgent) {
  return {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': embedderPolicyFor(userAgent),
    'Origin-Agent-Cluster': '?1',
  }
}

/**
 * Set the isolation headers on a Node response. `Vary: User-Agent` stops any
 * cache between us and the browser handing one engine's policy to another.
 */
export function applyIsolationHeaders(req, res) {
  const headers = isolationHeadersFor(req?.headers?.['user-agent'])
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value)
  const vary = String(res.getHeader?.('Vary') ?? '')
  if (!/\buser-agent\b/i.test(vary)) res.setHeader('Vary', vary ? `${vary}, User-Agent` : 'User-Agent')
}
