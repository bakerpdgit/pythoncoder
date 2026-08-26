import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookChild, BookManifest } from '../../types'
import { fetchBookManifest, findBookTargetById, isBookRef, resolveBookShareSource, resolveBookUrl } from '../../utils/bookLoader'
import { githubRepositoryBookUrl } from '../../utils/bookSource'
import { fetchTutorialCatalog, type LearningTutorial } from '../../utils/tutorialCatalog'
import type { WorkerRunMode } from '../../utils/urlRunMode'
import { ShareLinkRow, inputClass, primaryBtnClass, secondaryBtnClass } from './webWizardShared'

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

export function StudentLinkDialog({ initialSource, initialTargetId, onClose, onExportZip }: Props) {
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
    return shell(<SourcePicker onPick={s => { setSource(s); setMode(s.mode ?? '') }} onClose={onClose} />)
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
        {treeError && <div className="px-2 py-1.5 text-red-400 text-[11px]">{treeError}</div>}
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

      <ShareLinkRow resourceUrl={publicUrl}
        options={{ challengeId: targetId ?? undefined, mode: mode || undefined, showFirst }}
        label={targetId === null
          ? 'Student link — opens this book directly:'
          : 'Student link — opens this activity directly:'} />

      {footer}
    </>
  )
}

// ── Source picker view ──────────────────────────────────────────────────────

function SourcePicker({ onPick, onClose }: { onPick: (s: StudentLinkSource) => void; onClose: () => void }) {
  const [catalog, setCatalog] = useState<LearningTutorial[] | null>(null)
  const [catalogError, setCatalogError] = useState('')
  const [url, setUrl] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void fetchTutorialCatalog(controller.signal)
      .then(setCatalog)
      .catch(e => { if (!controller.signal.aborted) setCatalogError(e instanceof Error ? e.message : String(e)) })
    return () => controller.abort()
  }, [])

  const pasted = url.trim()
  const pastedValid = /^https?:\/\//i.test(pasted)

  return (
    <>
      <div className="mb-3">
        <div className="text-sm font-bold text-white mb-1">Create a student link</div>
        <p className="text-slate-400 leading-relaxed">
          Which learning book? You do not need to open it first.
        </p>
      </div>

      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Learning books</div>
      {catalogError ? (
        <div className="rounded border border-red-500/30 bg-red-950/20 px-3 py-2 text-red-200">
          Could not load the book list: {catalogError}
        </div>
      ) : !catalog ? (
        <div className="text-slate-500 px-2 py-2">Loading…</div>
      ) : (
        <div className="max-h-44 overflow-y-auto rounded border border-slate-700 divide-y divide-slate-800">
          {catalog.map(tutorial => (
            <button key={tutorial.book ?? tutorial.github} type="button"
              onClick={() => onPick({
                rootUrl: tutorial.book ?? githubRepositoryBookUrl(tutorial.github),
                label: tutorial.name,
                mode: tutorial.mode,
              })}
              className="w-full text-left px-2 py-1.5 text-slate-300 hover:bg-slate-700 hover:text-emerald-300 transition-colors">
              {tutorial.name}
            </button>
          ))}
        </div>
      )}

      <div className="text-[11px] uppercase tracking-wider text-slate-500 mt-3 mb-1">Or a book at any public URL</div>
      <div className="flex gap-2">
        <input type="url" value={url} onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && pastedValid) onPick({ rootUrl: pasted, label: pasted }) }}
          placeholder="https://…/book.json — or a book ZIP" className={inputClass} />
        <button type="button" disabled={!pastedValid}
          onClick={() => onPick({ rootUrl: pasted, label: pasted })}
          className={primaryBtnClass}>Use</button>
      </div>

      <div className="flex justify-end mt-4">
        <button type="button" onClick={onClose} className={secondaryBtnClass}>Cancel</button>
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
            upload it to a repo, a release, or your school web space, then come back and paste
            its address into &ldquo;Or a book at any public URL&rdquo;.
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
