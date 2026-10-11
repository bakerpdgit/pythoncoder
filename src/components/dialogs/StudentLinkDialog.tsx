import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookChild, BookManifest } from '../../types'
import { fetchBookManifest, findBookTargetById, isBookRef, resolveBookShareSource, resolveBookUrl } from '../../utils/bookLoader'
import { githubRepositoryBookUrl } from '../../utils/bookSource'
import { detectResourceKind } from '../../utils/resourceKind'
import { isSimpleBookUrl, simpleBookRootUrl } from '../../utils/simpleBook'
import { fetchTutorialCatalog, type LearningTutorial } from '../../utils/tutorialCatalog'
import type { WorkerRunMode } from '../../utils/urlRunMode'
import { createFilesystemFromFiles, deleteFilesystem, listFilesystems } from '../../utils/virtualFS'
import { ResourceFinder, type FoundResource } from './ResourceFinder'
import { SimpleBookInfoButton } from './SimpleBookOption'
import { BigButton, ShareLinkRow, inputClass, primaryBtnClass, secondaryBtnClass } from './webWizardShared'

// Build a link a teacher can hand to students: to a whole learning book, or to
// one activity/section inside it. Reached from the Teacher Tools panel (with no
// source chosen yet) and from right-clicking in the Book panel (pre-seeded).
//
// The Teacher Tools route deliberately never opens the book — `openResourceUrl`
// hides the Teacher Tools panel, which would pull the panel out from under the
// teacher mid-task.

export interface StudentLinkSource {
  /** The book's root URL — `https://…` or a `vfs://` root we may be able to trace back. */
  rootUrl: string
  label: string
  /** Default run mode, when the source came from the catalog. */
  mode?: WorkerRunMode
}

interface Props {
  initialSource?: StudentLinkSource | null
  /** Activity or section id to preselect; null/undefined means the whole book. */
  initialTargetId?: string | null
  onClose: () => void
  /** Passed only while a book edit session is open, for the publish instructions. */
  onExportZip?: (() => void) | null
  /** A book just put online (Share, in book edit mode): checked, then linked. */
  pending?: PendingBookResource | null
}

// ── Target tree ─────────────────────────────────────────────────────────────

interface TreeNode {
  id: string
  name: string
  kind: 'challenge' | 'section'
  /** Sub-book URL, for sections. */
  bookUrl?: string
  children?: TreeNode[]
  loading?: boolean
  error?: string
}

function toNodes(manifest: BookManifest, bookUrl: string): TreeNode[] {
  return manifest.children.map((child: BookChild) => isBookRef(child)
    ? { id: child.id, name: child.name, kind: 'section' as const, bookUrl: resolveBookUrl(bookUrl, child.bookLink) }
    : { id: child.id, name: child.name, kind: 'challenge' as const })
}

/** How many nodes in the loaded tree carry this id — >1 makes a link ambiguous. */
function countId(nodes: TreeNode[], id: string): number {
  return nodes.reduce((n, node) =>
    n + (node.id === id ? 1 : 0) + (node.children ? countId(node.children, id) : 0), 0)
}

function updateNode(nodes: TreeNode[], id: string, patch: Partial<TreeNode>): TreeNode[] {
  return nodes.map(node => node.id === id
    ? { ...node, ...patch }
    : node.children ? { ...node, children: updateNode(node.children, id, patch) } : node)
}

// ── Component ───────────────────────────────────────────────────────────────

export function StudentLinkDialog({ initialSource, initialTargetId, onClose, onExportZip, pending }: Props) {
  const [source, setSource] = useState<StudentLinkSource | null>(initialSource ?? null)
  const [resolving, setResolving] = useState(false)
  /** The public URL to link to; null once resolved means "cannot be linked yet". */
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)

  const [targetId, setTargetId] = useState<string | null>(initialTargetId ?? null)
  const [tree, setTree] = useState<TreeNode[] | null>(null)
  const [treeError, setTreeError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<WorkerRunMode | ''>(initialSource?.mode ?? '')
  const [showFirst, setShowFirst] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Trace the chosen source back to a public URL (a book unzipped from a URL
  // still has one; a locally authored or imported book does not).
  useEffect(() => {
    if (!source) { setResolved(false); setPublicUrl(null); return }
    let cancelled = false
    setResolving(true)
    setResolved(false)
    void resolveBookShareSource(source.rootUrl)
      .catch(() => null)
      .then(url => {
        if (cancelled) return
        setPublicUrl(url)
        setResolved(true)
        setResolving(false)
      })
    return () => { cancelled = true }
  }, [source])

  // Load the root manifest for the target picker. Read through the *original*
  // root URL, not the public one: a locally-opened book can still be browsed.
  useEffect(() => {
    if (!source || !publicUrl) { setTree(null); return }
    let cancelled = false
    setTree(null)
    setTreeError('')
    void fetchBookManifest(source.rootUrl)
      .then(manifest => { if (!cancelled) setTree(toNodes(manifest, source.rootUrl)) })
      .catch(e => { if (!cancelled) setTreeError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [source, publicUrl])

  const loadSection = useCallback(async (id: string, bookUrl: string) => {
    setTree(prev => prev && updateNode(prev, id, { loading: true }))
    try {
      const manifest = await fetchBookManifest(bookUrl)
      const children = toNodes(manifest, bookUrl)
      setTree(prev => prev && updateNode(prev, id, { loading: false, children }))
      return children
    } catch (e) {
      setTree(prev => prev && updateNode(prev, id, {
        loading: false, error: e instanceof Error ? e.message : String(e),
      }))
      return null
    }
  }, [])

  const expandSection = useCallback(async (node: TreeNode) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(node.id)) next.delete(node.id); else next.add(node.id)
      return next
    })
    if (node.children || !node.bookUrl) return
    await loadSection(node.id, node.bookUrl)
  }, [loadSection])

  // A link seeded by right-click can name an activity inside a sub-book. Walk
  // the tree down to it once, so the teacher sees what the link points at
  // rather than an unexplained selection they cannot find.
  // Neither the guard nor the tree may be a dependency here: the walk loads
  // sub-books, which replaces `tree`, which would re-run this effect and let
  // its own cleanup cancel the walk part-way down. Depend on the tree merely
  // *existing*, and read the live value through a ref.
  const autoExpandedForRef = useRef<string | null>(null)
  const treeRef = useRef<TreeNode[] | null>(null)
  treeRef.current = tree
  const treeReady = !!tree
  useEffect(() => {
    const rootNodes = treeRef.current
    if (!source || !treeReady || !rootNodes || !initialTargetId) return
    if (autoExpandedForRef.current === initialTargetId) return
    autoExpandedForRef.current = initialTargetId
    if (rootNodes.some(node => node.id === initialTargetId)) return

    let cancelled = false
    void (async () => {
      const target = await findBookTargetById(source.rootUrl, initialTargetId).catch(() => null)
      if (cancelled || !target?.sectionPath.length) return
      let level = rootNodes
      for (const sectionId of target.sectionPath) {
        const node = level.find(n => n.id === sectionId)
        if (!node?.bookUrl) return
        setExpanded(prev => new Set(prev).add(sectionId))
        const children = node.children ?? await loadSection(sectionId, node.bookUrl)
        if (cancelled || !children) return
        level = children
      }
    })()
    return () => { cancelled = true }
  }, [source, treeReady, initialTargetId, loadSection])

  const ambiguous = !!(targetId && tree && countId(tree, targetId) > 1)
  // A simple learning book is addressed as `simplebook:<folder>`; the student
  // link has to say so, or the same folder would be fetched as a manifest.
  const simple = !!source && isSimpleBookUrl(source.rootUrl)

  const shell = (body: React.ReactNode) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-5 w-[520px] max-w-[95vw] text-xs"
        onClick={e => e.stopPropagation()}>
        {body}
      </div>
    </div>
  )

  // ── Source picker ─────────────────────────────────────────────────────────
  if (!source) {
    return shell(<SourcePicker pending={pending} onPick={s => { setSource(s); setMode(s.mode ?? '') }} onClose={onClose} />)
  }

  const header = (
    <div className="mb-3">
      <div className="text-sm font-bold text-white mb-1">Create a student link</div>
      <p className="text-slate-400 leading-relaxed truncate" title={source.label}>{source.label}</p>
    </div>
  )

  const footer = (
    <div className="flex justify-between items-center gap-2 mt-4">
      <button type="button" onClick={() => { setSource(null); setTargetId(null) }}
        className={secondaryBtnClass} disabled={!!initialSource}>
        Choose another book
      </button>
      <button type="button" onClick={onClose} className={primaryBtnClass}>Done</button>
    </div>
  )

  if (resolving || !resolved) {
    return shell(<>{header}<div className="text-slate-500 py-4 text-center">Checking where this book is published…</div></>)
  }

  // ── Not published anywhere public ─────────────────────────────────────────
  if (!publicUrl) {
    return shell(<>{header}<PublishHelp onExportZip={onExportZip} />{footer}</>)
  }

  // ── The link ──────────────────────────────────────────────────────────────
  return shell(
    <>
      {header}

      <div className="text-[11px] text-slate-400 mb-1">Link to:</div>
      <div className="max-h-52 overflow-y-auto rounded border border-slate-700 bg-slate-900/40 py-1">
        <TargetRow label="The whole book" kind="book" depth={0}
          selected={targetId === null} onSelect={() => setTargetId(null)} />
        {!tree && !treeError && <div className="px-2 py-1.5 text-slate-500">Loading contents…</div>}
        {/* Index-prefixed key: ids are not guaranteed unique within a book
            (the same guard the Book panel's own list uses). */}
        {tree?.map((node, i) => (
          <TreeRows key={`${i}-${node.id}`} node={node} depth={1}
            expanded={expanded} onToggle={expandSection}
            targetId={targetId} onSelect={setTargetId} />
        ))}
      </div>

      {ambiguous && (
        <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">
          More than one entry in this book uses this id — the link will open the first one.
          Give them different ids in the advanced book.json editor to be certain.
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <label htmlFor="student-link-mode" className="text-[11px] text-slate-400">Run button:</label>
        <select id="student-link-mode" value={mode} onChange={e => setMode(e.target.value as WorkerRunMode | '')}
          className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-400">
          <option value="">Leave as the student&apos;s default</option>
          <option value="debug">Debug</option>
          <option value="trace">Trace</option>
          <option value="run">Run</option>
        </select>
      </div>

      {targetId === null && (
        <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
          <input type="checkbox" checked={showFirst} onChange={e => setShowFirst(e.target.checked)}
            className="accent-sky-500" />
          Open the first activity straight away
        </label>
      )}

      {/* No link until the address is known to hold a book: a link built from
          one that does not would silently open to an error for every student. */}
      {treeError ? (
        <div className="mt-3 rounded border border-red-500/40 bg-red-950/30 px-2.5 py-2 text-[11px] leading-relaxed text-red-200">
          <div className="font-semibold text-red-100">No learning book here.</div>
          <div className="mt-1">{treeError}</div>
          <div className="mt-1.5 text-red-200/80">
            Choose another book, and choose the folder or ZIP that holds its <code className="font-mono">book.json</code>.
          </div>
        </div>
      ) : (
        <ShareLinkRow resourceUrl={publicUrl}
          options={{ challengeId: targetId ?? undefined, mode: mode || undefined, showFirst, simple }}
          label={targetId === null
            ? 'Student link — opens this book directly:'
            : 'Student link — opens this activity directly:'} />
      )}

      {footer}
    </>
  )
}

// ── Source picker view ──────────────────────────────────────────────────────

export type BookLinkType = 'tutorial' | 'book' | 'simple'

/** A book found online that still has to be checked, e.g. one just uploaded from Share. */
export interface PendingBookResource {
  type: 'book' | 'simple'
  url: string
  label: string
}

/**
 * Turn an address into a link source, if it holds the kind of book asked for.
 * A ZIP book is unpacked into a filesystem named after its address — exactly
 * as opening it would — so its contents can be browsed for a target, and the
 * link still names the ZIP.
 */
async function checkBookResource(type: 'book' | 'simple', found: FoundResource): Promise<StudentLinkSource> {
  const kind = await detectResourceKind(found.url)
  if (type === 'simple') {
    if (kind.kind === 'simple') return { rootUrl: simpleBookRootUrl(kind.source), label: `${found.label} (simple learning book)` }
    throw new Error(kind.kind === 'book' || kind.kind === 'zip-book'
      ? 'This has a book.json, so it is a learning book, not a simple one — go Back and choose “My learning book”.'
      : 'No 01.py here. A simple learning book is a folder or ZIP of numbered exercises: 01.py, 02.py, …')
  }
  if (kind.kind === 'book') return { rootUrl: kind.url, label: found.label }
  if (kind.kind === 'zip-book') {
    const existing = (await listFilesystems()).find(f => f.name === kind.url)
    if (existing) await deleteFilesystem(existing.id)
    const fsId = await createFilesystemFromFiles(kind.url, kind.files)
    return { rootUrl: `vfs://fs:${fsId}/book.json`, label: found.label }
  }
  throw new Error(kind.kind === 'simple'
    ? 'No book.json here, but there is a 01.py — go Back and choose “My simple learning book”.'
    : 'No book.json here. Choose the folder or ZIP that holds it.')
}

const TYPE_PROMPTS: Record<BookLinkType | 'none', string> = {
  none: 'What is the link to? You do not need to open the book first.',
  tutorial: 'Which of this site’s tutorials?',
  book: 'Where is your learning book? Choose the folder or ZIP holding its book.json.',
  simple: 'Where is your simple learning book? Choose the folder or ZIP holding 01.py, 02.py, …',
}

function SourcePicker({ onPick, onClose, pending }: {
  onPick: (s: StudentLinkSource) => void
  onClose: () => void
  pending?: PendingBookResource | null
}) {
  const [type, setType] = useState<BookLinkType | null>(pending?.type ?? null)
  const [catalog, setCatalog] = useState<LearningTutorial[] | null>(null)
  const [catalogError, setCatalogError] = useState('')
  const [tutorialIndex, setTutorialIndex] = useState('')
  const [found, setFound] = useState<FoundResource | null>(pending ? { url: pending.url, label: pending.label } : null)
  const [checking, setChecking] = useState(false)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    if (type !== 'tutorial' || catalog) return
    const controller = new AbortController()
    void fetchTutorialCatalog(controller.signal)
      .then(setCatalog)
      .catch(e => { if (!controller.signal.aborted) setCatalogError(e instanceof Error ? e.message : String(e)) })
    return () => controller.abort()
  }, [type, catalog])

  const check = async (kind: 'book' | 'simple', resource: FoundResource) => {
    setChecking(true); setProblem('')
    try {
      onPick(await checkBookResource(kind, resource))
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e))
    } finally { setChecking(false) }
  }

  // Something found elsewhere (Share, for a book being edited) is checked at once.
  const checkedPending = useRef(false)
  useEffect(() => {
    if (!pending || checkedPending.current) return
    checkedPending.current = true
    void check(pending.type, { url: pending.url, label: pending.label })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  const heading = (
    <div className="mb-3">
      <div className="text-sm font-bold text-white mb-1">Create a student link</div>
      <p className="text-slate-400 leading-relaxed">{TYPE_PROMPTS[type ?? 'none']}</p>
    </div>
  )

  if (type === null) {
    return (
      <>
        {heading}
        <div className="flex flex-col gap-2">
          <BigButton testId="link-type-tutorial" title="A tutorial on this site" desc="One of the learning books that come with Coder."
            icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />}
            onClick={() => setType('tutorial')} />
          <BigButton testId="link-type-book" title="My learning book" desc="A book you have made, with a book.json — on GitHub, Google Drive or elsewhere."
            icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />}
            onClick={() => setType('book')} />
          <div className="relative">
            <BigButton testId="link-type-simple" title="My simple learning book" desc="A folder or ZIP of numbered exercises — 01.py, 02.py, … — and no book.json."
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />}
              onClick={() => setType('simple')} />
            <div className="absolute right-3 top-3"><SimpleBookInfoButton /></div>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button type="button" onClick={onClose} className={secondaryBtnClass}>Cancel</button>
        </div>
      </>
    )
  }

  const back = () => { setType(null); setFound(null); setProblem('') }

  if (type === 'tutorial') {
    const tutorial = catalog && tutorialIndex !== '' ? catalog[Number(tutorialIndex)] : null
    return (
      <>
        {heading}
        {catalogError ? (
          <div className="rounded border border-red-500/30 bg-red-950/20 px-3 py-2 text-red-200">
            Could not load the list of tutorials: {catalogError}
          </div>
        ) : !catalog ? (
          <div className="text-slate-500 px-2 py-2">Loading…</div>
        ) : (
          <select aria-label="Tutorial" value={tutorialIndex} onChange={e => setTutorialIndex(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-400">
            <option value="">Choose a tutorial…</option>
            {catalog.map((t, i) => <option key={t.book ?? t.github} value={i}>{t.name}</option>)}
          </select>
        )}
        <div className="flex justify-between mt-4">
          <button type="button" onClick={back} className={secondaryBtnClass}>Back</button>
          <button type="button" disabled={!tutorial} className={primaryBtnClass}
            onClick={() => tutorial && onPick({
              rootUrl: tutorial.book ?? githubRepositoryBookUrl(tutorial.github),
              label: tutorial.name,
              mode: tutorial.mode,
            })}>
            Next
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      {heading}
      <ResourceFinder selected={found} onSelect={next => { setFound(next); setProblem('') }}
        driveNote="Share the book's ZIP with “Anyone with the link”. A folder on Drive cannot be used — share a ZIP of it." />
      {checking && <div className="text-slate-500 mt-2">Checking what is there…</div>}
      {problem && (
        <div role="alert" className="mt-2 rounded border border-red-500/40 bg-red-950/30 px-2.5 py-2 text-[11px] leading-relaxed text-red-200">
          {problem}
        </div>
      )}
      <div className="flex justify-between mt-4">
        <button type="button" onClick={back} className={secondaryBtnClass}>Back</button>
        <button type="button" disabled={!found || checking} className={primaryBtnClass}
          onClick={() => found && void check(type, found)}>
          Next
        </button>
      </div>
    </>
  )
}

// ── Publish instructions view ───────────────────────────────────────────────

function PublishHelp({ onExportZip }: { onExportZip?: (() => void) | null }) {
  const [repoUrl, setRepoUrl] = useState('')
  let repoBookUrl: string | null = null
  let repoError = ''
  if (repoUrl.trim()) {
    try { repoBookUrl = githubRepositoryBookUrl(repoUrl.trim()) }
    // The shared helper's message talks about tutorial links; in this box the
    // field is plainly a repository address, so say that instead.
    catch { repoError = 'That is not a public GitHub repository address — it should look like https://github.com/your-name/your-book' }
  }

  return (
    <>
      <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-amber-300 leading-relaxed">
        This book only exists in this browser, so there is nothing for a student link to point at yet.
        Put it somewhere public first — any of these work.
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <div className="text-slate-100 font-semibold">1. A public GitHub repository</div>
          <p className="text-slate-400 leading-relaxed mt-0.5">
            Create a public repo and put the book&apos;s files in it with <code className="book-inline-code font-mono px-1 rounded">book.json</code> at
            the top level. Updates you push show up for students straight away.
          </p>
          <div className="mt-1.5">
            <input type="url" value={repoUrl} onChange={e => setRepoUrl(e.target.value)}
              placeholder="https://github.com/your-name/your-book" className={inputClass} />
            {repoError && <div className="text-red-400 text-[11px] mt-1">{repoError}</div>}
            {repoBookUrl && <ShareLinkRow resourceUrl={repoBookUrl} />}
          </div>
        </div>

        <div>
          <div className="text-slate-100 font-semibold">2. A ZIP on any public host</div>
          <p className="text-slate-400 leading-relaxed mt-0.5">
            A student link can point at a book ZIP just as well as a <code className="book-inline-code font-mono px-1 rounded">book.json</code> —
            upload it to a repo, a release, or your school web space, then come back, choose another
            book and pick &ldquo;My learning book&rdquo;.
          </p>
          {onExportZip && (
            <button type="button" onClick={onExportZip}
              className="mt-1.5 flex items-center gap-2 px-2.5 py-1.5 rounded border border-slate-600 text-slate-300 hover:border-sky-500 hover:text-sky-300 transition-colors">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export this book as a ZIP now
            </button>
          )}
        </div>

        <div>
          <div className="text-slate-100 font-semibold">3. Google Drive</div>
          <p className="text-slate-400 leading-relaxed mt-0.5">
            Upload the ZIP to Drive, share it as <em>Anyone with the link</em>, and paste that
            share link in. Drive links are fetched through this site&apos;s proxy, so they can be
            a few minutes behind a fresh upload.
          </p>
        </div>
      </div>
    </>
  )
}

// ── Target tree rows ────────────────────────────────────────────────────────

function TargetRow({ label, kind, depth, selected, onSelect, onToggle, expanded, busy }: {
  label: string
  kind: 'book' | 'challenge' | 'section'
  depth: number
  selected: boolean
  onSelect: () => void
  onToggle?: () => void
  expanded?: boolean
  busy?: boolean
}) {
  return (
    <div className={`flex items-center gap-1 pr-2 ${selected ? 'bg-sky-500/20' : 'hover:bg-slate-500/10'}`}
      style={{ paddingLeft: 6 + depth * 12 }}>
      {kind === 'section' ? (
        <button type="button" onClick={onToggle}
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          className="text-slate-500 hover:text-slate-200 p-0.5 flex-shrink-0">
          <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ) : <span className="w-4 flex-shrink-0" />}
      <button type="button" onClick={onSelect}
        className={`flex-1 min-w-0 text-left truncate py-1 ${selected ? 'text-slate-100 font-semibold' : 'text-slate-300 hover:text-slate-100'}`}>
        {label}
      </button>
      {busy && <span className="text-slate-500 text-[10px] flex-shrink-0">loading…</span>}
    </div>
  )
}

function TreeRows({ node, depth, expanded, onToggle, targetId, onSelect }: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  onToggle: (node: TreeNode) => void
  targetId: string | null
  onSelect: (id: string) => void
}) {
  const isOpen = expanded.has(node.id)
  return (
    <>
      <TargetRow label={node.name} kind={node.kind} depth={depth}
        selected={targetId === node.id} onSelect={() => onSelect(node.id)}
        onToggle={() => void onToggle(node)} expanded={isOpen} busy={node.loading} />
      {node.error && isOpen && (
        <div className="text-red-400 text-[11px] py-1" style={{ paddingLeft: 22 + depth * 12 }}>{node.error}</div>
      )}
      {isOpen && node.children?.map((child, i) => (
        <TreeRows key={`${i}-${child.id}`} node={child} depth={depth + 1}
          expanded={expanded} onToggle={onToggle} targetId={targetId} onSelect={onSelect} />
      ))}
    </>
  )
}
