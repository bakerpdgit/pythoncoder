import type { BookAdditionalFile, BookChild, BookChallenge, BookManifest, BookRef, BreadcrumbEntry } from '../types'
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

export interface FirstBookChallengeTarget {
  bookUrl: string
  breadcrumb: BreadcrumbEntry[]
  challenge: BookChallenge
}

/** Find the first enterable example/activity in book order, including sub-books. */
export async function findFirstBookChallenge(
  rootBookUrl: string,
  loadManifest: (url: string) => Promise<BookManifest> = fetchBookManifest,
): Promise<FirstBookChallengeTarget | null> {
  const visited = new Set<string>()

  const visit = async (
    bookUrl: string,
    breadcrumb: BreadcrumbEntry[],
  ): Promise<FirstBookChallengeTarget | null> => {
    if (visited.has(bookUrl)) return null
    visited.add(bookUrl)

    const manifest = await loadManifest(bookUrl)
    for (const child of manifest.children) {
      if (!isBookRef(child)) return { bookUrl, breadcrumb, challenge: child }

      const childUrl = resolveBookUrl(bookUrl, child.bookLink)
      const target = await visit(
        childUrl,
        [...breadcrumb, { name: child.name, bookUrl }],
      )
      if (target) return target
    }
    return null
  }

  return visit(rootBookUrl, [])
}

/**
 * Where a `?challenge=<id>` link resolved to inside a book tree. `sectionPath`
 * is the ids of the sub-books traversed to reach it, outermost first, which
 * lets a contents tree expand down to the target.
 */
export type BookTarget =
  | { kind: 'challenge'; bookUrl: string; breadcrumb: BreadcrumbEntry[]; sectionPath: string[]; challenge: BookChallenge }
  | { kind: 'section'; bookUrl: string; breadcrumb: BreadcrumbEntry[]; sectionPath: string[] }

/**
 * Resolve an id from a student link against a whole book tree: an activity id
 * enters that activity, a sub-book's id opens that section's contents.
 *
 * Ids are not guaranteed unique across a tree (and are already assumed unique
 * by `getChallengeFsName`), so this takes the first depth-first match.
 */
export async function findBookTargetById(
  rootBookUrl: string,
  id: string,
  loadManifest: (url: string) => Promise<BookManifest> = fetchBookManifest,
): Promise<BookTarget | null> {
  const visited = new Set<string>()

  const visit = async (
    bookUrl: string,
    breadcrumb: BreadcrumbEntry[],
    sectionPath: string[],
  ): Promise<BookTarget | null> => {
    if (visited.has(bookUrl)) return null
    visited.add(bookUrl)

    const manifest = await loadManifest(bookUrl)
    for (const child of manifest.children) {
      if (!isBookRef(child)) {
        if (child.id === id) return { kind: 'challenge', bookUrl, breadcrumb, sectionPath, challenge: child }
        continue
      }

      const childUrl = resolveBookUrl(bookUrl, child.bookLink)
      const childBreadcrumb = [...breadcrumb, { name: child.name, bookUrl }]
      const childSectionPath = [...sectionPath, child.id]
      if (child.id === id) {
        return { kind: 'section', bookUrl: childUrl, breadcrumb: childBreadcrumb, sectionPath }
      }

      const target = await visit(childUrl, childBreadcrumb, childSectionPath)
      if (target) return target
    }
    return null
  }

  return visit(rootBookUrl, [], [])
}

/**
 * The public URL a book root came from, or null when it only exists in this
 * browser. A book unzipped from a URL keeps that URL as its filesystem name
 * (see `loadFilesystemFromUrl`), so it is still shareable; a locally authored
 * or locally imported book is not.
 */
export async function resolveBookShareSource(rootUrl: string): Promise<string | null> {
  if (/^https?:\/\//i.test(rootUrl)) return rootUrl
  if (!isVfsUrl(rootUrl)) return null
  const { fsId } = parseVfsUrl(rootUrl)
  const fs = (await listFilesystems()).find(f => f.id === fsId)
  return fs && /^https?:\/\//i.test(fs.name) ? fs.name : null
}

function normPath(p: string): string {
  return p.replace(/^\.\//, '').replace(/^\//, '')
}

/**
 * Where a file a challenge declares lands inside its challenge filesystem. Any
 * `../` is dropped: the exercise still does a plain `import fp_utils`, so a
 * shared module from higher up the book has to sit beside the exercise.
 */
function challengeFilePath(p: string): string {
  return normPath(p).replace(/^(?:\.\.\/)+/, '')
}

function bookDirUrl(bookUrl: string): string {
  return bookUrl.endsWith('/') ? bookUrl : bookUrl.slice(0, bookUrl.lastIndexOf('/') + 1)
}

/**
 * Directories to look in for a file a challenge declares, nearest first: the
 * sub-book holding the activity, then each enclosing book up to the root.
 *
 * Books routinely keep one shared helper module at the top and import it from
 * activities several sections down (tutorial 4's `fp_utils.py`), declaring it
 * as a bare `"fp_utils.py"`. Resolving that against the sub-book alone 404s,
 * and the whole activity then fails to open. The walk is expressed as candidate
 * *directories* rather than `../` because a book unzipped into the virtual
 * filesystem resolves URLs by string concatenation, where `../` means nothing.
 */
export function bookFileBaseUrls(bookUrl: string, rootBookUrl?: string | null): string[] {
  const base = bookDirUrl(bookUrl)
  const bases = [base]
  const root = rootBookUrl ? bookDirUrl(rootBookUrl) : null
  if (!root || !base.startsWith(root)) return bases
  let dir = base
  while (dir.length > root.length) {
    const cut = dir.lastIndexOf('/', dir.length - 2)
    if (cut === -1) break
    dir = dir.slice(0, cut + 1)
    bases.push(dir)
  }
  return bases
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
  bases: string[],
  relPath: string,
  mime: string
): Promise<boolean> {
  for (const base of bases) {
    const url = resolveBookUrl(base, relPath)
    try {
      if (isVfsUrl(url)) {
        const { fsId: srcFsId, path } = parseVfsUrl(url)
        const entry = await getEntryByPath(srcFsId, path)
        if (!entry?.content) continue
        await writeFile(fsId, `/${relPath}`, entry.content, mime)
        return true
      }
      const content = await fetchResourceBuffer(url)
      await writeFile(fsId, `/${relPath}`, content, mime)
      return true
    } catch { /* fall back to the enclosing book directory */ }
  }
  return false
}

/**
 * A challenge filesystem is named `__book__:<id>` or `__book__:<id>:<display
 * name>` — the display name was added later, so both forms are in the wild and
 * anything matching on the name has to accept either.
 */
export function isChallengeFsName(fsName: string, challengeId: string): boolean {
  const prefix = BOOK_FS_PREFIX + challengeId
  return fsName === prefix || fsName.startsWith(prefix + ':')
}

function findExistingChallengeFs(fsList: Array<{ id: string; name: string }>, challengeId: string) {
  return fsList.find(f => isChallengeFsName(f.name, challengeId))
}

/** Every activity/example id in a book tree, in book order, sub-books included. */
export async function collectBookChallengeIds(
  rootBookUrl: string,
  loadManifest: (url: string) => Promise<BookManifest> = fetchBookManifest,
): Promise<string[]> {
  const visited = new Set<string>()
  const ids: string[] = []

  const visit = async (bookUrl: string): Promise<void> => {
    if (visited.has(bookUrl)) return
    visited.add(bookUrl)
    let manifest: BookManifest
    // A sub-book that no longer loads must not abort the whole walk: the rest
    // of the book still has work to reset.
    try { manifest = await loadManifest(bookUrl) } catch { return }
    for (const child of manifest.children) {
      if (!isBookRef(child)) { ids.push(child.id); continue }
      await visit(resolveBookUrl(bookUrl, child.bookLink))
    }
  }

  await visit(rootBookUrl)
  return ids
}

/**
 * Throw away the saved work for the given activities. Returns how many
 * filesystems were deleted. The next visit to each activity re-creates it from
 * the book's own files.
 */
export async function deleteChallengeFilesystems(challengeIds: string[]): Promise<number> {
  if (!challengeIds.length) return 0
  const wanted = new Set(challengeIds)
  const doomed = (await listFilesystems())
    .filter(f => f.name.startsWith(BOOK_FS_PREFIX) &&
      [...wanted].some(id => isChallengeFsName(f.name, id)))
  for (const fs of doomed) await deleteFilesystem(fs.id)
  return doomed.length
}

async function challengeFsIsComplete(fsId: string, challenge: BookChallenge): Promise<boolean> {
  const expectedPaths = [
    challenge.py,
    ...(challenge.additionalFiles ?? []).map(file => file.filename),
  ].filter((path): path is string => !!path).map(path => `/${challengeFilePath(path)}`)

  for (const path of expectedPaths) {
    const entry = await getEntryByPath(fsId, path)
    if (entry?.type !== 'file' || entry.content === undefined) return false
  }
  return true
}

/**
 * A Parsons challenge's `py` file *is* the answer, in order. It has to live in
 * the challenge filesystem (that is where the puzzle is re-parsed from on every
 * re-entry), so hide it from the file browser instead.
 */
function parsonsHiddenPaths(challenge: BookChallenge): string[] {
  return challenge.typ === 'parsons' && challenge.py
    ? [`/${challengeFilePath(challenge.py)}`]
    : []
}

export async function getOrCreateChallengeFs(
  bookUrl: string,
  rootBookUrl: string,
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
          pyFilename: challenge.py ? challengeFilePath(challenge.py) : null,
          hiddenPaths: Array.from(new Set([...getHiddenPathsForFs(existing.id), ...parsonsHiddenPaths(challenge)])),
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
  const bases = bookFileBaseUrls(bookUrl, rootBookUrl)
  const hiddenPaths: string[] = parsonsHiddenPaths(challenge)

  try {
    if (challenge.py) {
      const rel = challengeFilePath(challenge.py)
      if (!(await fetchFileIntoFs(fsId, bases, rel, 'text/x-python'))) {
        throw new Error(`Could not load the exercise file "${rel}"`)
      }
    }

    for (const af of (challenge.additionalFiles ?? []) as BookAdditionalFile[]) {
      const rel = challengeFilePath(af.filename)
      const mime = guessMimeType(rel)
      const ok = await fetchFileIntoFs(fsId, bases, rel, mime)
      if (!ok) throw new Error(`Could not load the exercise file "${rel}"`)
      if (!af.visible) hiddenPaths.push(`/${rel}`)
    }

    const map = getStoredHidden()
    map[fsId] = hiddenPaths
    saveStoredHidden(map)

    return { fsId, pyFilename: challenge.py ? challengeFilePath(challenge.py) : null, hiddenPaths }
  } catch (error) {
    // Failed loads must not be reused as valid but empty challenge workspaces.
    await deleteFilesystem(fsId).catch(() => undefined)
    throw error
  }
}

export async function fetchGuideContent(bookUrl: string, guide: string, rootBookUrl?: string | null): Promise<string> {
  const rel = challengeFilePath(guide)
  let lastError: unknown = null
  for (const base of bookFileBaseUrls(bookUrl, rootBookUrl)) {
    const url = resolveBookUrl(base, rel)
    try {
      if (isVfsUrl(url)) {
        const { fsId, path } = parseVfsUrl(url)
        const entry = await getEntryByPath(fsId, path)
        if (!entry?.content) throw new Error(`Cannot load guide from VFS: ${url}`)
        return new TextDecoder().decode(entry.content)
      }
      return await fetchResourceText(url)
    } catch (e) { lastError = e }
  }
  throw lastError instanceof Error ? lastError : new Error(`Could not load the guide "${rel}"`)
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
