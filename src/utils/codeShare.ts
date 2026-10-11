// ── Sharing code by link ────────────────────────────────────────────────────
//
// Two kinds of link open somebody's code in Coder:
//
//   * `#share=<payload>` — the code travels *inside* the link. The payload is
//     base64url(deflate(UTF-8 JSON)), and it sits in the fragment so it is
//     never sent to any server: no server's URL-length limit applies and no
//     server log ever holds a student's program.
//   * `?filesystem=<url>[&name=<file>]` — the code lives somewhere public
//     (a Gist, a repository, Google Drive) and the link points at it. `name`
//     names a single file whose address carries no file name (Drive's).
//
// Whether the first kind is offered is decided by the length of the finished
// link, not of the code: what breaks is a chat app or a learning platform
// cutting a long address short.

/** Links up to this long paste anywhere. */
export const URL_SHARE_SOFT_LIMIT = 2000
/** Links longer than this are not offered: too many places would cut them short. */
export const URL_SHARE_MAX = 8000

const PAYLOAD_VERSION = 1

export interface SharedFile {
  /** Absolute path within the filesystem, e.g. `/main.py`. */
  path: string
  text: string
}

export interface SharePayload {
  files: SharedFile[]
  /** The file to open in the editor. */
  open: string
  /** The learning book this file is an exercise of, when the book is online. */
  book?: SharedBookContext
  /** The files *are* a learning book (shared by its author from edit mode). */
  isBook?: boolean
}

/**
 * Where a shared exercise file belongs: an online learning book and one of its
 * activities. The recipient can then open the code inside that book.
 */
export interface SharedBookContext {
  /** The book's public address — what `?book=` would name. */
  url: string
  /** A simple learning book (numbered .py files), not a book.json. */
  simple: boolean
  /** The activity's id. */
  activity: string
  /** For the recipient's question: the book's and the activity's names. */
  title?: string
  activityTitle?: string
}

function readBookContext(value: unknown): SharedBookContext | undefined {
  const data = value as Partial<SharedBookContext> | null
  if (!data || typeof data.url !== 'string' || typeof data.activity !== 'string') return undefined
  if (!/^https?:\/\//i.test(data.url)) return undefined
  return {
    url: data.url,
    simple: data.simple === true,
    activity: data.activity,
    title: typeof data.title === 'string' ? data.title : undefined,
    activityTitle: typeof data.activityTitle === 'string' ? data.activityTitle : undefined,
  }
}

// ── Payload encoding ────────────────────────────────────────────────────────

async function pipeThrough(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const writer = stream.writable.getWriter()
  void writer.write(bytes).catch(() => { /* surfaced by the reader */ })
  void writer.close().catch(() => { /* surfaced by the reader */ })
  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  const out = new Uint8Array(new ArrayBuffer(total))
  let offset = 0
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length }
  return out
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * The text that goes after `#share=`.
 *
 * `deflate` rather than `deflate-raw`: six bytes longer, and supported by every
 * runtime that has CompressionStream at all.
 */
export async function encodeSharePayload(payload: SharePayload): Promise<string> {
  const json = JSON.stringify({
    v: PAYLOAD_VERSION,
    files: payload.files.map(f => [f.path, f.text]),
    open: payload.open,
    ...(payload.book ? { book: payload.book } : {}),
    ...(payload.isBook ? { isBook: true } : {}),
  })
  const compressed = await pipeThrough(new TextEncoder().encode(json), new CompressionStream('deflate'))
  return toBase64Url(compressed)
}

/** Reads what `encodeSharePayload` wrote. Throws on anything else. */
export async function decodeSharePayload(encoded: string): Promise<SharePayload> {
  let parsed: unknown
  try {
    const bytes = await pipeThrough(fromBase64Url(encoded.trim()), new DecompressionStream('deflate'))
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error('The link is damaged — part of it may have been cut off when it was copied.')
  }
  const data = parsed as { v?: unknown; files?: unknown; open?: unknown }
  if (data?.v !== PAYLOAD_VERSION) {
    throw new Error('The link was made by a newer version of Coder. Reload the page and try again.')
  }
  if (!Array.isArray(data.files) || data.files.length === 0) throw new Error('The link holds no files.')
  const files: SharedFile[] = []
  for (const entry of data.files) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || typeof entry[1] !== 'string') {
      throw new Error('The link is damaged.')
    }
    const path = normaliseSharedPath(entry[0])
    if (!path) throw new Error('The link is damaged.')
    files.push({ path, text: entry[1] })
  }
  const open = typeof data.open === 'string' ? normaliseSharedPath(data.open) : null
  const extra = data as { book?: unknown; isBook?: unknown }
  return {
    files,
    open: open && files.some(f => f.path === open) ? open : files[0].path,
    ...(readBookContext(extra.book) ? { book: readBookContext(extra.book) } : {}),
    ...(extra.isBook === true ? { isBook: true } : {}),
  }
}

/**
 * `/a/b.py` from whatever a link or archive says. Null for a path that tries
 * to climb out of the filesystem or names nothing.
 */
export function normaliseSharedPath(path: string): string | null {
  const parts = path.replace(/\\/g, '/').split('/').filter(p => p && p !== '.')
  if (parts.length === 0 || parts.includes('..')) return null
  return '/' + parts.join('/')
}

// ── Links ───────────────────────────────────────────────────────────────────

function siteBase(): string {
  return `${location.origin}${location.pathname}`
}

export async function buildEmbeddedShareLink(payload: SharePayload): Promise<string> {
  return `${siteBase()}#share=${await encodeSharePayload(payload)}`
}

/** A link that opens code kept at a public address. */
export function buildHostedShareLink(
  resourceUrl: string, opts: { name?: string; book?: SharedBookContext | null } = {},
): string {
  // encodeURIComponent, as buildShareLink does: the reader double-decodes.
  const parts = [`filesystem=${encodeURIComponent(resourceUrl)}`]
  if (opts.name) parts.push(`name=${encodeURIComponent(opts.name)}`)
  if (opts.book) {
    parts.push(`inbook=${encodeURIComponent(opts.book.url)}`, `activity=${encodeURIComponent(opts.book.activity)}`)
    if (opts.book.simple) parts.push('inbooksimple=1')
  }
  return `${siteBase()}?${parts.join('&')}`
}

/** The book context a `?filesystem=` link carries, if any. */
export function readHostedBookContext(search: string): SharedBookContext | null {
  const params = new URLSearchParams(search)
  const url = params.get('inbook')
  const activity = params.get('activity')
  if (!url || !activity) return null
  return readBookContext({
    url: decodeURIComponent(url),
    activity: decodeURIComponent(activity),
    simple: params.get('inbooksimple') === '1',
  }) ?? null
}

/** The payload of a `#share=` fragment, or null when the fragment is something else. */
export function readShareFragment(hash: string): string | null {
  const match = /^#?share=(.+)$/.exec(hash)
  return match ? match[1] : null
}

export type UrlShareVerdict =
  | { ok: true; length: number; long: boolean }
  | { ok: false; length: number; reason: string }

/** Whether a finished `#share=` link is short enough to hand out. */
export function judgeShareLinkLength(link: string): UrlShareVerdict {
  const length = link.length
  if (length > URL_SHARE_MAX) {
    return {
      ok: false, length,
      reason: `Too long for a link — ${length.toLocaleString('en-GB')} characters (the limit is ${URL_SHARE_MAX.toLocaleString('en-GB')}).`,
    }
  }
  return { ok: true, length, long: length > URL_SHARE_SOFT_LIMIT }
}

// ── Content ─────────────────────────────────────────────────────────────────

/**
 * Whether a file's bytes are text a link can carry: valid UTF-8 with no NUL.
 * Images, sounds and the like are not, and a link cannot hold them.
 */
export function isTextContent(content: ArrayBuffer): boolean {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(content)
    return !text.includes('\0')
  } catch {
    return false
  }
}

/**
 * A short digest of a set of files, used to tell whether shared code has
 * changed since a recipient's copy was made. FNV-1a, as `simpleBookIdPrefix`.
 */
export function sharedFilesDigest(files: Map<string, ArrayBuffer>): string {
  let hash = 0x811c9dc5
  const step = (byte: number) => {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  for (const path of [...files.keys()].sort()) {
    for (let i = 0; i < path.length; i++) step(path.charCodeAt(i) & 0xff)
    step(0)
    const bytes = new Uint8Array(files.get(path)!)
    for (let i = 0; i < bytes.length; i++) step(bytes[i])
    step(0)
  }
  return hash.toString(36)
}

/** A shared link's payload as the file map the filesystem importer takes. */
export function payloadFileMap(payload: SharePayload): Map<string, ArrayBuffer> {
  const encoder = new TextEncoder()
  return new Map(payload.files.map(f => [f.path, encoder.encode(f.text).buffer as ArrayBuffer]))
}
