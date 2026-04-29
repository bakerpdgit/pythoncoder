import type { BookAdditionalFile, BookChild, BookChallenge, BookManifest, BookRef } from '../types'
import { listFilesystems, createFilesystem, writeFile, guessMimeType, deleteFilesystem } from './virtualFS'

export const BOOK_FS_PREFIX = '__book__:'
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
  return new URL(relative, base).href
}

export async function fetchBookManifest(url: string): Promise<BookManifest> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Cannot load book.json from ${url}: HTTP ${resp.status}`)
  return resp.json() as Promise<BookManifest>
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

export function getChallengeFsName(challengeId: string): string {
  return `${BOOK_FS_PREFIX}${challengeId}`
}

async function fetchFileIntoFs(
  fsId: string,
  baseUrl: string,
  relPath: string,
  mime: string
): Promise<boolean> {
  const url = resolveBookUrl(baseUrl, relPath)
  try {
    const resp = await fetch(url)
    if (!resp.ok) return false
    const content = await resp.arrayBuffer()
    await writeFile(fsId, `/${relPath}`, content, mime)
    return true
  } catch { return false }
}

export async function getOrCreateChallengeFs(
  bookUrl: string,
  challenge: BookChallenge,
  forceReset = false
): Promise<{ fsId: string; pyFilename: string | null; hiddenPaths: string[] }> {
  const fsName = getChallengeFsName(challenge.id)
  const fsList = await listFilesystems()

  if (!forceReset) {
    const existing = fsList.find(f => f.name === fsName)
    if (existing) {
      return {
        fsId: existing.id,
        pyFilename: challenge.py ? normPath(challenge.py) : null,
        hiddenPaths: getHiddenPathsForFs(existing.id),
      }
    }
  } else {
    const existing = fsList.find(f => f.name === fsName)
    if (existing) await deleteFilesystem(existing.id)
  }

  const fsId = await createFilesystem(fsName)
  const baseUrl = bookUrl.endsWith('/') ? bookUrl : bookUrl.slice(0, bookUrl.lastIndexOf('/') + 1)
  const hiddenPaths: string[] = []

  if (challenge.py) {
    const rel = normPath(challenge.py)
    await fetchFileIntoFs(fsId, baseUrl, rel, 'text/x-python')
  }

  for (const af of (challenge.additionalFiles ?? []) as BookAdditionalFile[]) {
    const rel = normPath(af.filename)
    const mime = guessMimeType(rel)
    const ok = await fetchFileIntoFs(fsId, baseUrl, rel, mime)
    if (ok && !af.visible) hiddenPaths.push(`/${rel}`)
  }

  const map = getStoredHidden()
  map[fsId] = hiddenPaths
  saveStoredHidden(map)

  return { fsId, pyFilename: challenge.py ? normPath(challenge.py) : null, hiddenPaths }
}

export async function fetchGuideContent(bookUrl: string, guide: string): Promise<string> {
  const baseUrl = bookUrl.endsWith('/') ? bookUrl : bookUrl.slice(0, bookUrl.lastIndexOf('/') + 1)
  const url = resolveBookUrl(baseUrl, normPath(guide))
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Cannot load guide: HTTP ${resp.status}`)
  return resp.text()
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
