// ── Reading code someone has shared ─────────────────────────────────────────
//
// One function answers "what files are at this address?" for both ends of a
// share: the wizard checks a Gist / Drive / repository address with it before
// handing out a link, and the recipient's `?filesystem=` load uses it to open
// that link. Because both go through the same code, a link the wizard has
// checked is a link that opens.
//
// An address holds one of three things:
//   * a ZIP (recognised by its bytes, not its name — Drive's addresses have none);
//   * a GitHub folder (a repository or tree address), listed then fetched raw;
//   * a single text file.

import { fetchResourceBufferOptional } from './bookSource'
import { normaliseSharedPath } from './codeShare'
import { gitHubRawUrl, listRepoFilesRecursive, parseGitHubLocation } from './githubRepo'
import { looksLikeWebPage } from './simpleBook'

export const SHARED_MAX_FILES = 200
export const SHARED_MAX_BYTES = 20 * 1024 * 1024

export type SharedResourceProblem = 'not-found' | 'web-page' | 'unreachable' | 'empty' | 'too-large'

/** Why an address could not be read, in words a student can act on. */
export class SharedResourceError extends Error {
  constructor(readonly problem: SharedResourceProblem, message: string) {
    super(message)
    this.name = 'SharedResourceError'
  }
}

export interface SharedFiles {
  kind: 'zip' | 'folder' | 'file'
  /** Absolute path → content. */
  files: Map<string, ArrayBuffer>
}

/**
 * Convert a Google Drive share address to its direct-download address.
 *   https://drive.google.com/file/d/<ID>/view?usp=sharing  ->  uc?export=download&id=<ID>
 *   https://drive.google.com/open?id=<ID>                  ->  uc?export=download&id=<ID>
 */
export function driveDirectUrl(shareUrl: string): string | null {
  let host = ''
  try { host = new URL(shareUrl.trim()).hostname.toLowerCase() } catch { return null }
  if (!/(^|\.)(drive|docs)\.google\.com$/.test(host) && host !== 'drive.usercontent.google.com') return null
  const m = shareUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || shareUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : null
}

export function isZip(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes.slice(0, 2))
  return head[0] === 0x50 && head[1] === 0x4b // "PK"
}

/** The name a single shared file is given: `name`, else the address's own, else main.py. */
export function sharedFileName(url: string, name?: string): string {
  const clean = (candidate: string | undefined | null) => {
    const base = (candidate ?? '').split(/[\\/]/).pop()?.trim() ?? ''
    return /^[^<>:"|?*\0]+\.[A-Za-z0-9]+$/.test(base) ? base : ''
  }
  const given = clean(name)
  if (given) return given
  let last = ''
  try { last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '') } catch { /* keep '' */ }
  return clean(last) || 'main.py'
}

export async function fetchOne(url: string): Promise<ArrayBuffer> {
  let buffer: ArrayBuffer | null
  try {
    buffer = await fetchResourceBufferOptional(url)
  } catch {
    throw new SharedResourceError('unreachable',
      'Could not reach that address. Check your connection, and that the address is complete.')
  }
  if (!buffer) {
    throw new SharedResourceError('not-found',
      'Nothing was found at that address (404). Check it is public and has not been renamed or deleted.')
  }
  return buffer
}

export async function unpackZip(buffer: ArrayBuffer): Promise<Map<string, ArrayBuffer>> {
  const { default: JSZip } = await import('jszip')
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>
  try { zip = await JSZip.loadAsync(buffer) } catch {
    throw new SharedResourceError('empty', 'That ZIP could not be opened — it may be damaged or only partly uploaded.')
  }
  const names = Object.keys(zip.files).filter(n => !zip.files[n].dir && !n.startsWith('__MACOSX'))
  // One folder around everything (what zipping a folder produces) is dropped.
  const first = names[0]?.indexOf('/') ?? -1
  const prefix = first > 0 && names.every(n => n.startsWith(names[0].slice(0, first + 1)))
    ? names[0].slice(0, first + 1) : ''
  const files = new Map<string, ArrayBuffer>()
  let bytes = 0
  for (const name of names) {
    const path = normaliseSharedPath(name.slice(prefix.length))
    if (!path) continue
    if (files.size >= SHARED_MAX_FILES) throw tooLarge()
    const content = await zip.files[name].async('arraybuffer')
    bytes += content.byteLength
    if (bytes > SHARED_MAX_BYTES) throw tooLarge()
    files.set(path, content)
  }
  return files
}

function tooLarge(): SharedResourceError {
  return new SharedResourceError('too-large',
    `That is more than Coder will open from a link (${SHARED_MAX_FILES} files or ${SHARED_MAX_BYTES / 1024 / 1024} MB).`)
}

/**
 * The files at a shared address. Throws a `SharedResourceError` saying why
 * when there are none to be had.
 */
export async function fetchSharedFiles(
  rawUrl: string, opts: { name?: string; token?: string } = {},
): Promise<SharedFiles> {
  const url = driveDirectUrl(rawUrl) ?? rawUrl.trim()

  const github = parseGitHubLocation(url)
  if (github && !github.isFile) {
    let paths: string[]
    try {
      paths = await listRepoFilesRecursive(github, opts.token ?? '')
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      throw new SharedResourceError(/not found/i.test(message) ? 'not-found' : 'unreachable', message)
    }
    if (paths.length === 0) throw new SharedResourceError('empty', 'That folder is empty.')
    if (paths.length > SHARED_MAX_FILES) throw tooLarge()
    const base = { ...github, branch: github.branch ?? 'HEAD' }
    const prefix = github.path ? `${github.path.replace(/\/+$/, '')}/` : ''
    const contents = await Promise.all(paths.map(path => fetchOne(gitHubRawUrl(base, prefix + path))))
    const files = new Map<string, ArrayBuffer>()
    let bytes = 0
    paths.forEach((path, i) => {
      bytes += contents[i].byteLength
      const clean = normaliseSharedPath(path)
      if (clean) files.set(clean, contents[i])
    })
    if (bytes > SHARED_MAX_BYTES) throw tooLarge()
    return { kind: 'folder', files }
  }

  const buffer = await fetchOne(url)
  if (buffer.byteLength > SHARED_MAX_BYTES) throw tooLarge()
  if (isZip(buffer)) {
    const files = await unpackZip(buffer)
    if (files.size === 0) throw new SharedResourceError('empty', 'That ZIP has no files in it.')
    return { kind: 'zip', files }
  }
  if (looksLikeWebPage(buffer)) {
    throw new SharedResourceError('web-page', driveDirectUrl(rawUrl)
      ? 'Google Drive sent back a web page instead of the file — usually a sign-in page, because the file is not shared with "Anyone with the link". School accounts often do not allow that; if yours does not, use GitHub instead.'
      : 'That address sent back a web page, not code. Use the address of the file itself (on GitHub, the one the Raw button opens).')
  }
  return { kind: 'file', files: new Map([[`/${sharedFileName(url, opts.name)}`, buffer]]) }
}

/** "main.py (42 lines)" / "4 files: main.py, data.txt, …" — what the wizard says it found. */
export function describeSharedFiles(files: Map<string, ArrayBuffer>): string {
  const paths = [...files.keys()].map(p => p.slice(1))
  if (paths.length === 1) {
    const text = new TextDecoder().decode(files.get(`/${paths[0]}`)!)
    const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
    return `${paths[0]} (${lines} line${lines === 1 ? '' : 's'})`
  }
  const shown = paths.slice(0, 4).join(', ')
  return `${paths.length} files: ${shown}${paths.length > 4 ? ', …' : ''}`
}

/** Whether two sets of files hold the same paths with the same bytes. */
export function sameSharedFiles(a: Map<string, ArrayBuffer>, b: Map<string, ArrayBuffer>): boolean {
  if (a.size !== b.size) return false
  for (const [path, content] of a) {
    const other = b.get(path)
    if (!other || other.byteLength !== content.byteLength) return false
    const x = new Uint8Array(content)
    const y = new Uint8Array(other)
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false
  }
  return true
}

/** A ZIP of a file map, laid out as the filesystem is (no folder around it). */
export async function zipFileMap(files: Map<string, ArrayBuffer>): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const [path, content] of files) zip.file(path.replace(/^\/+/, ''), content)
  return zip.generateAsync({ type: 'blob' })
}
