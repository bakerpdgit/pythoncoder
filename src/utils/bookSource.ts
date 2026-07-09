// Centralised source/routing policy for learning-book resources (book.json,
// per-file assets, and book ZIPs). One place decides how a public URL is
// fetched so manifest, per-file, and ZIP loads all behave the same:
//
//   1. GitHub content is rewritten to raw.githubusercontent.com and fetched
//      DIRECT. raw.* sends `Access-Control-Allow-Origin: *` and serves the
//      authoritative bytes, so we avoid jsDelivr's CDN cache (which caused
//      teachers' updates to appear stale for hours).
//   2. Non-GitHub hosts are tried direct first (works if they send CORS), then
//      fall back to our own /api/proxy (Cloudflare Pages Function) which adds
//      CORS headers — needed for Google Drive and arbitrary hosts.
//   3. jsDelivr remains only as a last-resort fallback for GitHub URLs.

// jsDelivr occasionally caches a 22-byte empty-EOCD ZIP for binary blobs
// (HTTP 200 but zero files). Treat any suspiciously small payload as a miss.
export const MIN_PLAUSIBLE_ZIP_BYTES = 64

/** Rewrite a github.com blob/raw URL to its raw.githubusercontent.com form. */
export function normalizeGitHubUrl(url: string): string {
  const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+)$/)
  if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`
  return url
}

function toJsDelivrUrl(url: string): string | null {
  if (url.includes('cdn.jsdelivr.net')) return null
  const raw = url.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/)
  if (raw) return `https://cdn.jsdelivr.net/gh/${raw[1]}/${raw[2]}@${raw[3]}/${raw[4]}`
  const gh = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+)$/)
  if (gh) return `https://cdn.jsdelivr.net/gh/${gh[1]}/${gh[2]}@${gh[3]}/${gh[4]}`
  return null
}

function isGitHubHosted(url: string): boolean {
  return /^https?:\/\/(raw\.githubusercontent\.com|github\.com)\//i.test(url)
}

/** URL of our own CORS proxy for a given upstream URL. */
export function proxyUrl(url: string): string {
  return `${location.origin}/api/proxy?url=${encodeURIComponent(url)}`
}

/** Ordered list of candidate URLs to try for a resource, best first. */
function buildCandidates(url: string): string[] {
  const list: string[] = []
  if (isGitHubHosted(url)) {
    const raw = normalizeGitHubUrl(url)
    list.push(raw) // direct raw.githubusercontent.com — CORS *, no jsDelivr cache
    list.push(proxyUrl(raw)) // proxy fallback in case direct is blocked
    const jd = toJsDelivrUrl(raw)
    if (jd) list.push(jd) // jsDelivr only as a last resort
  } else {
    list.push(url) // direct (works if the host sends CORS)
    list.push(proxyUrl(url)) // proxy fallback for non-CORS hosts (Drive, etc.)
  }
  return [...new Set(list)]
}

export interface FetchOptions {
  /** Responses smaller than this many bytes are treated as a miss (jsDelivr guard). */
  minBytes?: number
}

/**
 * Fetch a resource as an ArrayBuffer, trying direct → proxy → jsDelivr as
 * appropriate for the host. Throws if every candidate fails.
 */
export async function fetchResourceBuffer(url: string, opts: FetchOptions = {}): Promise<ArrayBuffer> {
  const min = opts.minBytes ?? 0
  let lastErr = ''
  for (const candidate of buildCandidates(url)) {
    try {
      const r = await fetch(candidate)
      if (!r.ok) { lastErr = `HTTP ${r.status}`; continue }
      const buf = await r.arrayBuffer()
      if (min && buf.byteLength < min) { lastErr = 'empty/too-small response'; continue }
      return buf
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(`Failed to fetch ${url}${lastErr ? ` (${lastErr})` : ''}`)
}

/** Fetch a resource as UTF-8 text (used for book.json and guide markdown). */
export async function fetchResourceText(url: string): Promise<string> {
  return new TextDecoder().decode(await fetchResourceBuffer(url))
}

/**
 * Shareable link a teacher can hand to students: opens this coder site and
 * auto-opens the given book/zip resource. The app decides how to route it.
 */
export function buildShareLink(resourceUrl: string): string {
  return `${location.origin}${location.pathname}?book=${encodeURIComponent(resourceUrl)}`
}
