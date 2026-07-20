import type { BookAdditionalFile, BookChild, BookChallenge, BookManifest, BookRef } from '../types'
import { listFilesystems, createFilesystem, writeFile, guessMimeType, deleteFilesystem, getEntryByPath } from './virtualFS'
import { fetchResourceBuffer, fetchResourceText } from './bookSource'

function isVfsUrl(url: string): boolean {
  return url.startsWith('vfs://fs:')
}

function parseVfsUrl(url: string): { fsId: string; path: string } {
  const inner = url.slice('vfs://fs:'.length)
  const slash = inner.indexOf('/')
  if (slash === -1) return { fsId: inner, path: '/' }
  return { fsId: inner.slice(0, slash), path: inner.slice(slash) }
}

export const BOOK_FS_PREFIX = '__book__:'
export const BOOK_SRC_PREFIX = '__booksrc__:'
const HIDDEN_KEY = 'pythoncoder-book-hidden'

export function isBookRef(child: BookChild): child is BookRef {
  return 'bookLink' in child
}

export function isBookUrl(url: string): boolean {
  const u = url.trim().toLowerCase().split('?')[0]
  return u.endsWith('book.json')
}

export function resolveBookUrl(baseUrl: string, relative: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl.slice(0, baseUrl.lastIndexOf('/') + 1)
  if (base.startsWith('vfs://')) {
    return base + relative.replace(/^\.\//, '')
  }
  return new URL(relative, base).href
}

export async function fetchBookManifest(url: string): Promise<BookManifest> {
  if (isVfsUrl(url)) {
    const { fsId, path } = parseVfsUrl(url)
    const entry = await getEntryByPath(fsId, path)
    if (!entry?.content) throw new Error(`Cannot load book.json from VFS: ${url}`)
    return JSON.parse(new TextDecoder().decode(entry.content)) as BookManifest
  }
  const text = await fetchResourceText(url)
  try {
    return JSON.parse(text) as BookManifest
  } catch {
    throw new Error(`Cannot parse book.json from ${url}`)
  }
}

function normPath(p: string): string {
  return p.replace(/^\.\//, '').replace(/^\//, '')
}

function getStoredHidden(): Record<string, string[]> {
  try {
    const s = localStorage.getItem(HIDDEN_KEY)
    return s ? (JSON.parse(s) as Record<string, string[]>) : {}
  } catch { return {} }
}

function saveStoredHidden(map: Record<string, string[]>) {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(map)) } catch { /* ignore */ }
}

export function getHiddenPathsForFs(fsId: string): string[] {
  return getStoredHidden()[fsId] ?? []
}

export function getChallengeFsName(challengeId: string, displayName?: string): string {
  return displayName
    ? `${BOOK_FS_PREFIX}${challengeId}:${displayName}`
    : `${BOOK_FS_PREFIX}${challengeId}`
}

export function getBookFsDisplayName(fsName: string): string {
  if (!fsName.startsWith(BOOK_FS_PREFIX)) return fsName
  const inner = fsName.slice(BOOK_FS_PREFIX.length)
  const colon = inner.indexOf(':')
  return colon === -1 ? inner : inner.slice(colon + 1)
}

async function fetchFileIntoFs(
  fsId: string,
  baseUrl: string,
  relPath: string,
  mime: string
): Promise<boolean> {
  const url = resolveBookUrl(baseUrl, relPath)
  try {
    if (isVfsUrl(url)) {
      const { fsId: srcFsId, path } = parseVfsUrl(url)
      const entry = await getEntryByPath(srcFsId, path)
      if (!entry?.content) return false
      await writeFile(fsId, `/${relPath}`, entry.content, mime)
      return true
    }
    const content = await fetchResourceBuffer(url)
    await writeFile(fsId, `/${relPath}`, content, mime)
    return true
  } catch { return false }
}

function findExistingChallengeFs(fsList: Array<{ id: string; name: string }>, challengeId: string) {
  const prefix = BOOK_FS_PREFIX + challengeId
  return fsList.find(f => f.name === prefix || f.name.startsWith(prefix + ':'))
}

async function challengeFsIsComplete(fsId: string, challenge: BookChallenge): Promise<boolean> {
  const expectedPaths = [
    challenge.py,
    ...(challenge.additionalFiles ?? []).map(file => file.filename),
  ].filter((path): path is string => !!path).map(path => `/${normPath(path)}`)

  for (const path of expectedPaths) {
    const entry = await getEntryByPath(fsId, path)
    if (entry?.type !== 'file' || entry.content === undefined) return false
  }
  return true
}

export async function getOrCreateChallengeFs(
  bookUrl: string,
  challenge: BookChallenge,
  forceReset = false
): Promise<{ fsId: string; pyFilename: string | null; hiddenPaths: string[] }> {
  const fsName = getChallengeFsName(challenge.id, challenge.name)
  const fsList = await listFilesystems()

  if (!forceReset) {
    const existing = findExistingChallengeFs(fsList, challenge.id)
    if (existing) {
      if (await challengeFsIsComplete(existing.id, challenge)) {
        return {
          fsId: existing.id,
          pyFilename: challenge.py ? normPath(challenge.py) : null,
          hiddenPaths: getHiddenPathsForFs(existing.id),
        }
      }
      // A transient fetch failure in an older run could leave a named but empty
      // challenge filesystem behind. Do not let that poisoned cache persist.
      await deleteFilesystem(existing.id)
    }
  } else {
    const existing = findExistingChallengeFs(fsList, challenge.id)
    if (existing) await deleteFilesystem(existing.id)
  }

  const { id: fsId } = await createFilesystem(fsName)
  const baseUrl = bookUrl.endsWith('/') ? bookUrl : bookUrl.slice(0, bookUrl.lastIndexOf('/') + 1)
  const hiddenPaths: string[] = []

  try {
    if (challenge.py) {
      const rel = normPath(challenge.py)
      if (!(await fetchFileIntoFs(fsId, baseUrl, rel, 'text/x-python'))) {
        throw new Error(`Could not load the exercise file "${rel}"`)
      }
    }

    for (const af of (challenge.additionalFiles ?? []) as BookAdditionalFile[]) {
      const rel = normPath(af.filename)
      const mime = guessMimeType(rel)
      const ok = await fetchFileIntoFs(fsId, baseUrl, rel, mime)
      if (!ok) throw new Error(`Could not load the exercise file "${rel}"`)
      if (!af.visible) hiddenPaths.push(`/${rel}`)
    }

    const map = getStoredHidden()
    map[fsId] = hiddenPaths
    saveStoredHidden(map)

    return { fsId, pyFilename: challenge.py ? normPath(challenge.py) : null, hiddenPaths }
  } catch (error) {
    // Failed loads must not be reused as valid but empty challenge workspaces.
    await deleteFilesystem(fsId).catch(() => undefined)
    throw error
  }
}

export async function fetchGuideContent(bookUrl: string, guide: string): Promise<string> {
  const baseUrl = bookUrl.endsWith('/') ? bookUrl : bookUrl.slice(0, bookUrl.lastIndexOf('/') + 1)
  const url = resolveBookUrl(baseUrl, normPath(guide))
  if (isVfsUrl(url)) {
    const { fsId, path } = parseVfsUrl(url)
    const entry = await getEntryByPath(fsId, path)
    if (!entry?.content) throw new Error(`Cannot load guide from VFS: ${url}`)
    return new TextDecoder().decode(entry.content)
  }
  return fetchResourceText(url)
}

export function findChallenge(manifest: BookManifest, challengeId: string): BookChallenge | null {
  for (const child of manifest.children) {
    if (!isBookRef(child) && child.id === challengeId) return child
  }
  return null
}

export function getChallengeIndex(manifest: BookManifest, challengeId: string): number {
  const challenges = manifest.children.filter(c => !isBookRef(c)) as BookChallenge[]
  return challenges.findIndex(c => c.id === challengeId)
}

export function getAdjacentChallenge(manifest: BookManifest, challengeId: string, delta: -1 | 1): BookChallenge | null {
  const challenges = manifest.children.filter(c => !isBookRef(c)) as BookChallenge[]
  const idx = challenges.findIndex(c => c.id === challengeId)
  if (idx === -1) return null
  return challenges[idx + delta] ?? null
}
