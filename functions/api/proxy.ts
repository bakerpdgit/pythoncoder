// Cloudflare Pages Function: GET /api/proxy?url=<https url>
//
// A hardened CORS proxy so the app can fetch book ZIPs / book.json from hosts
// that do not send `Access-Control-Allow-Origin` (Google Drive, arbitrary
// public URLs). GitHub content does NOT need this — it is fetched directly from
// raw.githubusercontent.com — so this endpoint is only a fallback.
//
// Safety: only https:// is allowed; private/loopback/link-local/metadata hosts
// are rejected (open-proxy/SSRF guard); the body is size-capped; and the
// response Content-Type is forced to application/octet-stream + nosniff so the
// fetched bytes can never be rendered as HTML from our own origin.
//
// This file is NOT part of the app's tsconfig; Cloudflare Pages compiles it
// independently. Local dev/prod parity is provided by vite.config.ts and
// server.mjs, which implement the same /api/proxy endpoint.

const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.internal') || h.endsWith('.local')) return true
  if (h === '0.0.0.0' || h === '::1') return true
  if (/^127\./.test(h)) return true
  if (/^10\./.test(h)) return true
  if (/^192\.168\./.test(h)) return true
  if (/^169\.254\./.test(h)) return true // link-local / cloud metadata
  const m = h.match(/^172\.(\d+)\./)
  if (m) { const o = Number(m[1]); if (o >= 16 && o <= 31) return true } // 172.16-31.x
  if (/^(fc|fd)[0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return true // IPv6 ULA / link-local
  return false
}

function errorResponse(message: string, status: number): Response {
  return new Response(message, { status, headers: CORS_HEADERS })
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function onRequestGet(context: { request: Request }): Promise<Response> {
  const target = new URL(context.request.url).searchParams.get('url')
  if (!target) return errorResponse('Missing url parameter', 400)

  let upstream: URL
  try { upstream = new URL(target) } catch { return errorResponse('Invalid url', 400) }
  if (upstream.protocol !== 'https:') return errorResponse('Only https:// URLs are allowed', 400)
  if (isBlockedHost(upstream.hostname)) return errorResponse('Blocked host', 403)

  let resp: Response
  try {
    resp = await fetch(upstream.toString(), {
      method: 'GET',
      headers: { 'User-Agent': 'pythoncoder-proxy', 'Accept': '*/*' },
      redirect: 'follow',
    })
  } catch (e) {
    return errorResponse(`Upstream fetch failed: ${e instanceof Error ? e.message : String(e)}`, 502)
  }
  if (!resp.ok) return errorResponse(`Upstream returned HTTP ${resp.status}`, resp.status)

  const declared = resp.headers.get('content-length')
  if (declared && Number(declared) > MAX_BYTES) return errorResponse('Resource too large', 413)

  const buf = await resp.arrayBuffer()
  if (buf.byteLength > MAX_BYTES) return errorResponse('Resource too large', 413)

  return new Response(buf, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'attachment',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
