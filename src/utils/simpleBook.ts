// ── Simple learning books (no book.json) ───────────────────────────────────
//
// A full learning book is a `book.json` manifest: ids, guides, test cases,
// per-file visibility. That is the right shape for a published course and quite
// the wrong shape for a teacher who has a folder of exercises and one lesson to
// give. A *simple* learning book is that folder, read as a book with no manifest
// at all — the exercises are numbered, and nothing else has to be declared:
//
//   01.py   → the first activity, titled "01"
//   01.txt  → its instructions (optional), with `#! data.txt` lines at the top
//             naming any files the exercise needs beside it
//   02.py   → the second activity
//
// ── The folder is never listed ──────────────────────────────────────────────
//
// The numbering is not decoration: it is what removes the need to *list* the
// folder. The book is discovered by asking for `01.py`, then `02.py`, and so on
// until a number is not there, which is the end of the book. Listing a GitHub
// folder means the GitHub API, which allows ~60 unauthenticated requests an hour
// *per IP* — and a school NATs a whole cohort behind one address, so a class
// opening two books in a lesson could exhaust it and be told the book does not
// exist. Fetching numbered files goes to raw.githubusercontent.com, which has no
// such limit, so a class of thirty is no different from one student.
//
// It also means a missing file has to be told apart from an unreachable one
// (`fetchResourceBufferOptional`), or a dropped connection would quietly
// shorten the book rather than report a problem.
//
// ── How it plugs in ─────────────────────────────────────────────────────────
//
// A simple book is addressed as `simplebook:<source>`, and one of its files as
// `simplebook:<source>#<name>`. That is deliberately a URL the rest of the book
// machinery can carry around: `fetchBookManifest` synthesises the manifest,
// `resolveBookUrl` builds the file URLs, and the loader reads them back out.
// Everything downstream — challenge filesystems, guides, student links,
// completion ticks, Reset book — then works with no branch of its own.
//
// The root URL is the source address itself, never a freshly-minted filesystem
// id, so a student's completion ticks (keyed `${rootUrl}::${challengeId}`)
// survive closing and reopening the book.

import type { BookChallenge, BookManifest } from '../types'
import { fetchResourceBuffer, fetchResourceBufferOptional, MIN_PLAUSIBLE_ZIP_BYTES } from './bookSource'
import { gitHubRawUrl, parseGitHubLocation, type GitHubLocation } from './githubRepo'
import { getAllFiles, listFilesystems } from './virtualFS'

export const SIMPLE_BOOK_PREFIX = 'simplebook:'
const FILE_SEPARATOR = '#'

/** Shown where the guide goes when an exercise has no instructions of its own. */
export const SIMPLE_BOOK_NO_INSTRUCTIONS = 'No instructions are available for this exercise.'

/** Exercises are numbered `01`…`99` — two digits, so they read in book order. */
export const SIMPLE_BOOK_MAX_EXERCISES = 99

/**
 * How many numbers are asked for at once. The book ends at the first gap, so
 * everything a batch asks for beyond that gap is wasted — but one round trip
 * covering a lesson's worth of exercises is worth a handful of 404s.
 */
const PROBE_BATCH = 10

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

/** `1` → `01`. The exercise's title, and the stem of both of its files. */
export function simpleBookExerciseNumber(index: number): string {
  return String(index).padStart(2, '0')
}

// ── The instructions file ───────────────────────────────────────────────────

export interface SimpleBookGuide {
  /** Files named by `#!` lines at the top of the guide, in order, deduplicated. */
  additional: string[]
  /** What the student reads — the `#!` lines removed. Blank when there is none. */
  text: string
}

const GUIDE_DIRECTIVE = /^\s*#!\s*(.*)$/

/**
 * Read an exercise's `.txt`.
 *
 * A simple book has nowhere to declare the data file an exercise reads, so the
 * instructions declare it: lines of the form `#! data.txt` at the top of the
 * file name files to put beside the exercise. They are directives, not prose,
 * so they never appear in the panel — and a `.txt` holding nothing else leaves
 * the exercise with no instructions at all, exactly as if the file were absent.
 */
export function parseSimpleBookGuide(raw: string): SimpleBookGuide {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)
  const additional: string[] = []
  let body = 0
  for (; body < lines.length; body++) {
    const directive = GUIDE_DIRECTIVE.exec(lines[body])
    if (directive) {
      const name = directive[1].trim().replace(/^\.?\//, '')
      if (name && !additional.includes(name)) additional.push(name)
      continue
    }
    // Blank lines between (or before) the directives are still the top of the
    // file; the first line with prose on it starts the instructions.
    if (lines[body].trim() !== '') break
  }
  return { additional, text: lines.slice(body).join('\n').trim() }
}

// ── Where the files are read from ───────────────────────────────────────────

/**
 * Somewhere a simple book's files can be read from, and what to call the book.
 *
 * `read` answers null for a file that is not there rather than throwing, which
 * is what lets the numbered convention work without ever listing the folder.
 */
interface SimpleBookSource {
  name: string
  read: (name: string) => Promise<ArrayBuffer | null>
}

/** Memoise reads so entering an activity does not re-fetch what the probe read. */
function memoise(source: SimpleBookSource): SimpleBookSource {
  const reads = new Map<string, Promise<ArrayBuffer | null>>()
  return {
    name: source.name,
    read: name => {
      const pending = reads.get(name)
      if (pending) return pending
      const reading = source.read(name).catch(error => { reads.delete(name); throw error })
      reads.set(name, reading)
      return reading
    },
  }
}

/**
 * A repository, or a folder inside one.
 *
 * Nothing here touches GitHub's API — not even to resolve the default branch,
 * because raw.githubusercontent.com accepts `HEAD` as a ref, which is what
 * `gitHubRawUrl` uses for an address that named no branch.
 */
function openGitHubFolder(location: GitHubLocation): SimpleBookSource {
  return {
    name: location.path.split('/').filter(Boolean).pop() ?? location.repo,
    read: name => fetchResourceBufferOptional(
      gitHubRawUrl(location, [location.path, name].filter(Boolean).join('/'))),
  }
}

/** Turn an already-materialised set of files into a source. */
function fromFiles(name: string, files: Map<string, ArrayBuffer>): SimpleBookSource {
  return { name, read: async fileName => files.get(fileName) ?? null }
}

async function openFilesystem(source: string): Promise<SimpleBookSource> {
  const fsId = source.slice('vfs://fs:'.length).split('/')[0]
  const filesystem = (await listFilesystems()).find(entry => entry.id === fsId)
  const files = new Map<string, ArrayBuffer>()
  for (const file of await getAllFiles(fsId)) files.set(file.path.replace(/^\//, ''), file.content)
  return fromFiles(filesystem?.name ?? 'Exercises', files)
}

async function openZip(payload: ArrayBuffer, source: string): Promise<SimpleBookSource> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(payload)
  const entries = Object.values(zip.files).filter(file => !file.dir && !file.name.startsWith('__MACOSX'))
  if (!entries.length) throw new Error('That ZIP has nothing in it.')
  // A ZIP made by right-clicking a folder wraps everything in that folder.
  const firstSegments = new Set(entries.map(file =>
    file.name.includes('/') ? file.name.slice(0, file.name.indexOf('/')) : ''))
  const only = firstSegments.size === 1 ? [...firstSegments][0] : ''
  const prefix = only && !only.includes('.') ? `${only}/` : ''
  const files = new Map<string, ArrayBuffer>()
  for (const file of entries) {
    const name = prefix && file.name.startsWith(prefix) ? file.name.slice(prefix.length) : file.name
    if (name) files.set(name, await file.async('arraybuffer'))
  }
  const label = source.split('/').pop()?.split('?')[0].replace(/\.zip$/i, '') || 'Exercises'
  return fromFiles(decodeURIComponent(label), files)
}

/** Any other web address: the folder the numbered exercises sit in. */
function openUrlFolder(source: string): SimpleBookSource {
  const base = source.endsWith('/') ? source : `${source}/`
  const segments = base.split(/[/?#]/).filter(segment => segment && !segment.includes(':'))
  return {
    name: decodeURIComponent(segments.pop() ?? 'Exercises'),
    read: name => fetchResourceBufferOptional(base + name),
  }
}

/**
 * A ZIP is downloaded whole; any other address is the folder itself. The two
 * are told apart by trying to open the address as a ZIP rather than by its
 * extension, because a Google Drive download link has no `.zip` on the end.
 */
async function openWebSource(source: string): Promise<SimpleBookSource> {
  let payload: ArrayBuffer
  try {
    payload = await fetchResourceBuffer(source, { minBytes: MIN_PLAUSIBLE_ZIP_BYTES })
  } catch {
    return openUrlFolder(source)
  }
  try {
    return await openZip(payload, source)
  } catch {
    return openUrlFolder(source)
  }
}

async function openSource(source: string): Promise<SimpleBookSource> {
  if (source.startsWith('vfs://fs:')) return memoise(await openFilesystem(source))
  const location = parseGitHubLocation(source)
  if (location && !location.isFile) return memoise(openGitHubFolder(location))
  if (/^https?:\/\//i.test(source)) return memoise(await openWebSource(source))
  throw new Error(
    'A simple learning book must be a public GitHub repository (or a folder inside one), a ZIP, or a folder open in this browser.')
}

// ── Finding the exercises ───────────────────────────────────────────────────

export interface SimpleBookExercise {
  /** `01`, `02`, … — the activity's title and the stem of its files. */
  number: string
  /** Whether a `NN.txt` was found, so the manifest can point the guide at it. */
  hasGuide: boolean
  /** Files the guide's `#!` lines asked for, mounted beside the exercise. */
  additional: string[]
}

/**
 * Whether a probe came back with a web page rather than the file asked for.
 *
 * Not every host answers a missing file with a 404: a single-page app's server
 * (this app's own dev server included) hands back its index page with a cheerful
 * 200, and so do plenty of "sorry, not found" pages. Taking those at face value
 * would end the book at 99 exercises, 97 of them holding a copy of somebody's
 * HTML. No exercise or instructions file opens `<!doctype html>`.
 */
function looksLikeWebPage(payload: ArrayBuffer): boolean {
  const head = new TextDecoder().decode(payload.slice(0, 200)).trimStart().toLowerCase()
  return head.startsWith('<!doctype html') || head.startsWith('<html')
}

/**
 * Ask for `01.py`, `02.py`, … until a number is not there.
 *
 * A gap ends the book, so numbering 01, 02, 04 publishes two exercises — which
 * is the price of never having to list the folder, and is what the info dialog
 * tells teachers.
 */
async function probeExercises(source: SimpleBookSource): Promise<SimpleBookExercise[]> {
  const exercises: SimpleBookExercise[] = []
  for (let start = 1; start <= SIMPLE_BOOK_MAX_EXERCISES; start += PROBE_BATCH) {
    const numbers: string[] = []
    for (let n = start; n < start + PROBE_BATCH && n <= SIMPLE_BOOK_MAX_EXERCISES; n++) {
      numbers.push(simpleBookExerciseNumber(n))
    }
    const batch = await Promise.all(numbers.map(async number => {
      const found = async (name: string) => {
        const payload = await source.read(name)
        return payload && !looksLikeWebPage(payload) ? payload : null
      }
      if (!(await found(`${number}.py`))) return null
      const guide = await found(`${number}.txt`)
      return {
        number,
        hasGuide: !!guide,
        additional: guide ? parseSimpleBookGuide(new TextDecoder().decode(guide)).additional : [],
      }
    }))
    for (const exercise of batch) {
      if (!exercise) return exercises
      exercises.push(exercise)
    }
  }
  return exercises
}

/**
 * A short stable digest of the source address.
 *
 * Activity ids have to be unique across every book a student opens — the
 * challenge filesystem is named `__book__:<id>` — and a simple book has no
 * author-assigned ids at all, so two folders that each hold an `01.py` would
 * otherwise share one workspace. FNV-1a over the source address keeps the ids
 * stable across sessions while telling those two folders apart.
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
  exercises: SimpleBookExercise[],
  opts: { source: string; name: string },
): BookManifest {
  const idPrefix = simpleBookIdPrefix(opts.source)
  const children = exercises.map<BookChallenge>(exercise => ({
    id: `${idPrefix}${exercise.number}`,
    name: exercise.number,
    py: `${exercise.number}.py`,
    guide: exercise.hasGuide ? `${exercise.number}.txt` : undefined,
    // Nothing here can declare a test, so everything is an example: reaching
    // the end of a run is what ticks it off.
    isExample: true,
    additionalFiles: exercise.additional.map(filename => ({ filename, visible: true })),
  }))
  return { id: idPrefix, name: opts.name, children }
}

// ── The book-loader hooks ───────────────────────────────────────────────────

interface OpenSimpleBook {
  source: SimpleBookSource
  exercises: SimpleBookExercise[]
}

const bookCache = new Map<string, Promise<OpenSimpleBook>>()

/** Drop a cached book so the next read re-fetches — used when a book opens. */
export function invalidateSimpleBook(url: string): void {
  bookCache.delete(simpleBookSource(url))
}

function loadBook(source: string): Promise<OpenSimpleBook> {
  const cached = bookCache.get(source)
  if (cached) return cached
  const pending = (async () => {
    const opened = await openSource(source)
    return { source: opened, exercises: await probeExercises(opened) }
  })().catch(error => {
    bookCache.delete(source)
    throw error
  })
  bookCache.set(source, pending)
  return pending
}

export async function fetchSimpleBookManifest(url: string): Promise<BookManifest> {
  const source = simpleBookSource(url)
  const book = await loadBook(source)
  if (!book.exercises.length) {
    throw new Error(
      'No exercises found here. A simple learning book numbers its files 01.py, 02.py, 03.py … and reads them until a number is missing.')
  }
  return buildSimpleBookManifest(book.exercises, { source, name: book.source.name })
}

export async function readSimpleBookFile(fileUrl: string): Promise<ArrayBuffer> {
  const book = await loadBook(simpleBookSource(fileUrl))
  const name = simpleBookFileName(fileUrl)
  const content = await book.source.read(name)
  if (!content) throw new Error(`"${name}" is not in this folder.`)
  return content
}

/** One exercise's instructions, with the `#!` lines it opens with taken out. */
export async function readSimpleBookGuide(fileUrl: string): Promise<string> {
  return parseSimpleBookGuide(new TextDecoder().decode(await readSimpleBookFile(fileUrl))).text
}
