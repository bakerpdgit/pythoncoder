import { useState, useEffect, useCallback } from 'react'
import type { BookChallenge, BookManifest, BookNavState, BreadcrumbEntry, OverallTestResult } from '../types'
import {
  isBookRef, fetchBookManifest, fetchGuideContent, resolveBookUrl,
  findChallenge, getAdjacentChallenge, getChallengeFsName,
} from '../utils/bookLoader'
import { listFilesystems } from '../utils/virtualFS'
import { TestResultsBar } from './TestResultsBar'

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
}

// ── Markdown renderer ───────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderMarkdown(md: string): string {
  const codeBlocks: string[] = []
  const inlineCodes: string[] = []

  let text = md.replace(/```(?:[^\n]*)?\n([\s\S]*?)```/g, (_, code: string) => {
    codeBlocks.push(code.trimEnd())
    return `\x00B${codeBlocks.length - 1}\x00`
  })

  text = text.replace(/`([^`\n]+)`/g, (_, code: string) => {
    inlineCodes.push(code)
    return `\x00I${inlineCodes.length - 1}\x00`
  })

  text = escHtml(text)

  text = text
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold text-slate-200 mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold text-sky-300 mt-4 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold text-emerald-300 mt-3 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')

  const segments = text.split(/\n\n+/)
  const parts: string[] = []
  for (const seg of segments) {
    const s = seg.trim()
    if (!s) continue
    if (s.startsWith('<h') || s.startsWith('\x00B')) {
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

function CompletedTick() {
  return (
    <svg className="w-3 h-3 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function BookPanel({ navState, onNavStateChange, onEnterChallenge, onClose, testResult, isTestRunning, testStatus, onClearTestResult, completedChallenges }: Props) {
  const [manifest, setManifest] = useState<BookManifest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [guideMarkdown, setGuideMarkdown] = useState('')
  const [guideLoading, setGuideLoading] = useState(false)
  const [showDotMenu, setShowDotMenu] = useState(false)
  const [challengeHasFs, setChallengeHasFs] = useState(false)
  const [bookFontSize, setBookFontSize] = useState<number>(getStoredBookFontSize)

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
    void loadManifest(navState.currentBookUrl)
  }, [navState.currentBookUrl, loadManifest])

  useEffect(() => {
    if (!navState.activeChallengeId || !manifest) {
      setGuideMarkdown('')
      setChallengeHasFs(false)
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

  const handlePrevNext = useCallback((delta: -1 | 1) => {
    if (!manifest || !navState.activeChallengeId) return
    const adj = getAdjacentChallenge(manifest, navState.activeChallengeId, delta)
    if (adj) enterChallenge(adj)
  }, [manifest, navState.activeChallengeId, enterChallenge])

  const handleReset = useCallback(() => {
    setShowDotMenu(false)
    if (!navState.activeChallengeId || !manifest) return
    const challenge = findChallenge(manifest, navState.activeChallengeId)
    if (!challenge) return
    if (!window.confirm('Reset this challenge? Your edits will be lost.')) return
    onEnterChallenge(navState.currentBookUrl, challenge, true)
    setChallengeHasFs(false)
  }, [navState, manifest, onEnterChallenge])

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

  return (
    <div className="flex flex-col h-full overflow-hidden text-xs select-none">
      {/* Header */}
      <div className="bg-slate-900 py-1.5 px-2 border-b border-slate-700 flex-shrink-0 flex items-center gap-1">
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
                <div className="absolute right-0 top-full mt-1 z-50 bg-slate-800 border border-slate-600 rounded shadow-xl py-1 min-w-[120px]"
                  onMouseLeave={() => setShowDotMenu(false)}>
                  <button type="button" onClick={handleReset} disabled={!challengeHasFs}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-700 text-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors">
                    Reset challenge
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Font size controls */}
        <button type="button" onClick={() => adjustFontSize(-1)}
          disabled={bookFontSize === BOOK_FONT_SIZES[0]}
          title="Decrease font size"
          className="text-slate-500 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed p-0.5 flex-shrink-0 text-[9px] font-bold leading-none">A−</button>
        <button type="button" onClick={() => adjustFontSize(1)}
          disabled={bookFontSize === BOOK_FONT_SIZES[BOOK_FONT_SIZES.length - 1]}
          title="Increase font size"
          className="text-slate-500 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed p-0.5 flex-shrink-0 text-[11px] font-bold leading-none">A+</button>

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
              ) : (
                <div
                  className={`text-slate-300 leading-relaxed book-font-${bookFontSize}`}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(guideMarkdown) }}
                />
              )}
            </div>
          )}

          {/* Book/challenge list */}
          {!loading && !error && !navState.activeChallengeId && manifest && (
            <div className="py-1">
              {manifest.children.map(child => {
                if (isBookRef(child)) {
                  return (
                    <button type="button" key={child.id}
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
                const done = isCompleted(child.id)
                return (
                  <button type="button" key={child.id}
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
