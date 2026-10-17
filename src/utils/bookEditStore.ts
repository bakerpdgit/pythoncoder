// bookEditStore — the single choke point for authoring a learning book.
//
// The whole editable book lives in ONE flat VFS filesystem named
// `__booksrc__:<name>` (BOOK_SRC_PREFIX), which is already hidden from the normal
// filesystem picker. That VFS *is* the exported zip: `/book.json` plus every
// guide/py/additionalFile and `/solutions/*.py`, flat. Because `bookLoader.ts`
// understands `vfs://fs:<id>/…` URLs, a book stored this way runs through all the
// existing consume paths unchanged.
//
// A module-level singleton holds the active edit session (mirrors pythonsponge's
// EditableBookStore). When a local folder is connected, every write/delete/rename
// is mirrored to disk for a true two-way connection.

import type { BookManifest, BookChallenge, BookAdditionalFile, VFSFilesystem } from '../types'
import {
  createFilesystem, deleteFilesystem, listFilesystems, importFileMapToFs,
  getEntryByPath, writeFile, deleteEntry, renameEntry, guessMimeType, updateFilesystemMeta,
} from './virtualFS'
import { BOOK_SRC_PREFIX, BOOK_FS_PREFIX, isBookRef } from './bookLoader'
import { writeFileToFolderHandle, deleteFromFolderHandle, readDirectoryToMap } from './localFolderIo'

export interface BookEditSession {
  srcFsId: string
  rootUrl: string
  folderHandle: FileSystemDirectoryHandle | null
}

let session: BookEditSession | null = null

const enc = new TextEncoder()
const dec = new TextDecoder()

export function getSession(): BookEditSession | null {
  return session
}

export function bookRootUrl(srcFsId: string): string {
  return `vfs://fs:${srcFsId}/book.json`
}

function normRel(relPath: string): string {
  return relPath.replace(/^\.\//, '').replace(/^\//, '')
}

// ── Folder mirroring ───────────────────────────────────────────────────────

async function mirrorWrite(relPath: string, content: ArrayBuffer): Promise<void> {
  if (!session?.folderHandle) return
  try { await writeFileToFolderHandle(session.folderHandle, '/' + normRel(relPath), content) }
  catch { /* best effort */ }
}

async function mirrorDelete(relPath: string): Promise<void> {
  if (!session?.folderHandle) return
  try { await deleteFromFolderHandle(session.folderHandle, '/' + normRel(relPath)) }
  catch { /* best effort */ }
}

// ── Session lifecycle ──────────────────────────────────────────────────────

export function closeBookSession(): void {
  session = null
}

/**
 * The filesystem name a book source called `name` should take. One already
 * holding a book written in this browser is never reused (that would delete
 * the only copy of someone's book); the name gets a number instead. Anything
 * else of that name — a book opened from a ZIP or a folder before, whose real
 * copy is elsewhere — is fine to replace.
 */
export function bookSourceFsName(name: string, existing: Array<Pick<VFSFilesystem, 'name' | 'authoredBook'>>): string {
  const taken = new Set(existing.filter(f => f.authoredBook).map(f => f.name))
  let fsName = BOOK_SRC_PREFIX + name
  for (let n = 2; taken.has(fsName); n++) fsName = `${BOOK_SRC_PREFIX}${name} (${n})`
  return fsName
}

/**
 * A fresh, empty book-source filesystem for `name`. `authored` marks it as a
 * book written in this browser: kept after it is closed, and listed to reopen.
 */
export async function claimBookSourceFs(name: string, authored: boolean): Promise<string> {
  const all = await listFilesystems()
  const fsName = bookSourceFsName(name, all)
  const existing = all.find(f => f.name === fsName)
  if (existing) await deleteFilesystem(existing.id)
  const { id } = await createFilesystem(fsName)
  if (authored) await updateFilesystemMeta(id, { authoredBook: { title: fsName.slice(BOOK_SRC_PREFIX.length) } })
  return id
}

/** Books written in this browser, oldest first. */
export async function listAuthoredBooks(): Promise<Array<{ id: string; title: string }>> {
  return (await listFilesystems())
    .filter(f => f.authoredBook && f.name.startsWith(BOOK_SRC_PREFIX))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(f => ({ id: f.id, title: f.authoredBook!.title }))
}

/** Find the book.json entry in an imported file map and return its base directory. */
function findBookRoot(fileMap: Map<string, ArrayBuffer>): { bookRel: string; baseDir: string } | null {
  let best: string | null = null
  for (const key of fileMap.keys()) {
    const norm = key.replace(/\\/g, '/').replace(/^\.\//, '')
    if (norm === 'book.json' || norm.endsWith('/book.json')) {
      if (best === null || norm.length < best.length) best = norm
    }
  }
  if (best === null) return null
  const slash = best.lastIndexOf('/')
  return { bookRel: best, baseDir: slash === -1 ? '' : best.slice(0, slash) }
}

/** Import a flat/zip/folder file map (containing a book.json) into a fresh book source VFS. */
export async function createBookFromFileMap(
  fileMap: Map<string, ArrayBuffer>,
  name: string,
  folderHandle: FileSystemDirectoryHandle | null = null,
): Promise<BookEditSession> {
  const root = findBookRoot(fileMap)
  if (!root) throw new Error('No book.json found in the selected source.')

  // Re-root the map at the book directory so files sit flat next to book.json.
  const rebased = new Map<string, ArrayBuffer>()
  const prefix = root.baseDir ? root.baseDir + '/' : ''
  for (const [key, content] of fileMap) {
    const norm = key.replace(/\\/g, '/').replace(/^\.\//, '')
    if (prefix && !norm.startsWith(prefix)) continue
    const rel = prefix ? norm.slice(prefix.length) : norm
    if (rel) rebased.set(rel, content)
  }

  // Without a folder, the browser holds the only copy of the edits.
  const srcFsId = await claimBookSourceFs(name, folderHandle === null)
  await importFileMapToFs(srcFsId, rebased, true)
  session = { srcFsId, rootUrl: bookRootUrl(srcFsId), folderHandle }
  return session
}

const EXAMPLE_PY = `# This is an example — the student just runs it.\nname = input("What is your name? ")\nprint("Hello", name)\n`
const EXAMPLE_GUIDE = `# Welcome\n\nThis is an **example** page. Run the code and see how \`input()\` and \`print()\` work.\n\n\`\`\`python\nname = input("What is your name? ")\nprint("Hello", name)\n\`\`\`\n`
const TASK_STARTER = `# Ask the user for their favourite colour and reply.\n# Expected: "I also like <colour>"\n`
const TASK_GUIDE = `# Your first task\n\nAsk the user for their favourite colour, then print \`I also like <colour>\`.\n\nFor example, if they type **blue**, print \`I also like blue\`.\n`
const TASK_SOLUTION = `colour = input("What is your favourite colour? ")\nprint("I also like", colour)\n`

/** Create a brand-new book (one worked example + one task) in a fresh source VFS. */
export async function createNewBook(
  bookName: string,
  folderHandle: FileSystemDirectoryHandle | null = null,
): Promise<BookEditSession> {
  const srcFsId = await claimBookSourceFs(bookName, folderHandle === null)
  // Set the session first so writeBookFile/writeManifest mirror to the folder.
  session = { srcFsId, rootUrl: bookRootUrl(srcFsId), folderHandle }
  const manifest: BookManifest = {
    name: bookName,
    id: crypto.randomUUID(),
    children: [
      { id: crypto.randomUUID(), name: 'Example', guide: 'ex01.md', py: 'ex01.py', isExample: true },
      {
        id: crypto.randomUUID(), name: 'Task', guide: 'ex02.md', py: 'ex02.py',
        tests: [{ in: 'blue', out: '.*I also like blue' }],
        additionalFiles: [],
        sol: { file: 'solutions/ex02.py', showSolution: false },
      },
    ],
  }
  await writeBookFile(srcFsId, 'ex01.py', EXAMPLE_PY)
  await writeBookFile(srcFsId, 'ex01.md', EXAMPLE_GUIDE)
  await writeBookFile(srcFsId, 'ex02.py', TASK_STARTER)
  await writeBookFile(srcFsId, 'ex02.md', TASK_GUIDE)
  await writeBookFile(srcFsId, 'solutions/ex02.py', TASK_SOLUTION)
  await writeManifest(srcFsId, manifest)
  return session
}

/** Open an existing book source VFS (already populated) as the active edit session. */
export function openBookSession(srcFsId: string, folderHandle: FileSystemDirectoryHandle | null = null): BookEditSession {
  session = { srcFsId, rootUrl: bookRootUrl(srcFsId), folderHandle }
  return session
}

// ── Manifest & file IO (VFS + folder mirror) ───────────────────────────────

export async function readManifest(srcFsId: string): Promise<BookManifest> {
  const entry = await getEntryByPath(srcFsId, '/book.json')
  if (!entry?.content) throw new Error('book.json not found in book source')
  return JSON.parse(dec.decode(entry.content)) as BookManifest
}

export async function writeManifest(srcFsId: string, manifest: BookManifest): Promise<void> {
  const text = JSON.stringify(manifest, null, 2)
  const buf = enc.encode(text).buffer as ArrayBuffer
  await writeFile(srcFsId, '/book.json', buf, 'application/json')
  await mirrorWrite('book.json', buf)
}

export async function readBookFile(srcFsId: string, relPath: string): Promise<string> {
  const entry = await getEntryByPath(srcFsId, '/' + normRel(relPath))
  return entry?.content ? dec.decode(entry.content) : ''
}

export async function writeBookFile(srcFsId: string, relPath: string, text: string): Promise<void> {
  const rel = normRel(relPath)
  const buf = enc.encode(text).buffer as ArrayBuffer
  await writeFile(srcFsId, '/' + rel, buf, guessMimeType(rel))
  await mirrorWrite(rel, buf)
}

export async function writeBookFileBuffer(srcFsId: string, relPath: string, content: ArrayBuffer): Promise<void> {
  const rel = normRel(relPath)
  await writeFile(srcFsId, '/' + rel, content, guessMimeType(rel))
  await mirrorWrite(rel, content)
}

export async function deleteBookFile(srcFsId: string, relPath: string): Promise<void> {
  const rel = normRel(relPath)
  try { await deleteEntry(srcFsId, '/' + rel) } catch { /* ignore */ }
  await mirrorDelete(rel)
}

/** Rename a flat book file. Mirrors to folder as delete-old + write-new (safe for nested dirs). */
export async function renameBookFile(srcFsId: string, oldRel: string, newRel: string): Promise<void> {
  const from = normRel(oldRel)
  const to = normRel(newRel)
  if (from === to) return
  const entry = await getEntryByPath(srcFsId, '/' + from)
  const content = entry?.content
  // Same directory → use renameEntry; otherwise write+delete.
  const fromDir = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : ''
  const toDir = to.includes('/') ? to.slice(0, to.lastIndexOf('/')) : ''
  if (entry && fromDir === toDir) {
    await renameEntry(srcFsId, '/' + from, to.slice(to.lastIndexOf('/') + 1))
  } else if (content) {
    await writeFile(srcFsId, '/' + to, content, guessMimeType(to))
    try { await deleteEntry(srcFsId, '/' + from) } catch { /* ignore */ }
  }
  if (content) await mirrorWrite(to, content)
  await mirrorDelete(from)
}

/** Re-read a connected folder into the book source VFS (folder → VFS). */
export async function reloadFromFolder(srcFsId: string): Promise<BookManifest> {
  if (!session?.folderHandle) throw new Error('No folder connected')
  const fileMap = await readDirectoryToMap(session.folderHandle)
  await importFileMapToFs(srcFsId, fileMap, true)
  return readManifest(srcFsId)
}

// ── Manifest helpers ───────────────────────────────────────────────────────

export function getChallenges(manifest: BookManifest): BookChallenge[] {
  return manifest.children.filter(c => !isBookRef(c)) as BookChallenge[]
}

/** Next `exNN` number = max existing exNN across py/guide + 1 (never reused). */
export function nextExerciseNumber(manifest: BookManifest): number {
  let max = 0
  for (const c of getChallenges(manifest)) {
    for (const f of [c.py, c.guide]) {
      const m = f?.match(/(?:^|\/)ex(\d+)\./)
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
  }
  return max + 1
}

export function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

// ── Structural editing (add / delete / move) with auto-renumber ─────────────

interface Rename { from: string; to: string }

function baseName(rel: string): string {
  const n = normRel(rel)
  return n.slice(n.lastIndexOf('/') + 1)
}

// Recompute exNN.py / exNN.md / solutions/exNN.py so filenames follow list order.
// Returns a deep-cloned manifest plus the file renames to apply. Only the
// per-challenge py/guide/solution are renumbered; arbitrarily-named additional
// files (and the test `filename` refs pointing at them) are left untouched.
function renumberExercises(manifest: BookManifest): { manifest: BookManifest; renames: Rename[] } {
  const next = JSON.parse(JSON.stringify(manifest)) as BookManifest
  const renames: Rename[] = []
  let i = 0
  for (const child of next.children) {
    if (isBookRef(child)) continue
    const c = child as BookChallenge
    i += 1
    const base = `ex${pad2(i)}`
    if (c.py) {
      const target = `${base}.py`
      if (baseName(c.py) !== target) { renames.push({ from: c.py, to: target }); c.py = target }
    }
    if (c.guide) {
      const target = `${base}.md`
      if (baseName(c.guide) !== target) { renames.push({ from: c.guide, to: target }); c.guide = target }
    }
    if (c.sol?.file) {
      const target = `solutions/${base}.py`
      if (normRel(c.sol.file) !== target) { renames.push({ from: c.sol.file, to: target }); c.sol.file = target }
    }
  }
  return { manifest: next, renames }
}

// Apply file renames content-first (read all, delete all, write all) so
// overlapping from/to numbers (e.g. ex05→ex04 while ex04→ex03) never clobber.
async function applyRenames(srcFsId: string, renames: Rename[]): Promise<void> {
  if (renames.length === 0) return
  const contents = new Map<string, ArrayBuffer | null>()
  for (const r of renames) {
    const entry = await getEntryByPath(srcFsId, '/' + normRel(r.from))
    contents.set(r.from, entry?.content ?? null)
  }
  for (const r of renames) await deleteBookFile(srcFsId, r.from)
  for (const r of renames) {
    const c = contents.get(r.from)
    if (c) await writeBookFileBuffer(srcFsId, r.to, c)
  }
}

/** Delete a challenge's per-challenge working filesystem (`__book__:<id>`) so it
 *  is rebuilt fresh from the (possibly renamed) source files on next entry. */
export async function deleteChallengeWorkingFs(challengeId: string): Promise<void> {
  const prefix = BOOK_FS_PREFIX + challengeId
  const stale = (await listFilesystems()).filter(f => f.name === prefix || f.name.startsWith(prefix + ':'))
  for (const fs of stale) { try { await deleteFilesystem(fs.id) } catch { /* ignore */ } }
}

const NEW_EX_PY = `# Write your solution here\n`
const NEW_EX_GUIDE = (name: string) => `# ${name}\n\nDescribe the task here.\n`

const NEW_EXAMPLE_PY = `# An example: the student runs it and reads it.\nprint("Hello, world!")\n`
const NEW_EXAMPLE_GUIDE = (name: string) => `# ${name}\n\nExplain what this example shows, then ask the student to run it.\n`
// A Parsons puzzle's file is its answer. The markers say what the student
// arranges; the role buttons in the editor write them, so a teacher rarely types one.
const NEW_PARSONS_PY = [
  '# Lines outside the block stay where they are.',
  'total = 0',
  '# start',
  'for n in range(1, 4):',
  '    total = total + n',
  'print(total)',
  'print(n) #distractor',
  '# end',
  '',
].join('\n')
const NEW_PARSONS_GUIDE = (name: string) =>
  `# ${name}\n\nPut the lines in order so the program adds up 1, 2 and 3 and prints the total.\n\n` +
  `One line does not belong: hide it with its eye. Then press **Submit**.\n`

/** What an exercise is to the student: read and run, tested, or a Parsons puzzle. */
export type ExerciseKind = 'example' | 'task' | 'parsons'

export function exerciseKind(c: BookChallenge): ExerciseKind {
  if (c.typ === 'parsons') return 'parsons'
  return c.isExample === true || c.isExample === 'True' ? 'example' : 'task'
}

/** The challenge as another kind. Tests go when it stops being a task; a Parsons
 *  puzzle starts with indentation given. Its files are the caller's business. */
export function withExerciseKind(c: BookChallenge, kind: ExerciseKind): BookChallenge {
  const next: BookChallenge = { ...c }
  delete next.isExample
  delete next.typ
  delete next.parsons
  if (kind === 'example') { next.isExample = true; next.tests = [] }
  if (kind === 'parsons') { next.typ = 'parsons'; next.parsons = { indent: 'given', ...c.parsons }; delete next.tests }
  if (kind === 'task' && !next.tests) next.tests = []
  return next
}

/** Add a new exercise after the given id (or at the end), renumber, seed files, persist. */
export async function addExercise(
  srcFsId: string, manifest: BookManifest, afterId?: string, kind: ExerciseKind = 'task',
): Promise<{ manifest: BookManifest; newId: string }> {
  const newId = crypto.randomUUID()
  const num = nextExerciseNumber(manifest)
  const name = kind === 'parsons' ? `Puzzle ${num}` : kind === 'example' ? `Example ${num}` : `Exercise ${num}`
  const newChild: BookChallenge = withExerciseKind({
    id: newId,
    name,
    guide: `ex${pad2(num)}.md`,
    py: `ex${pad2(num)}.py`,
    tests: [],
    additionalFiles: [],
  }, kind)
  const children = [...manifest.children]
  const idx = afterId ? children.findIndex(c => !isBookRef(c) && (c as BookChallenge).id === afterId) : -1
  if (idx >= 0) children.splice(idx + 1, 0, newChild)
  else children.push(newChild)
  const draft: BookManifest = { ...manifest, children }

  // Seed the new files before renumber (renumber may rename them into position).
  const py = kind === 'parsons' ? NEW_PARSONS_PY : kind === 'example' ? NEW_EXAMPLE_PY : NEW_EX_PY
  const guide = kind === 'parsons' ? NEW_PARSONS_GUIDE : kind === 'example' ? NEW_EXAMPLE_GUIDE : NEW_EX_GUIDE
  await writeBookFile(srcFsId, newChild.py!, py)
  await writeBookFile(srcFsId, newChild.guide!, guide(newChild.name))

  const { manifest: renumbered, renames } = renumberExercises(draft)
  await applyRenames(srcFsId, renames)
  await Promise.all(getChallenges(renumbered).map(c => deleteChallengeWorkingFs(c.id)))
  await writeManifest(srcFsId, renumbered)
  return { manifest: renumbered, newId }
}

/** Delete an exercise (and its owned files), renumber the rest, persist. */
export async function deleteExercise(srcFsId: string, manifest: BookManifest, id: string): Promise<BookManifest> {
  const target = getChallenges(manifest).find(c => c.id === id)
  if (target) {
    // Remove the challenge's own files (py/guide/solution + additional files).
    for (const f of [target.py, target.guide, target.sol?.file]) if (f) await deleteBookFile(srcFsId, f)
    for (const af of (target.additionalFiles ?? []) as BookAdditionalFile[]) await deleteBookFile(srcFsId, af.filename)
    await deleteChallengeWorkingFs(id)
  }
  const children = manifest.children.filter(c => isBookRef(c) || (c as BookChallenge).id !== id)
  const { manifest: renumbered, renames } = renumberExercises({ ...manifest, children })
  await applyRenames(srcFsId, renames)
  await Promise.all(getChallenges(renumbered).map(c => deleteChallengeWorkingFs(c.id)))
  await writeManifest(srcFsId, renumbered)
  return renumbered
}

/** Move an exercise up/down among its siblings, renumber, persist. */
export async function moveExercise(srcFsId: string, manifest: BookManifest, id: string, dir: -1 | 1): Promise<BookManifest> {
  const children = [...manifest.children]
  const idx = children.findIndex(c => !isBookRef(c) && (c as BookChallenge).id === id)
  if (idx < 0) return manifest
  const swap = idx + dir
  if (swap < 0 || swap >= children.length) return manifest
  ;[children[idx], children[swap]] = [children[swap], children[idx]]
  const { manifest: renumbered, renames } = renumberExercises({ ...manifest, children })
  await applyRenames(srcFsId, renames)
  await Promise.all(getChallenges(renumbered).map(c => deleteChallengeWorkingFs(c.id)))
  await writeManifest(srcFsId, renumbered)
  return renumbered
}
