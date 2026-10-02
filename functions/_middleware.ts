// Cloudflare Pages middleware: the cross-origin isolation headers that depend
// on the request.
//
// Everyone gets COEP `credentialless` — which is also what `public/_headers`
// says, statically. The exception is a browser carrying the `coder_isolation`
// cookie, which has asked to be sent `require-corp` instead (see
// scripts/isolationPolicy.mjs for why that is opt-in, and why it exists at
// all). `_headers` cannot read a cookie, so the two responses that decide
// isolation are routed through here (public/_routes.json):
//
//   - the page itself (`/`, `/index.html`) — its COEP decides whether the
//     page is isolated;
//   - the worker scripts (`/assets/workers/*`) — a `require-corp` page cannot
//     start a dedicated worker whose script's COEP does not match its own.
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
  const policy: Record<string, string> = isolationHeadersFor(context.request.headers.get('Cookie'))
  for (const [name, value] of Object.entries(policy)) headers.set(name, value)
  // A worker script is cached for a year: it must not be handed, with one
  // cookie's policy on it, to a page that was served under the other.
  const vary = (headers.get('Vary') ?? '').split(',').map(part => part.trim())
    .filter(part => part && !/^user-agent$/i.test(part))
  if (!vary.some(part => /^cookie$/i.test(part))) vary.push('Cookie')
  headers.set('Vary', vary.join(', '))
  headers.set('Cache-Control', pathname.startsWith('/assets/') ? IMMUTABLE : NO_CACHE)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
