import { useState, useEffect, useCallback, useRef } from 'react'
import type { BookChallenge, BookManifest, BookNavState, BookTestOutputReq, BreadcrumbEntry, OverallTestResult } from '../types'
import { GuideEditor } from './editors/GuideEditor'
import {
  isBookRef, fetchBookManifest, fetchGuideContent, resolveBookUrl,
  findChallenge, getAdjacentChallenge, getChallengeFsName,
} from '../utils/bookLoader'
import { listFilesystems, getEntryByPath, getAllFiles } from '../utils/virtualFS'
import { TestResultsBar } from './TestResultsBar'
import { useDialogs } from './dialogs/DialogProvider'
import TesterWorker from '../workers/tester.worker.ts?worker'

interface Props {
  navState: BookNavState
  onNavStateChange: (state: BookNavState) => void
  onEnterChallenge: (bookUrl: string, challenge: BookChallenge, forceReset?: boolean) => void
  onClose: () => void
  testResult: OverallTestResult | null
  isTestRunning: boolean
  testStatus: string
  onClearTestResult: () => void
  completedChallenges: Record<string, boolean>
  isCollapsed: boolean
  onToggleCollapse: () => void
  // ── Teacher edit mode ──
  editMode?: boolean
  editManifest?: BookManifest | null
  transientTicks?: Set<string>
  onAddExercise?: (afterId?: string) => void
  onDeleteExercise?: (id: string) => void
  onMoveExercise?: (id: string, dir: -1 | 1) => void
  onRenameExercise?: (id: string, name: string) => void
  onToggleExample?: (id: string) => void
  onSaveGuide?: (guidePath: string, markdown: string) => void
}

// ── Markdown renderer ───────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderMarkdown(md: string, previewSvg: string | null, previewLoading: boolean): string {
  const codeBlocks: string[] = []
  const inlineCodes: string[] = []

  // Extract turtle preview tokens before HTML escaping. Supports markdown
  // image syntax `![alt](turtlepreview)` and the legacy `{{turtle_preview}}`.
  let text = md.replace(/!\[[^\]]*\]\(turtlepreview\)/g, '\x00TP\x00')
                .replace(/\{\{turtle_preview\}\}/g, '\x00TP\x00')

  text = text.replace(/```(?:[^\n]*)?\n([\s\S]*?)```/g, (_, code: string) => {
    codeBlocks.push(code.trimEnd())
    return `\x00B${codeBlocks.length - 1}\x00`
  })

  text = text.replace(/`([^`\n]+)`/g, (_, code: string) => {
    inlineCodes.push(code)
    return `\x00I${inlineCodes.length - 1}\x00`
  })

  text = escHtml(text)

  text = text
    .replace(/^### (.+)$/gm, '<h3 style="font-size:1.1em" class="font-bold text-slate-200 mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:1.25em" class="font-bold text-sky-300 mt-4 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:1.5em" class="font-bold text-emerald-300 mt-3 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')

  const segments = text.split(/\n\n+/)
  const parts: string[] = []
  for (const seg of segments) {
    const s = seg.trim()
    if (!s) continue
    if (s.startsWith('<h') || s.startsWith('\x00B') || s.startsWith('\x00TP')) {
      parts.push(s.replace(/\n/g, ' '))
    } else {
      parts.push(`<p class="mb-3 leading-relaxed">${s.replace(/\n/g, '<br>')}</p>`)
    }
  }
  text = parts.join('\n')

  text = text.replace(/\x00B(\d+)\x00/g, (_, i: string) => {
    const code = codeBlocks[parseInt(i)]
    return `<pre class="font-mono text-xs bg-slate-950 border border-slate-700 rounded p-2 overflow-x-auto my-2 text-emerald-300 whitespace-pre">${escHtml(code)}</pre>`
  })

  text = text.replace(/\x00I(\d+)\x00/g, (_, i: string) => {
    const code = inlineCodes[parseInt(i)]
    return `<code class="book-inline-code font-mono text-xs px-1 rounded">${escHtml(code)}</code>`
  })

  text = text.replace(/\x00TP\x00/g, () => {
    if (previewSvg) {
      return `<div class="my-2 flex justify-center"><div class="turtle-preview-wrapper">${previewSvg}</div></div>`
    }
    if (previewLoading) {
      return '<div class="border border-slate-700 rounded p-3 my-2 text-center text-slate-500 italic text-xs">Generating turtle preview…</div>'
    }
    return '<div class="border border-slate-700 rounded p-3 my-2 text-center text-slate-500 italic text-xs">Turtle preview unavailable</div>'
  })

  return text
}

// ── Component ───────────────────────────────────────────────────────────────

const BOOK_FONT_SIZES = [11, 12, 13, 14, 16, 18] as const
const DEFAULT_BOOK_FONT_SIZE = 13

function getStoredBookFontSize(): number {
  try {
    const v = localStorage.getItem('aqa_book_font_size')
    if (v) { const n = parseInt(v, 10); if (BOOK_FONT_SIZES.includes(n as typeof BOOK_FONT_SIZES[number])) return n }
  } catch { /* ignore */ }
  return DEFAULT_BOOK_FONT_SIZE
}

// Strip the SVG's fixed width/height attributes and add a matching viewBox so
// CSS can scale it responsively to the available panel width.
function makeResponsiveSvg(svg: string): string {
  const w = svg.match(/<svg[^>]*?\swidth="(\d+(?:\.\d+)?)"/)?.[1]
  const h = svg.match(/<svg[^>]*?\sheight="(\d+(?:\.\d+)?)"/)?.[1]
  if (!w || !h) return svg
  let result = svg
  if (!/<svg[^>]*\sviewBox=/.test(result)) {
    result = result.replace(/<svg([^>]*)>/, `<svg$1 viewBox="0 0 ${w} ${h}">`)
  }
  return result
    .replace(/(<svg[^>]*?)\swidth="\d+(?:\.\d+)?"/, '$1')
    .replace(/(<svg[^>]*?)\sheight="\d+(?:\.\d+)?"/, '$1')
}

function CompletedTick() {
  return (
    <svg className="w-3 h-3 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function BookPanel({ navState, onNavStateChange, onEnterChallenge, onClose, testResult, isTestRunning, testStatus, onClearTestResult, completedChallenges, isCollapsed, onToggleCollapse,
  editMode = false, editManifest = null, transientTicks, onAddExercise, onDeleteExercise, onMoveExercise, onRenameExercise, onToggleExample, onSaveGuide }: Props) {
  const dialogs = useDialogs()
  const [manifest, setManifest] = useState<BookManifest | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [guideMarkdown, setGuideMarkdown] = useState('')
  const [guideLoading, setGuideLoading] = useState(false)
  const [showDotMenu, setShowDotMenu] = useState(false)
  const [challengeHasFs, setChallengeHasFs] = useState(false)
  const [bookFontSize, setBookFontSize] = useState<number>(getStoredBookFontSize)
  const [previewSvg, setPreviewSvg] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const previewWorkerRef = useRef<Worker | null>(null)

  useEffect(() => {
    try { localStorage.setItem('aqa_book_font_size', String(bookFontSize)) } catch { /* ignore */ }
  }, [bookFontSize])

  const adjustFontSize = useCallback((delta: -1 | 1) => {
    setBookFontSize(prev => {
      const idx = BOOK_FONT_SIZES.indexOf(prev as typeof BOOK_FONT_SIZES[number])
      const next = idx + delta
      if (next < 0 || next >= BOOK_FONT_SIZES.length) return prev
      return BOOK_FONT_SIZES[next]
    })
  }, [])

  const loadManifest = useCallback(async (url: string) => {
    setLoading(true)
    setError('')
    try {
      const m = await fetchBookManifest(url)
      setManifest(m)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // In edit mode the live manifest is owned by App (bookEditStore); render it
    // directly instead of re-fetching book.json from the VFS.
    if (editMode && editManifest) { setManifest(editManifest); setLoading(false); setError(''); return }
    void loadManifest(navState.currentBookUrl)
  }, [navState.currentBookUrl, loadManifest, editMode, editManifest])

  useEffect(() => {
    if (!navState.activeChallengeId || !manifest) {
      setGuideMarkdown('')
      setChallengeHasFs(false)
      setPreviewSvg(null)
      setPreviewLoading(false)
      return
    }
    const challenge = findChallenge(manifest, navState.activeChallengeId)
    if (!challenge?.guide) { setGuideMarkdown(''); return }

    setGuideLoading(true)
    void fetchGuideContent(navState.currentBookUrl, challenge.guide)
      .then(md => setGuideMarkdown(md))
      .catch(e => setGuideMarkdown(`_Error loading guide: ${e instanceof Error ? e.message : String(e)}_`))
      .finally(() => setGuideLoading(false))

    const fsName = getChallengeFsName(navState.activeChallengeId)
    void listFilesystems().then(list => setChallengeHasFs(list.some(f => f.name === fsName)))
  }, [navState.activeChallengeId, navState.currentBookUrl, manifest])

  // Generate turtle preview SVG when a challenge with `![preview](turtlepreview)` loads
  useEffect(() => {
    if (previewWorkerRef.current) {
      previewWorkerRef.current.terminate()
      previewWorkerRef.current = null
    }
    setPreviewSvg(null)

    if (!navState.activeChallengeId || !manifest || !guideMarkdown) {
      setPreviewLoading(false)
      return
    }
    const hasPreviewToken = /!\[[^\]]*\]\(turtlepreview\)|\{\{turtle_preview\}\}/.test(guideMarkdown)
    if (!hasPreviewToken) { setPreviewLoading(false); return }

    const challenge = findChallenge(manifest, navState.activeChallengeId)
    if (!challenge?.tests?.length) { setPreviewLoading(false); return }

    // Find first test case with a 't' requirement that names a filename
    let solutionFilename: string | undefined
    let firstInputs: Array<string | number> = []
    for (const tc of challenge.tests) {
      const reqs = Array.isArray(tc.out) ? (tc.out as BookTestOutputReq[]) : []
      const tReq = reqs.find(r => r.typ === 't' && r.filename)
      if (tReq?.filename) {
        solutionFilename = tReq.filename
        firstInputs = Array.isArray(tc.in)
          ? tc.in
          : tc.in !== undefined && tc.in !== ''
            ? [tc.in as string]
            : []
        break
      }
    }
    if (!solutionFilename) { setPreviewLoading(false); return }

    let cancelled = false
    setPreviewLoading(true)

    void (async () => {
      try {
        const fsName = getChallengeFsName(navState.activeChallengeId!)
        const fsList = await listFilesystems()
        const fs = fsList.find(f => f.name === fsName || f.name.startsWith(fsName + ':'))
        if (!fs) { if (!cancelled) setPreviewLoading(false); return }

        const entry = await getEntryByPath(fs.id, '/' + solutionFilename!.replace(/^\//, ''))
        if (!entry?.content) { if (!cancelled) setPreviewLoading(false); return }
        const solutionCode = new TextDecoder().decode(entry.content)

        const allFiles = await getAllFiles(fs.id)
        if (cancelled) return

        const worker = new TesterWorker()
        previewWorkerRef.current = worker
        worker.onmessage = (e: MessageEvent) => {
          if (cancelled) return
          if (e.data.type === 'preview_done') {
            const raw = String(e.data.svg ?? '')
            setPreviewSvg(raw ? makeResponsiveSvg(raw) : '')
            setPreviewLoading(false)
            worker.terminate()
            if (previewWorkerRef.current === worker) previewWorkerRef.current = null
          } else if (e.data.type === 'preview_error') {
            setPreviewSvg(null)
            setPreviewLoading(false)
            worker.terminate()
            if (previewWorkerRef.current === worker) previewWorkerRef.current = null
          }
        }
        worker.postMessage({
          type: 'preview_turtle',
          solutionCode,
          inputs: firstInputs,
          files: allFiles.map(f => ({ path: f.path, content: f.content })),
        })
      } catch {
        if (!cancelled) setPreviewLoading(false)
      }
    })()

    return () => {
      cancelled = true
      if (previewWorkerRef.current) {
        previewWorkerRef.current.terminate()
        previewWorkerRef.current = null
      }
    }
  }, [navState.activeChallengeId, manifest, guideMarkdown])

  const navigateInto = useCallback(async (bookLink: string, name: string) => {
    const newUrl = resolveBookUrl(navState.currentBookUrl, bookLink)
    const newCrumb: BreadcrumbEntry = { name, bookUrl: navState.currentBookUrl }
    onNavStateChange({
      ...navState,
      currentBookUrl: newUrl,
      breadcrumb: [...navState.breadcrumb, newCrumb],
      activeChallengeId: null,
    })
  }, [navState, onNavStateChange])

  const navigateToCrumb = useCallback((crumbIndex: number) => {
    if (crumbIndex >= navState.breadcrumb.length) return
    const crumb = navState.breadcrumb[crumbIndex]
    onNavStateChange({
      ...navState,
      currentBookUrl: crumb.bookUrl,
      breadcrumb: navState.breadcrumb.slice(0, crumbIndex),
      activeChallengeId: null,
    })
  }, [navState, onNavStateChange])

  const navigateUp = useCallback(() => {
    if (navState.activeChallengeId) {
      onNavStateChange({ ...navState, activeChallengeId: null })
      return
    }
    if (navState.breadcrumb.length === 0) { onClose(); return }
    const crumb = navState.breadcrumb[navState.breadcrumb.length - 1]
    onNavStateChange({
      ...navState,
      currentBookUrl: crumb.bookUrl,
      breadcrumb: navState.breadcrumb.slice(0, -1),
      activeChallengeId: null,
    })
  }, [navState, onNavStateChange, onClose])

  const enterChallenge = useCallback((challenge: BookChallenge) => {
    onNavStateChange({ ...navState, activeChallengeId: challenge.id })
    onEnterChallenge(navState.currentBookUrl, challenge)
  }, [navState, onNavStateChange, onEnterChallenge])

  const handleDeleteExercise = useCallback(async (challenge: BookChallenge) => {
    if (!(await dialogs.confirm({
      title: 'Delete exercise',
      message: `Delete "${challenge.name}" and its files? This cannot be undone.`,
      confirmLabel: 'Delete', danger: true,
    }))) return
    onDeleteExercise?.(challenge.id)
  }, [dialogs, onDeleteExercise])

  const handlePrevNext = useCallback((delta: -1 | 1) => {
    if (!manifest || !navState.activeChallengeId) return
    const adj = getAdjacentChallenge(manifest, navState.activeChallengeId, delta)
    if (adj) enterChallenge(adj)
  }, [manifest, navState.activeChallengeId, enterChallenge])

  const handleReset = useCallback(async () => {
    setShowDotMenu(false)
    if (!navState.activeChallengeId || !manifest) return
    const challenge = findChallenge(manifest, navState.activeChallengeId)
    if (!challenge) return
    if (!(await dialogs.confirm({
      title: 'Reset challenge',
      message: 'Reset this challenge? Your edits will be lost.',
      confirmLabel: 'Reset', danger: true,
    }))) return
    onEnterChallenge(navState.currentBookUrl, challenge, true)
    setChallengeHasFs(false)
  }, [navState, manifest, onEnterChallenge, dialogs])

  const isCompleted = useCallback((challengeId: string) =>
    completedChallenges[`${navState.rootUrl}::${challengeId}`] === true,
  [completedChallenges, navState.rootUrl])

  const crumbItems = [
    { label: navState.breadcrumb[0]?.name ?? manifest?.name ?? 'Book', index: -1 },
    ...navState.breadcrumb.slice(1).map((b, i) => ({ label: b.name, index: i })),
    ...(manifest && !navState.activeChallengeId ? [{ label: manifest.name ?? '…', index: navState.breadcrumb.length }] : []),
  ]

  const activeChallenge = manifest && navState.activeChallengeId
    ? findChallenge(manifest, navState.activeChallengeId) : null

  const prevChallenge = manifest && navState.activeChallengeId
    ? getAdjacentChallenge(manifest, navState.activeChallengeId, -1) : null
  const nextChallenge = manifest && navState.activeChallengeId
    ? getAdjacentChallenge(manifest, navState.activeChallengeId, 1) : null

  if (isCollapsed) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="bg-slate-900 py-1.5 px-1 border-b border-slate-700 flex-shrink-0 flex items-center justify-center">
          <button type="button" title="Expand book panel" onClick={onToggleCollapse}
            className="text-slate-400 hover:text-slate-200 p-0.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden text-xs select-none">
      {/* Header */}
      <div className="bg-slate-900 py-1.5 px-2 border-b border-slate-700 flex-shrink-0 flex items-center gap-1">
        {/* Collapse button */}
        <button type="button" title="Collapse book panel" onClick={onToggleCollapse}
          className="text-slate-400 hover:text-slate-200 p-0.5 flex-shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
        {/* Back arrow */}
        <button type="button"
          onClick={navigateUp}
          title="Go back"
          className="text-slate-400 hover:text-slate-200 p-0.5 flex-shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Breadcrumb */}
        <div className="flex-1 flex items-center gap-0.5 overflow-hidden">
          {crumbItems.map((item, i) => (
            <span key={i} className="flex items-center gap-0.5 min-w-0">
              {i > 0 && <span className="text-slate-600 flex-shrink-0">›</span>}
              <button type="button"
                onClick={() => item.index === -1 ? onNavStateChange({ ...navState, currentBookUrl: navState.rootUrl, breadcrumb: [], activeChallengeId: null }) : navigateToCrumb(item.index)}
                className={`truncate hover:text-slate-200 transition-colors min-w-0 ${i === crumbItems.length - 1 ? 'text-slate-200' : 'text-slate-500'}`}
                title={item.label}>
                {item.label}
              </button>
            </span>
          ))}
          {navState.activeChallengeId && activeChallenge && (
            <span className="flex items-center gap-0.5 min-w-0">
              <span className="text-slate-600 flex-shrink-0">›</span>
              <span className="truncate text-slate-200 min-w-0" title={activeChallenge.name}>{activeChallenge.name}</span>
            </span>
          )}
        </div>

        {/* Prev / next (challenges only) */}
        {navState.activeChallengeId && (
          <>
            <button type="button" onClick={() => handlePrevNext(-1)} disabled={!prevChallenge}
              title={prevChallenge ? `Previous: ${prevChallenge.name}` : 'No previous challenge'}
              className="text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed p-0.5 flex-shrink-0">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
            <button type="button" onClick={() => handlePrevNext(1)} disabled={!nextChallenge}
              title={nextChallenge ? `Next: ${nextChallenge.name}` : 'No next challenge'}
              className="text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed p-0.5 flex-shrink-0">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
            {/* Options menu */}
            <div className="relative flex-shrink-0">
              <button type="button" title="Options" onClick={() => setShowDotMenu(o => !o)}
                className="text-slate-400 hover:text-slate-200 p-0.5">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                </svg>
              </button>
              {showDotMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-slate-800 border border-slate-600 rounded shadow-xl py-1 min-w-[140px]"
                  onMouseLeave={() => setShowDotMenu(false)}>
                  <button type="button" onClick={() => adjustFontSize(1)}
                    disabled={bookFontSize === BOOK_FONT_SIZES[BOOK_FONT_SIZES.length - 1]}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-700 text-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors">
                    Increase font size
                  </button>
                  <button type="button" onClick={() => adjustFontSize(-1)}
                    disabled={bookFontSize === BOOK_FONT_SIZES[0]}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-700 text-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors">
                    Decrease font size
                  </button>
                  <div className="border-t border-slate-700 my-1" />
                  <button type="button" onClick={() => void handleReset()} disabled={!challengeHasFs}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-700 text-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors">
                    Reset challenge
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Close book */}
        <button type="button" onClick={onClose} title="Close book"
          className="text-slate-500 hover:text-slate-200 p-0.5 flex-shrink-0 ml-0.5">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <TestResultsBar
          result={testResult}
          isRunning={isTestRunning}
          status={testStatus}
          onClose={onClearTestResult}
        />
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <svg className="w-4 h-4 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading…
            </div>
          )}
          {error && !loading && (
            <div className="p-3 text-red-400">{error}</div>
          )}

          {/* Challenge instructions */}
          {!loading && !error && navState.activeChallengeId && (
            <div className="p-3">
              {guideLoading ? (
                <div className="text-slate-500 flex items-center gap-1">
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Loading guide…
                </div>
              ) : editMode && activeChallenge?.guide ? (
                <GuideEditor
                  key={activeChallenge.id}
                  initialMarkdown={guideMarkdown}
                  onSave={md => onSaveGuide?.(activeChallenge.guide!, md)}
                />
              ) : (
                <div
                  className={`text-slate-300 leading-relaxed book-font-${bookFontSize}`}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(guideMarkdown, previewSvg, previewLoading) }}
                />
              )}
            </div>
          )}

          {/* Book/challenge list */}
          {!loading && !error && !navState.activeChallengeId && manifest && (
            <div className="py-1">
              {manifest.children.map((child, i) => {
                if (isBookRef(child)) {
                  return (
                    <button type="button" key={`${i}-${child.id}`}
                      onClick={() => void navigateInto(child.bookLink, child.name)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-700 transition-colors text-slate-300 hover:text-slate-100">
                      <svg className="w-4 h-4 text-sky-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      <span className="flex-1 truncate text-xs">{child.name}</span>
                      <svg className="w-3 h-3 text-slate-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )
                }
                const isExample = child.isExample === 'True' || child.isExample === true
                const done = editMode ? (transientTicks?.has(child.id) ?? false) : isCompleted(child.id)

                if (editMode) {
                  const isRenaming = renamingId === child.id
                  const canUp = i > 0
                  const canDown = i < manifest.children.length - 1
                  const commitRename = () => {
                    const name = renameDraft.trim()
                    if (name && name !== child.name) onRenameExercise?.(child.id, name)
                    setRenamingId(null)
                  }
                  return (
                    <div key={`${i}-${child.id}`} className="group flex items-center gap-1 px-2 py-1.5 hover:bg-slate-700/60 transition-colors">
                      {/* Rename (pencil) */}
                      <button type="button" title="Rename exercise"
                        onClick={() => { setRenamingId(child.id); setRenameDraft(child.name) }}
                        className="text-slate-500 hover:text-sky-300 p-0.5 flex-shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {/* Example / task toggle */}
                      <button type="button" title={isExample ? 'Marked as example — click to make it a task' : 'Marked as task — click to make it an example'}
                        onClick={() => onToggleExample?.(child.id)}
                        className={`flex-shrink-0 p-0.5 ${isExample ? 'text-slate-400 hover:text-emerald-400' : 'text-emerald-400 hover:text-slate-400'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </button>
                      {isRenaming ? (
                        <input autoFocus value={renameDraft} onChange={e => setRenameDraft(e.target.value)}
                          aria-label="Exercise name" title="Exercise name"
                          onBlur={commitRename}
                          onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null) }}
                          className="flex-1 min-w-0 bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-400" />
                      ) : (
                        <button type="button" onClick={() => enterChallenge(child)}
                          className="flex-1 min-w-0 text-left truncate text-xs text-slate-300 hover:text-slate-100">
                          {child.name}
                          {done && <span className="ml-1 text-emerald-400">✓</span>}
                          {!isExample && <span className="ml-1 text-[9px] text-emerald-500 font-semibold">task</span>}
                        </button>
                      )}
                      {/* Up / down / delete */}
                      <div className="flex items-center flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button type="button" title="Move up" disabled={!canUp} onClick={() => onMoveExercise?.(child.id, -1)}
                          className="text-slate-500 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed p-0.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <button type="button" title="Move down" disabled={!canDown} onClick={() => onMoveExercise?.(child.id, 1)}
                          className="text-slate-500 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed p-0.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        <button type="button" title="Delete exercise" onClick={() => void handleDeleteExercise(child)}
                          className="text-slate-500 hover:text-red-400 p-0.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                  <button type="button" key={`${i}-${child.id}`}
                    onClick={() => enterChallenge(child)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-700 transition-colors text-slate-300 hover:text-slate-100">
                    <svg className={`w-4 h-4 flex-shrink-0 ${isExample ? 'text-slate-400' : 'text-emerald-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="flex-1 truncate text-xs">{child.name}</span>
                    {done && <CompletedTick />}
                    {!isExample && !done && (
                      <span className="text-[9px] text-emerald-500 flex-shrink-0 font-semibold">task</span>
                    )}
                  </button>
                )
              })}

              {editMode && (
                <button type="button" onClick={() => onAddExercise?.()}
                  className="mt-1 w-full flex items-center gap-2 px-3 py-2 text-left text-sky-400 hover:text-sky-300 hover:bg-slate-700/60 transition-colors border-t border-slate-700/60">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-xs font-medium">Add exercise</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
