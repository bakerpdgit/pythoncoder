// ── Simple learning books (no book.json) ───────────────────────────────────
//
// A full learning book is a `book.json` manifest: ids, guides, test cases,
// per-file visibility. That is the right shape for a published course and quite
// the wrong shape for a teacher who has a folder of exercises and one lesson to
// give. A *simple* learning book is that folder, read as a book with no manifest
// at all:
//
//   challenge01.py            → the first activity, named "challenge01"
//   challenge01.txt           → its instructions, shown as plain text
//   challenge01_data.txt      → mounted into its filesystem as "data.txt"
//   challenge02.py            → the second activity, no instructions
//
// Activities appear in name order (numeric-aware, so challenge2 precedes
// challenge10). The folder is flat: subfolders are ignored. Nothing declares a
// test, so every activity is an example.
//
// ── How it plugs in ─────────────────────────────────────────────────────────
//
// A simple book is addressed as `simplebook:<source>`, and one of its files as
// `simplebook:<source>#<name>`. That is deliberately a URL the rest of the book
// machinery can carry around: `fetchBookManifest` synthesises the manifest,
// `resolveBookUrl` builds the file URLs, and the loader reads them out of the
// listing cache. Everything downstream — challenge filesystems, guides, student
// links, completion ticks, Reset book — then works with no branch of its own.
//
// The root URL is the source address itself, never a freshly-minted filesystem
// id, so a student's completion ticks (keyed `${rootUrl}::${challengeId}`)
// survive closing and reopening the book.

import type { BookChallenge, BookManifest } from '../types'
import { fetchResourceBuffer, MIN_PLAUSIBLE_ZIP_BYTES } from './bookSource'
import {
  gitHubRawUrl, listDirectory, parseGitHubLocation, resolveBranch, type GitHubLocation,
} from './githubRepo'
import { getStoredGitHubToken } from './storage'
import { getAllFiles, listFilesystems } from './virtualFS'

export const SIMPLE_BOOK_PREFIX = 'simplebook:'
const FILE_SEPARATOR = '#'

export function isSimpleBookUrl(url: string): boolean {
  return url.startsWith(SIMPLE_BOOK_PREFIX)
}

/** The book root URL for a source address (a repo/folder/ZIP, or a `vfs://` fs). */
export function simpleBookRootUrl(source: string): string {
  // A fragment in the source would be indistinguishable from the file separator.
  return SIMPLE_BOOK_PREFIX + source.trim().split(FILE_SEPARATOR)[0]
}

/** The source address inside a `simplebook:` root or file URL. */
export function simpleBookSource(url: string): string {
  return url.slice(SIMPLE_BOOK_PREFIX.length).split(FILE_SEPARATOR)[0]
}

export function simpleBookFileUrl(url: string, relativePath: string): string {
  return `${simpleBookRootUrl(simpleBookSource(url))}${FILE_SEPARATOR}${relativePath.replace(/^\.?\//, '')}`
}

export function isSimpleBookFileUrl(url: string): boolean {
  return isSimpleBookUrl(url) && url.includes(FILE_SEPARATOR)
}

function simpleBookFileName(url: string): string {
  return url.slice(url.indexOf(FILE_SEPARATOR) + 1)
}

// ── Reading the folder's shape ──────────────────────────────────────────────

export interface SimpleBookAdditionalFile {
  /** The file's name in the source folder, e.g. `challenge01_data.txt`. */
  sourceName: string
  /** What it is mounted as in the activity's filesystem, e.g. `data.txt`. */
  mountAs: string
}

export interface SimpleBookActivity {
  /** The `.py` file's name without its extension — the activity's title. */
  stem: string
  pyName: string
  guideName?: string
  additional: SimpleBookAdditionalFile[]
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Work out the activities in a flat list of file names.
 *
 * A `.py` file is an activity unless its name extends another activity's stem
 * with an underscore — `challenge01_utils.py` beside `challenge01.py` is that
 * activity's helper module, mounted as `utils.py`, not an activity of its own.
 * The longest matching stem wins, so a file is attached to the most specific
 * activity that could claim it.
 */
export function readSimpleBookActivities(fileNames: string[]): SimpleBookActivity[] {
  // Flat only: a name carrying a separator lives in a subfolder.
  const names = fileNames.filter(name => name && !name.includes('/'))
  const pyNames = names.filter(name => name.toLowerCase().endsWith('.py'))
  const allStems = pyNames.map(name => name.slice(0, -3))

  const claimedBy = (name: string, stems: string[]): string | null => {
    let best: string | null = null
    for (const stem of stems) {
      if (name.length > stem.length + 1 && name.startsWith(`${stem}_`)) {
        if (!best || stem.length > best.length) best = stem
      }
    }
    return best
  }

  const stems = allStems
    .filter(stem => !claimedBy(`${stem}.py`, allStems.filter(other => other !== stem)))
    .sort(compareNames)
  const stemSet = new Set(stems)

  const activities = stems.map<SimpleBookActivity>(stem => ({
    stem,
    pyName: `${stem}.py`,
    guideName: names.find(name => name === `${stem}.txt`),
    additional: [],
  }))
  const byStem = new Map(activities.map(activity => [activity.stem, activity]))

  for (const name of names) {
    if (stemSet.has(name.slice(0, -3)) && name.toLowerCase().endsWith('.py')) continue
    const owner = claimedBy(name, stems)
    if (!owner) continue
    byStem.get(owner)?.additional.push({ sourceName: name, mountAs: name.slice(owner.length + 1) })
  }
  for (const activity of activities) activity.additional.sort((a, b) => compareNames(a.mountAs, b.mountAs))

  return activities
}

/**
 * A short stable digest of the source address.
 *
 * Activity ids have to be unique across every book a student opens — the
 * challenge filesystem is named `__book__:<id>` — and a simple book has no
 * author-assigned ids at all, so two folders that each hold a `challenge01.py`
 * would otherwise share one workspace. FNV-1a over the source address keeps the
 * ids stable across sessions while telling those two folders apart.
 */
export function simpleBookIdPrefix(source: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `simple-${hash.toString(36)}-`
}

export function buildSimpleBookManifest(
  fileNames: string[],
  opts: { source: string; name: string },
): BookManifest {
  const idPrefix = simpleBookIdPrefix(opts.source)
  const children = readSimpleBookActivities(fileNames).map<BookChallenge>(activity => ({
    id: `${idPrefix}${activity.stem}`,
    name: activity.stem,
    py: activity.pyName,
    guide: activity.guideName,
    // Nothing here can declare a test, so everything is an example: reaching
    // the end of a run is what ticks it off.
    isExample: true,
    // `source` is what the folder calls the file, `filename` what the exercise
    // sees: `challenge01_data.txt` is mounted as plain `data.txt`.
    additionalFiles: activity.additional.map(file => ({
      filename: file.mountAs, visible: true, source: file.sourceName,
    })),
  }))
  return { id: idPrefix, name: opts.name, children }
}

// ── Loading a source ────────────────────────────────────────────────────────

/**
 * A source's *listing* — its name and the names of the files in it — plus a way
 * to read one of those files.
 *
 * Listing and reading are separate because the book panel, the student-link
 * picker and the contents page all need the shape of the book and none of them
 * needs its contents; downloading every exercise just to title them would make
 * opening a book as slow as opening all of it. A ZIP is the exception, since it
 * arrives whole either way.
 */
interface SimpleBookListing {
  name: string
  names: string[]
  read: (name: string) => Promise<ArrayBuffer>
}

const listingCache = new Map<string, Promise<SimpleBookListing>>()

/** Drop a cached listing so the next read re-fetches — used when a book opens. */
export function invalidateSimpleBook(url: string): void {
  listingCache.delete(simpleBookSource(url))
}

function loadListing(source: string): Promise<SimpleBookListing> {
  const cached = listingCache.get(source)
  if (cached) return cached
  const pending = fetchListing(source).catch(error => {
    listingCache.delete(source)
    throw error
  })
  listingCache.set(source, pending)
  return pending
}

async function fetchListing(source: string): Promise<SimpleBookListing> {
  if (source.startsWith('vfs://fs:')) return listFilesystemFolder(source)
  const location = parseGitHubLocation(source)
  if (location && !location.isFile) return listGitHubFolder(location)
  if (/^https?:\/\//i.test(source)) return listZip(source)
  throw new Error(
    'A simple learning book must be a public GitHub repository (or a folder inside one), a ZIP, or a folder open in this browser.')
}

/** Turn an already-materialised set of files into a listing. */
function fromFiles(name: string, files: Map<string, ArrayBuffer>): SimpleBookListing {
  return {
    name,
    names: [...files.keys()],
    read: async fileName => {
      const file = files.get(fileName)
      if (!file) throw new Error(`"${fileName}" is not in this folder.`)
      return file
    },
  }
}

async function listFilesystemFolder(source: string): Promise<SimpleBookListing> {
  const fsId = source.slice('vfs://fs:'.length).split('/')[0]
  const filesystem = (await listFilesystems()).find(entry => entry.id === fsId)
  const files = new Map<string, ArrayBuffer>()
  for (const file of await getAllFiles(fsId)) {
    const name = file.path.replace(/^\//, '')
    if (name.includes('/')) continue
    files.set(name, file.content)
  }
  return fromFiles(filesystem?.name ?? 'Exercises', files)
}

async function listGitHubFolder(rawLocation: GitHubLocation): Promise<SimpleBookListing> {
  // A teacher's stored token raises their own rate limit; a student has none and
  // falls back to jsDelivr's listing if GitHub's API is exhausted.
  const token = getStoredGitHubToken()
  const location = await resolveBranch(rawLocation, token)
  const entries = await listDirectory(location, token)
  const reads = new Map<string, Promise<ArrayBuffer>>()
  return {
    name: location.path.split('/').filter(Boolean).pop() ?? location.repo,
    names: entries.filter(entry => entry.type === 'file').map(entry => entry.name),
    // Memoised so re-entering an activity (which re-reads its guide) does not
    // go back to the network for a file this session already has.
    read: name => {
      const pending = reads.get(name)
      if (pending) return pending
      const path = [location.path, name].filter(Boolean).join('/')
      const fetching = fetchResourceBuffer(gitHubRawUrl(location, path))
        .catch(error => { reads.delete(name); throw error })
      reads.set(name, fetching)
      return fetching
    },
  }
}

async function listZip(source: string): Promise<SimpleBookListing> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await fetchResourceBuffer(source, { minBytes: MIN_PLAUSIBLE_ZIP_BYTES }))
  const entries = Object.values(zip.files).filter(file => !file.dir && !file.name.startsWith('__MACOSX'))
  // A ZIP made by right-clicking a folder wraps everything in that folder.
  const firstSegments = new Set(entries.map(file =>
    file.name.includes('/') ? file.name.slice(0, file.name.indexOf('/')) : ''))
  const only = firstSegments.size === 1 ? [...firstSegments][0] : ''
  const prefix = only && !only.includes('.') ? `${only}/` : ''
  const files = new Map<string, ArrayBuffer>()
  for (const file of entries) {
    const name = prefix && file.name.startsWith(prefix) ? file.name.slice(prefix.length) : file.name
    if (!name || name.includes('/')) continue
    files.set(name, await file.async('arraybuffer'))
  }
  const label = source.split('/').pop()?.replace(/\.zip$/i, '') || 'Exercises'
  return fromFiles(decodeURIComponent(label), files)
}

// ── The book-loader hooks ───────────────────────────────────────────────────

export async function fetchSimpleBookManifest(url: string): Promise<BookManifest> {
  const source = simpleBookSource(url)
  const listing = await loadListing(source)
  const manifest = buildSimpleBookManifest(listing.names, { source, name: listing.name })
  if (!manifest.children.length) {
    throw new Error('No Python files found here. A simple learning book needs at least one .py file in the folder itself.')
  }
  return manifest
}

export async function readSimpleBookFile(fileUrl: string): Promise<ArrayBuffer> {
  const listing = await loadListing(simpleBookSource(fileUrl))
  return listing.read(simpleBookFileName(fileUrl))
}
