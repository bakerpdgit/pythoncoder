import { describe, expect, it } from 'vitest'
import { onRequest } from '../../functions/_middleware'

/**
 * The Cloudflare Pages middleware, run as the function it is. It sits in front
 * of the page and of every worker script on the live site, so a mistake here is
 * a site that will not load — and nothing else in the suite executes it.
 */

const asset = (headers: Record<string, string> = {}) => async () =>
  new Response('body', { status: 200, headers: { 'Content-Type': 'text/html', ...headers } })

const serve = (path: string, requestHeaders: Record<string, string> = {}, upstream = asset()) =>
  onRequest({ request: new Request(`https://coder.example${path}`, { headers: requestHeaders }), next: upstream })

const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15'

describe('Cloudflare Pages middleware', () => {
  it('sends the page credentialless — to Safari as to everyone', async () => {
    for (const agent of [SAFARI, 'Mozilla/5.0 Chrome/140.0.0.0']) {
      const response = await serve('/', { 'User-Agent': agent })
      expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('credentialless')
      expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin')
    }
  })

  it('sends require-corp to a browser carrying the cookie, page and worker script alike', async () => {
    const cookie = { Cookie: 'coder_isolation=require-corp' }
    expect((await serve('/', cookie)).headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp')
    // A require-corp page cannot start a worker whose script says otherwise.
    expect((await serve('/assets/workers/tracer.worker-abc.js', cookie)).headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp')
  })

  it('varies on the cookie, not the user agent, and keeps what was already there', async () => {
    const response = await serve('/assets/workers/tracer.worker-abc.js', {}, asset({ Vary: 'Accept-Encoding, User-Agent' }))
    expect(response.headers.get('Vary')).toBe('Accept-Encoding, Cookie')
    expect((await serve('/', {}, asset({ Vary: 'Cookie' }))).headers.get('Vary')).toBe('Cookie')
  })

  it('never caches the page, and caches a hashed worker script for good', async () => {
    expect((await serve('/')).headers.get('Cache-Control')).toMatch(/no-store/)
    expect((await serve('/index.html')).headers.get('Cache-Control')).toMatch(/no-store/)
    expect((await serve('/assets/workers/tracer.worker-abc.js')).headers.get('Cache-Control')).toMatch(/immutable/)
  })

  it('passes the body and status through, a 304 included', async () => {
    const ok = await serve('/')
    expect(ok.status).toBe(200)
    expect(await ok.text()).toBe('body')
    const notModified = await serve('/', {}, async () => new Response(null, { status: 304 }))
    expect(notModified.status).toBe(304)
    expect(notModified.headers.get('Cross-Origin-Embedder-Policy')).toBe('credentialless')
  })

  it('leaves the CORS proxy alone', async () => {
    const upstream = await asset({ 'X-Proxy': '1' })()
    const response = await onRequest({ request: new Request('https://coder.example/api/proxy?url=x'), next: async () => upstream })
    expect(response).toBe(upstream)
  })
})
