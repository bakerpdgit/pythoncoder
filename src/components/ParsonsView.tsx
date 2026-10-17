import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Monaco } from '@monaco-editor/react'
import { assembleCode, maxIndentAt, parsonsRows } from '../utils/parsons'
import type {
  ParsonsArrangement,
  ParsonsBlockArrangement,
  ParsonsFeedback,
  ParsonsProblem,
  ParsonsRow,
} from '../utils/parsons'

/**
 * A Parsons puzzle shown as the program it is: fixed lines in place, the
 * movable ones with a handle, struck-out lines left where they were. One view,
 * no bank — see utils/parsons.ts for the model.
 */

interface Props {
  problem: ParsonsProblem
  arrangement: ParsonsArrangement
  onChange: (next: ParsonsArrangement) => void
  feedback: ParsonsFeedback | null
  onShuffle: () => void
  /** The code editor's Monaco, for its Python tokenizer. Never a second instance:
   *  each one adds its own theme stylesheet, which recolours the real editor. */
  monaco: Monaco | null
  /** Colorize lines as Python (off for books whose lines aren't code). */
  highlightPython: boolean
  fontSize: number
  disabled?: boolean
  /** The program line the debugger is on, or -1. */
  activeLine?: number
}

/** Pointer travel before a press becomes a drag, so clicks and focus still work. */
const DRAG_THRESHOLD = 4

type FragmentRow = Extract<ParsonsRow, { kind: 'fragment' }>

interface DragState {
  id: string
  blockId: string
  pointerId: number
  offsetX: number
  offsetY: number
  width: number
  startX: number
  startY: number
  startLevel: number
  x: number
  y: number
  active: boolean
  drop: { index: number; level: number } | null
}

function blockOf(arrangement: ParsonsArrangement, blockId: string): ParsonsBlockArrangement {
  return arrangement.blocks[blockId] ?? { order: [], removed: [], indents: {} }
}

function withBlock(arrangement: ParsonsArrangement, blockId: string, next: ParsonsBlockArrangement): ParsonsArrangement {
  return { v: 2, blocks: { ...arrangement.blocks, [blockId]: next } }
}

/** Move a fragment within its block, optionally to a new level. */
function moveWithin(block: ParsonsBlockArrangement, id: string, index: number, level: number | null): ParsonsBlockArrangement {
  const order = block.order.filter(o => o !== id)
  order.splice(Math.max(0, Math.min(index, order.length)), 0, id)
  const indents = { ...block.indents }
  if (level !== null) {
    if (level > 0) indents[id] = level
    else delete indents[id]
  }
  return { ...block, order, indents }
}

interface TokenSpan { text: string; kind: 'keyword' | 'string' | 'number' | 'comment' | null }

/** The token kinds the editor theme colours (MONACO_DARK_THEME / _LIGHT_THEME). */
function tokenKind(type: string): TokenSpan['kind'] {
  if (type.startsWith('keyword')) return 'keyword'
  if (type.startsWith('string')) return 'string'
  if (type.startsWith('number')) return 'number'
  if (type.startsWith('comment')) return 'comment'
  return null
}

const splitLead = (text: string) => {
  const lead = text.slice(0, text.length - text.replace(/^\s+/, '').length)
  return [lead, text.slice(lead.length)] as const
}

export function ParsonsView({
  problem, arrangement, onChange, feedback, onShuffle, monaco,
  highlightPython, fontSize, disabled = false, activeLine = -1,
}: Props) {
  const [colorized, setColorized] = useState<Record<string, TokenSpan[]>>({})
  const [drag, setDrag] = useState<DragState | null>(null)
  const [levelPx, setLevelPx] = useState(32)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLSpanElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag

  const studentIndents = problem.indentMode === 'student'
  const rows = useMemo(() => parsonsRows(problem, arrangement), [problem, arrangement])
  const { rowAt } = useMemo(() => assembleCode(problem, arrangement), [problem, arrangement])
  const activeKey = activeLine > 0 ? rowAt[activeLine] : undefined
  const hasDistractors = problem.blocks.some(b => b.pool.some(l => l.distractor))

  // One level of indentation in pixels, so a sideways drag of one indent step
  // moves a line one level — the same distance the code itself moves.
  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    const ch = el.getBoundingClientRect().width / 10
    const unit = problem.indentUnit === '\t' ? 4 : problem.indentUnit.length
    if (ch > 0) setLevelPx(Math.max(ch * unit, 12))
  }, [fontSize, problem.indentUnit])

  // ── Syntax highlighting ────────────────────────────────────────────────
  // Monaco's Python tokenizer, coloured with the editor theme's own rules
  // (styles/index.css, .parsons-tok-*). Not colorize(): its `mtk` classes are
  // styled by whichever Monaco theme stylesheet the page loaded last, and a
  // second Monaco instance (the dev server's loader switch) turned them black.
  // Each line is coloured without its indentation, which is drawn as spaces.
  useEffect(() => {
    if (!monaco || !highlightPython) { setColorized({}); return }
    let cancelled = false
    const texts = new Set<string>()
    for (const row of rows) {
      for (const t of row.kind === 'fixed' ? [row.text] : row.text) {
        const code = splitLead(t)[1]
        if (code) texts.add(code)
      }
    }
    void (async () => {
      // colorize() waits for the Python grammar to load; tokenize() does not.
      try { await monaco.editor.colorize('pass', 'python', {}) } catch { /* plain text */ }
      const out: Record<string, TokenSpan[]> = {}
      for (const text of texts) {
        try {
          const tokens = monaco.editor.tokenize(text, 'python')[0] ?? []
          out[text] = tokens.map((tok: { offset: number; type: string }, i: number) => ({
            text: text.slice(tok.offset, tokens[i + 1]?.offset ?? text.length),
            kind: tokenKind(tok.type),
          }))
        } catch { /* plain text for this line */ }
      }
      if (!cancelled) setColorized(out)
    })()
    return () => { cancelled = true }
    // Rows change on every move; the set of texts only when the problem does
    // (or, in student indentation, never — the code is coloured without its lead).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco, problem, highlightPython])

  // ── Changes ────────────────────────────────────────────────────────────
  const change = (blockId: string, next: ParsonsBlockArrangement) => onChange(withBlock(arrangement, blockId, next))

  const toggleRemoved = (row: FragmentRow) => {
    const block = blockOf(arrangement, row.blockId)
    const removed = row.removed ? block.removed.filter(r => r !== row.key) : [...block.removed, row.key]
    change(row.blockId, { ...block, removed })
  }

  const setLevel = (row: FragmentRow, level: number) => {
    const block = blockOf(arrangement, row.blockId)
    const max = maxIndentAt(block, row.key)
    change(row.blockId, moveWithin(block, row.key, row.index, Math.max(0, Math.min(level, max))))
  }

  // Focus follows a line as it moves. Done once React has committed the move
  // (not on an animation frame, which a hidden or throttled tab never paints).
  const pendingFocusRef = useRef<string | null>(null)
  const focusNow = (id: string) =>
    scrollRef.current?.querySelector<HTMLElement>(`[data-frag-id="${CSS.escape(id)}"]`)?.focus()
  const focusRow = (id: string) => {
    pendingFocusRef.current = id
    focusNow(id)
  }
  useLayoutEffect(() => {
    const id = pendingFocusRef.current
    if (id === null) return
    pendingFocusRef.current = null
    focusNow(id)
  })

  // ── Drag ───────────────────────────────────────────────────────────────
  const computeDrop = useCallback((state: DragState, clientX: number, clientY: number) => {
    const band = scrollRef.current?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(state.blockId)}"]`)
    if (!band) return null
    const items = Array.from(band.querySelectorAll<HTMLElement>('[data-frag-id]'))
      .filter(el => el.dataset.fragId !== state.id)
    let index = items.length
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect()
      if (clientY < r.top + r.height / 2) { index = i; break }
    }
    let level = state.startLevel
    if (studentIndents) {
      const block = blockOf(arrangement, state.blockId)
      const moved = moveWithin(block, state.id, index, null)
      const max = maxIndentAt(moved, state.id)
      level = Math.max(0, Math.min(state.startLevel + Math.round((clientX - state.startX) / levelPx), max))
    }
    return { index, level }
  }, [arrangement, levelPx, studentIndents])

  useEffect(() => {
    if (!drag) return

    const onMove = (e: PointerEvent) => {
      const state = dragRef.current
      if (!state || e.pointerId !== state.pointerId) return
      const active = state.active
        || Math.abs(e.clientX - state.startX) > DRAG_THRESHOLD
        || Math.abs(e.clientY - state.startY) > DRAG_THRESHOLD
      const next: DragState = { ...state, x: e.clientX, y: e.clientY, active }
      next.drop = active ? computeDrop(next, e.clientX, e.clientY) : null
      setDrag(next)
      if (active) e.preventDefault()
    }

    const onUp = (e: PointerEvent) => {
      const state = dragRef.current
      if (!state || e.pointerId !== state.pointerId) return
      if (state.active && state.drop) {
        const block = blockOf(arrangement, state.blockId)
        change(state.blockId, moveWithin(block, state.id, state.drop.index, studentIndents ? state.drop.level : null))
      }
      setDrag(null)
    }

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrag(null) }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, arrangement, computeDrop, onChange, studentIndents])

  const startDrag = (e: React.PointerEvent<HTMLDivElement>, row: FragmentRow) => {
    if (disabled || e.button !== 0) return
    if ((e.target as HTMLElement).closest('button')) return
    const rect = e.currentTarget.getBoundingClientRect()
    setDrag({
      id: row.key,
      blockId: row.blockId,
      pointerId: e.pointerId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      startX: e.clientX,
      startY: e.clientY,
      startLevel: row.level,
      x: e.clientX,
      y: e.clientY,
      active: false,
      drop: null,
    })
  }

  // ── Keyboard ───────────────────────────────────────────────────────────
  const fragmentRows = rows.filter((r): r is FragmentRow => r.kind === 'fragment')

  const onRowKeyDown = (e: React.KeyboardEvent, row: FragmentRow) => {
    if (disabled) return
    const block = blockOf(arrangement, row.blockId)
    const at = fragmentRows.findIndex(r => r.key === row.key)
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
      const to = row.index + (e.key === 'ArrowUp' ? -1 : 1)
      if (to < 0 || to >= block.order.length) { e.preventDefault(); return }
      change(row.blockId, moveWithin(block, row.key, to, null))
      focusRow(row.key)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const next = fragmentRows[at + (e.key === 'ArrowUp' ? -1 : 1)]
      if (next) focusRow(next.key)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      toggleRemoved(row)
      focusRow(row.key)
    } else if (studentIndents && !row.removed && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      setLevel(row, row.level + (e.key === 'ArrowRight' ? 1 : -1))
      focusRow(row.key)
    } else {
      return
    }
    e.preventDefault()
  }

  // ── Rendering ──────────────────────────────────────────────────────────
  const codeStyle = { fontSize: `${fontSize}px`, lineHeight: 1.6 }

  const renderText = (text: string, key: number) => {
    const [lead, code] = splitLead(text)
    const spans = colorized[code]
    return (
      <div key={key} className="min-h-[1.6em]">
        {lead}
        {spans
          ? spans.map((s, i) => <span key={i} className={s.kind ? `parsons-tok-${s.kind}` : undefined}>{s.text}</span>)
          : code}
      </div>
    )
  }

  const flagClass = (id: string) => {
    switch (feedback?.flags[id]) {
      case 'incorrectPosition': return 'bg-red-500/15 ring-1 ring-inset ring-red-500/60'
      case 'incorrectIndent': return 'bg-amber-500/15 ring-1 ring-inset ring-amber-500/60'
      case 'correct': return 'bg-emerald-500/10'
      default: return ''
    }
  }

  const lineNumberCell = (n: number | null) => (
    <div className="w-10 flex-shrink-0 select-none pr-3 text-right text-slate-600">{n ?? ''}</div>
  )

  const renderFixed = (row: Extract<ParsonsRow, { kind: 'fixed' }>) => (
    <div key={row.key} className={`flex ${activeKey === row.key ? 'parsons-active-line' : ''}`}>
      {lineNumberCell(row.lineNumber)}
      <div className="w-5 flex-shrink-0" />
      <div className="min-w-0 flex-1 whitespace-pre text-slate-300">{renderText(row.text, 0)}</div>
    </div>
  )

  const renderFragment = (row: FragmentRow) => {
    if (drag?.active && drag.id === row.key) return null
    const block = blockOf(arrangement, row.blockId)
    const max = maxIndentAt(block, row.key)
    return (
      <div
        key={row.key}
        data-frag-id={row.key}
        tabIndex={disabled ? -1 : 0}
        role="listitem"
        aria-label={`Line ${row.lineNumber ?? '(struck out)'}: ${row.line.code}${row.removed ? ', struck out' : ''}`}
        onPointerDown={e => startDrag(e, row)}
        onKeyDown={e => onRowKeyDown(e, row)}
        style={{ touchAction: 'none' }}
        className={`parsons-row group flex items-start rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
          disabled ? 'cursor-default' : 'cursor-grab hover:bg-slate-500/10'
        } ${activeKey === row.key ? 'parsons-active-line' : flagClass(row.key)}`}
      >
        {lineNumberCell(row.lineNumber)}
        <div className="w-5 flex-shrink-0 select-none text-center text-slate-500 group-hover:text-sky-300" aria-hidden="true">⠿</div>
        <div className={`min-w-0 flex-1 overflow-x-auto whitespace-pre ${row.removed ? 'text-slate-500 line-through decoration-slate-500 opacity-50' : 'text-slate-200'}`}>
          {row.text.map(renderText)}
        </div>
        <div className={`flex flex-shrink-0 items-center gap-0.5 pl-2 pr-1 text-[11px] ${
          row.removed ? '' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        }`}>
          {studentIndents && !row.removed && (
            <>
              <button type="button" disabled={disabled || row.level <= 0} onClick={() => setLevel(row, row.level - 1)}
                title="Indent less (←)" aria-label="Indent less"
                className="rounded px-1 text-slate-400 hover:bg-slate-500/20 hover:text-slate-100 disabled:opacity-30">‹</button>
              <button type="button" disabled={disabled || row.level >= max} onClick={() => setLevel(row, row.level + 1)}
                title="Indent more (→)" aria-label="Indent more"
                className="rounded px-1 text-slate-400 hover:bg-slate-500/20 hover:text-slate-100 disabled:opacity-30">›</button>
            </>
          )}
          <button type="button" disabled={disabled} onClick={() => toggleRemoved(row)}
            title={row.removed ? 'Put this line back (Delete)' : 'Strike out this line — it does not belong (Delete)'}
            aria-label={row.removed ? 'Put line back' : 'Strike out line'}
            className={`rounded px-1 hover:bg-slate-500/20 disabled:opacity-30 ${row.removed ? 'text-sky-300 hover:text-sky-200' : 'text-slate-400 hover:text-red-300'}`}>
            {row.removed ? '↺' : '✕'}
          </button>
        </div>
      </div>
    )
  }

  const dropLine = (blockId: string, index: number) => {
    if (!drag?.active || drag.blockId !== blockId || !drag.drop || drag.drop.index !== index) return null
    return (
      <div key={`drop-${index}`} className="flex">
        <div className="w-[3.75rem] flex-shrink-0" />
        <div className="h-0.5 flex-1 rounded bg-sky-400"
          style={{ marginLeft: studentIndents ? drag.drop.level * levelPx : 0 }} />
      </div>
    )
  }

  // Rows in order, each run of one block's fragments wrapped in its band.
  const content: React.ReactNode[] = []
  for (let i = 0; i < rows.length;) {
    const row = rows[i]
    if (row.kind === 'fixed') { content.push(renderFixed(row)); i++; continue }
    const blockId = row.blockId
    const members: FragmentRow[] = []
    while (i < rows.length && rows[i].kind === 'fragment' && (rows[i] as FragmentRow).blockId === blockId) {
      members.push(rows[i] as FragmentRow)
      i++
    }
    const visible = members.filter(m => !(drag?.active && drag.id === m.key))
    content.push(
      <div key={`band-${blockId}`} data-block-id={blockId} role="list"
        aria-label={problem.blocks.length > 1 ? `Block ${problem.blocks.findIndex(b => b.id === blockId) + 1}` : 'Lines to arrange'}
        className={`my-0.5 rounded-sm border-l-2 ${feedback?.success ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-sky-500/50 bg-sky-500/[0.07]'}`}>
        {visible.map((m, vi) => (
          <div key={m.key} className="contents">
            {dropLine(blockId, vi)}
            {renderFragment(m)}
          </div>
        ))}
        {dropLine(blockId, visible.length)}
      </div>,
    )
  }

  const dragRow = drag?.active ? fragmentRows.find(r => r.key === drag.id) : undefined

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-900">
      <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-700 bg-slate-900 px-3 py-1.5">
        <div className="text-[11px] text-slate-500">
          Drag <span className="text-slate-300">⠿</span> lines into order
          {hasDistractors ? ' · ✕ strikes out a line that does not belong' : ' · ✕ strikes out a line'}
          {studentIndents ? ' · ‹ › or drag sideways to indent' : ''}
        </div>
        <button
          type="button"
          onClick={onShuffle}
          disabled={disabled}
          title="Shuffle the lines and start again"
          className="flex flex-shrink-0 items-center gap-1.5 rounded border border-slate-600 px-2 py-0.5 text-[11px] text-slate-300 transition-colors hover:border-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h5M20 20v-5h-5M20 9a8 8 0 00-14.9-3M4 15a8 8 0 0014.9 3" />
          </svg>
          Shuffle
        </button>
      </div>

      <div ref={scrollRef} className="parsons-view flex-1 overflow-auto py-3 pr-2 font-mono" style={codeStyle}>
        <span ref={measureRef} aria-hidden="true" className="invisible absolute whitespace-pre">{'MMMMMMMMMM'}</span>
        {content}

        {feedback && feedback.messages.length > 0 && (
          <ul className="mx-3 mt-4 space-y-1 rounded border border-red-500/40 bg-red-500/10 p-2 font-sans text-xs text-red-300">
            {feedback.messages.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        )}
        {feedback?.success && (
          <div className="mx-3 mt-4 rounded border border-emerald-500/40 bg-emerald-500/10 p-2 font-sans text-xs text-emerald-300">
            Correct — well done.
          </div>
        )}
      </div>

      {/* Drag ghost */}
      {dragRow && drag && (
        <div
          className="pointer-events-none fixed z-50 flex rounded border border-sky-400 bg-slate-800 font-mono text-slate-100 opacity-90 shadow-2xl"
          style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY, width: drag.width, ...codeStyle }}
        >
          <div className="w-10 flex-shrink-0" />
          <div className="w-5 flex-shrink-0 text-center text-sky-300">⠿</div>
          <div className="min-w-0 flex-1 whitespace-pre"
            style={{ marginLeft: studentIndents && drag.drop ? (drag.drop.level - dragRow.level) * levelPx : 0 }}>
            {dragRow.text.map(renderText)}
          </div>
        </div>
      )}
    </div>
  )
}

export default ParsonsView
