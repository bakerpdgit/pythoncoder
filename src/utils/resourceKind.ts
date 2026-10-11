// ── What an address holds ───────────────────────────────────────────────────
//
// Opening from the web, and checking a teacher's link, both go by one rule:
//   * a `book.json` → a learning book;
//   * otherwise a `01.py` → a simple learning book;
//   * otherwise → plain files, opened as a filesystem.
// Nobody ticks a box to say which. A GitHub folder is asked for its two
// marker files by raw address (no API, so no rate limit); a ZIP is fetched once
// and looked inside; anything else is a single file.

import { fetchResourceBufferOptional, normalizeGitHubUrl } from './bookSource'
import { gitHubRawUrl, parseGitHubLocation } from './githubRepo'
import {
  driveDirectUrl, fetchOne, fetchSharedFiles, isZip, sharedFileName, SharedResourceError, unpackZip,
} from './sharedResource'
import { looksLikeWebPage } from './simpleBook'

export type ResourceKind =
  /** A book.json at an http address: open it as it is. */
  | { kind: 'book'; url: string }
  /** A ZIP whose files hold a book.json: unpacked into a filesystem named by the address. */
  | { kind: 'zip-book'; url: string; files: Map<string, ArrayBuffer> }
  /** A folder or ZIP of numbered exercises: `simplebook:<source>`. */
  | { kind: 'simple'; source: string }
  /** Anything else: files to open as a filesystem. */
  | { kind: 'files'; url: string; files: Map<string, ArrayBuffer> }

export function isBookJsonUrl(url: string): boolean {
  return url.trim().toLowerCase().split(/[?#]/)[0].endsWith('book.json')
}

async function exists(url: string): Promise<boolean> {
  const payload = await fetchResourceBufferOptional(url).catch(() => null)
  return !!payload && !looksLikeWebPage(payload)
}

/** Whether a set of files is a book, a simple book, or neither. */
export function kindOfFiles(files: Map<string, ArrayBuffer>): 'book' | 'simple' | 'files' {
  if (files.has('/book.json')) return 'book'
  if (files.has('/01.py')) return 'simple'
  return 'files'
}

/**
 * Work out what is at an address. Throws a `SharedResourceError` saying why
 * when nothing can be read there.
 */
export async function detectResourceKind(rawUrl: string, opts: { token?: string } = {}): Promise<ResourceKind> {
  const url = driveDirectUrl(rawUrl) ?? rawUrl.trim()
  if (isBookJsonUrl(url)) return { kind: 'book', url: normalizeGitHubUrl(url) }

  const github = parseGitHubLocation(url)
  if (github && !github.isFile) {
    const inFolder = (name: string) => gitHubRawUrl(github, [github.path, name].filter(Boolean).join('/'))
    if (await exists(inFolder('book.json'))) return { kind: 'book', url: inFolder('book.json') }
    if (await exists(inFolder('01.py'))) return { kind: 'simple', source: url }
    return { kind: 'files', url, files: (await fetchSharedFiles(url, opts)).files }
  }

  const buffer = await fetchOne(url)
  if (isZip(buffer)) {
    const files = await unpackZip(buffer)
    if (files.size === 0) throw new SharedResourceError('empty', 'That ZIP has no files in it.')
    const kind = kindOfFiles(files)
    if (kind === 'book') return { kind: 'zip-book', url, files }
    if (kind === 'simple') return { kind: 'simple', source: url }
    return { kind: 'files', url, files }
  }
  if (looksLikeWebPage(buffer)) {
    throw new SharedResourceError('web-page', driveDirectUrl(rawUrl)
      ? 'Google Drive sent back a web page instead of the file — usually a sign-in page, because it is not shared with "Anyone with the link".'
      : 'That address sent back a web page, not code or a ZIP. On GitHub, use the repository or folder address, or a file\'s Raw address.')
  }
  return { kind: 'files', url, files: new Map([[`/${sharedFileName(url)}`, buffer]]) }
}
