// Cloudflare Pages middleware: per-browser cross-origin isolation headers.
//
// WebKit (Safari, and every browser on iPad/iPhone) cannot honour COEP
// `credentialless`, so it needs `require-corp` to become cross-origin isolated
// — see scripts/isolationPolicy.mjs for the whole story. `public/_headers` is
// static and cannot tell browsers apart, so the two responses that decide
// isolation are routed through here instead (public/_routes.json):
//
//   - the page itself (`/`, `/index.html`) — its COEP decides whether the
//     page is isolated at all;
//   - the worker scripts (`/assets/workers/*`) — WebKit refuses to start a
//     dedicated worker whose script's COEP does not match the page's.
//
// Everything else stays a plain static asset with the `_headers` defaults, so
// Functions are invoked once per page load and once per worker, not per asset.
//
// Cloudflare does not apply `_headers` to a response that passed through a
// Function, which is why the page's no-cache rule is repeated here.
//
// Like functions/api/proxy.ts, this is compiled by Cloudflare Pages, not by the
// app's tsconfig.

import { isolationHeadersFor } from '../scripts/isolationPolicy.mjs'

interface MiddlewareContext {
  request: Request
  next: () => Promise<Response>
}

const NO_CACHE = 'no-cache, no-store, must-revalidate'
const IMMUTABLE = 'public, max-age=31536000, immutable'

export async function onRequest(context: MiddlewareContext): Promise<Response> {
  const response = await context.next()
  const { pathname } = new URL(context.request.url)
  // The CORS proxy's responses are never documents or workers.
  if (pathname.startsWith('/api/')) return response

  const headers = new Headers(response.headers)
  const policy: Record<string, string> = isolationHeadersFor(context.request.headers.get('User-Agent'))
  for (const [name, value] of Object.entries(policy)) headers.set(name, value)
  const vary = headers.get('Vary')
  if (!vary || !/\buser-agent\b/i.test(vary)) headers.set('Vary', vary ? `${vary}, User-Agent` : 'User-Agent')
  headers.set('Cache-Control', pathname.startsWith('/assets/') ? IMMUTABLE : NO_CACHE)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
