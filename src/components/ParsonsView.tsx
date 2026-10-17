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
 * movable ones with their controls in a column on the left — the drag handle,
 * an eye that hides a line the student thinks does not belong, and (when the
 * student sets indentation) indent less / more — then a separator, then the
 * code. Hidden lines wait, struck out, after a gap below the program and can
 * be neither dragged nor indented until shown again. See utils/parsons.ts for
 * the model.
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
  /** `index` among the block's shown lines. */
  drop: { index: number; level: number } | null
}

function blockOf(arrangement: ParsonsArrangement, blockId: string): ParsonsBlockArrangement {
  return arrangement.blocks[blockId] ?? { order: [], removed: [], indents: {} }
}

function withBlock(arrangement: ParsonsArrangement, blockId: string, next: ParsonsBlockArrangement): ParsonsArrangement {
  return { v: 2, blocks: { ...arrangement.blocks, [blockId]: next } }
}

const shownOf = (block: ParsonsBlockArrangement) => block.order.filter(id => !block.removed.includes(id))
const hiddenOf = (block: ParsonsBlockArrangement) => block.order.filter(id => block.removed.includes(id))

/**
 * Move a shown line to `index` among its block's shown lines, optionally to a
 * new level. The order is kept as shown lines then hidden ones, which is how
 * the view lays them out.
 */
function moveShown(block: ParsonsBlockArrangement, id: string, index: number, level: number | null): ParsonsBlockArrangement {
  const shown = shownOf(block).filter(o => o !== id)
  shown.splice(Math.max(0, Math.min(index, shown.length)), 0, id)
  const indents = { ...block.indents }
  if (level !== null) {
    if (level > 0) indents[id] = level
    else delete indents[id]
  }
  return { ...block, order: [...shown, ...hiddenOf(block)], indents }
}

/** Hide a line (it goes after the block's other hidden ones), or show it again
 *  (it comes back at the end of its block's shown lines). */
function setHidden(block: ParsonsBlockArrangement, id: string, hidden: boolean): ParsonsBlockArrangement {
  const shown = shownOf(block).filter(o => o !== id)
  const others = hiddenOf(block).filter(o => o !== id)
  return hidden
    ? { ...block, order: [...shown, ...others, id], removed: [...others, id] }
    : { ...block, order: [...shown, id, ...others], removed: others }
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

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      {hidden
        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        : <>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </>}
    </svg>
  )
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

  const fragmentRows = rows.filter((r): r is FragmentRow => r.kind === 'fragment')
  const hiddenRows = fragmentRows.filter(r => r.removed)
  /** Shown lines in program order, then the hidden ones: the order they are on screen. */
  const screenOrder = [...fragmentRows.filter(r => !r.removed), ...hiddenRows]
  /** Each shown line's place among its block's shown lines. */
  const shownIndex = useMemo(() => {
    const out: Record<string, number> = {}
    for (const block of problem.blocks) shownOf(blockOf(arrangement, block.id)).forEach((id, i) => { out[id] = i })
    return out
  }, [problem, arrangement])

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

  const toggleHidden = (row: FragmentRow) =>
    change(row.blockId, setHidden(blockOf(arrangement, row.blockId), row.key, !row.removed))

  const setLevel = (row: FragmentRow, level: number) => {
    const block = blockOf(arrangement, row.blockId)
    const max = maxIndentAt(block, row.key)
    change(row.blockId, moveShown(block, row.key, shownIndex[row.key] ?? 0, Math.max(0, Math.min(level, max))))
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
      const moved = moveShown(block, state.id, index, null)
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
        change(state.blockId, moveShown(block, state.id, state.drop.index, studentIndents ? state.drop.level : null))
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
    // A hidden line has to be shown again before it can be moved.
    if (disabled || row.removed || e.button !== 0) return
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
  const onRowKeyDown = (e: React.KeyboardEvent, row: FragmentRow) => {
    if (disabled) return
    const block = blockOf(arrangement, row.blockId)
    const at = screenOrder.findIndex(r => r.key === row.key)
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
      if (!row.removed) {
        const to = (shownIndex[row.key] ?? 0) + (e.key === 'ArrowUp' ? -1 : 1)
        if (to >= 0 && to < shownOf(block).length) {
          change(row.blockId, moveShown(block, row.key, to, null))
          focusRow(row.key)
        }
      }
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const next = screenOrder[at + (e.key === 'ArrowUp' ? -1 : 1)]
      if (next) focusRow(next.key)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      toggleHidden(row)
      focusRow(row.key)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (!studentIndents || row.removed) return
      setLevel(row, row.level + (e.key === 'ArrowRight' ? 1 : -1))
      focusRow(row.key)
    } else {
      return
    }
    e.preventDefault()
  }

  // ── Rendering ──────────────────────────────────────────────────────────
  const codeStyle = { fontSize: `${fontSize}px`, lineHeight: 1.6 }
  // The controls column is the same width on every row, so the code lines up.
  const controlsWidth = studentIndents ? 'w-[5.25rem]' : 'w-[2.75rem]'

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
    <div className="w-10 flex-shrink-0 select-none pr-2 text-right text-slate-600">{n ?? ''}</div>
  )

  /** The code, after the separator that divides it from the controls. */
  const codeCell = (content: React.ReactNode, className: string) => (
    <div className={`min-w-0 flex-1 overflow-x-auto whitespace-pre border-l border-slate-600/40 pl-3 ${className}`}>{content}</div>
  )

  const renderFixed = (row: Extract<ParsonsRow, { kind: 'fixed' }>) => (
    <div key={row.key} className={`flex ${activeKey === row.key ? 'parsons-active-line' : ''}`}>
      {lineNumberCell(row.lineNumber)}
      <div className={`${controlsWidth} flex-shrink-0`} />
      {codeCell(renderText(row.text, 0), 'text-slate-300')}
    </div>
  )

  const controlButton = 'flex h-[1.6em] w-5 flex-shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-500/20 hover:text-slate-100 disabled:opacity-30 disabled:hover:bg-transparent'

  const renderFragment = (row: FragmentRow) => {
    if (drag?.active && drag.id === row.key) return null
    const hidden = row.removed
    const max = maxIndentAt(blockOf(arrangement, row.blockId), row.key)
    return (
      <div
        key={row.key}
        data-frag-id={row.key}
        tabIndex={disabled ? -1 : 0}
        role="listitem"
        aria-label={hidden ? `Hidden: ${row.line.code}` : `Line ${row.lineNumber}: ${row.line.code}`}
        onPointerDown={e => startDrag(e, row)}
        onKeyDown={e => onRowKeyDown(e, row)}
        style={{ touchAction: hidden ? undefined : 'none' }}
        className={`parsons-row group flex items-start rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
          disabled || hidden ? 'cursor-default' : 'cursor-grab hover:bg-slate-500/10'
        } ${activeKey === row.key ? 'parsons-active-line' : hidden ? '' : flagClass(row.key)}`}
      >
        {lineNumberCell(row.lineNumber)}
        <div className={`${controlsWidth} flex flex-shrink-0 items-start text-[11px]`}>
          <div className={`flex h-[1.6em] w-5 flex-shrink-0 select-none items-center justify-center ${hidden ? 'text-transparent' : 'text-slate-500 group-hover:text-sky-300'}`}
            aria-hidden="true" title={hidden ? undefined : 'Drag to move this line'}>⠿</div>
          <button type="button" disabled={disabled} onClick={() => toggleHidden(row)}
            title={hidden ? 'Show this line again (Delete)' : 'Hide this line — it does not belong (Delete)'}
            aria-label={hidden ? 'Show line' : 'Hide line'}
            className={`${controlButton} w-6 ${hidden ? 'text-sky-300 hover:text-sky-200' : ''}`}>
            <EyeIcon hidden={hidden} />
          </button>
          {studentIndents && !hidden && (
            <>
              <button type="button" disabled={disabled || row.level <= 0} onClick={() => setLevel(row, row.level - 1)}
                title="Indent less (←)" aria-label="Indent less" className={controlButton}>‹</button>
              <button type="button" disabled={disabled || row.level >= max} onClick={() => setLevel(row, row.level + 1)}
                title="Indent more (→)" aria-label="Indent more" className={controlButton}>›</button>
            </>
          )}
        </div>
        {codeCell(row.text.map(renderText),
          hidden ? 'text-slate-500 line-through decoration-slate-500 opacity-60' : 'text-slate-200')}
      </div>
    )
  }

  const dropLine = (blockId: string, index: number) => {
    if (!drag?.active || drag.blockId !== blockId || !drag.drop || drag.drop.index !== index) return null
    return (
      <div key={`drop-${index}`} className="flex">
        <div className="w-10 flex-shrink-0" />
        <div className={`${controlsWidth} flex-shrink-0`} />
        <div className="h-0.5 flex-1 rounded bg-sky-400"
          style={{ marginLeft: studentIndents ? drag.drop.level * levelPx : 0 }} />
      </div>
    )
  }

  // Rows in order, each run of one block's shown lines wrapped in its band.
  const content: React.ReactNode[] = []
  for (let i = 0; i < rows.length;) {
    const row = rows[i]
    if (row.kind === 'fixed') { content.push(renderFixed(row)); i++; continue }
    const blockId = row.blockId
    const members: FragmentRow[] = []
    while (i < rows.length && rows[i].kind === 'fragment' && (rows[i] as FragmentRow).blockId === blockId) {
      if (!(rows[i] as FragmentRow).removed) members.push(rows[i] as FragmentRow)
      i++
    }
    const visible = members.filter(m => !(drag?.active && drag.id === m.key))
    content.push(
      <div key={`band-${blockId}`} data-block-id={blockId} role="list"
        aria-label={problem.blocks.length > 1 ? `Block ${problem.blocks.findIndex(b => b.id === blockId) + 1}` : 'Lines to arrange'}
        className={`my-0.5 min-h-[0.5em] rounded-sm border-l-2 ${feedback?.success ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-sky-500/50 bg-sky-500/[0.07]'}`}>
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
          Drag <span className="text-slate-300">⠿</span> to put lines in order
          {hasDistractors ? ' · the eye hides a line that does not belong' : ' · the eye hides a line'}
          {studentIndents ? ' · ‹ › (or drag sideways) to indent' : ''}
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

        {/* Hidden lines wait below the program, after a blank line, out of the way of reading it. */}
        {hiddenRows.length > 0 && (
          <div role="list" aria-label="Hidden lines" className="mt-[1.6em]">
            <div className="flex">
              <div className="w-10 flex-shrink-0" />
              <div className={`${controlsWidth} flex-shrink-0`} />
              <div className="flex-1 select-none border-t border-dashed border-slate-600/50 pl-3 pt-0.5 font-sans text-[10px] uppercase tracking-wide text-slate-600">
                Hidden — left out of the program
              </div>
            </div>
            {hiddenRows.map(renderFragment)}
          </div>
        )}

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
          <div className={`${controlsWidth} flex flex-shrink-0 text-[11px]`}>
            <div className="flex h-[1.6em] w-5 items-center justify-center text-sky-300">⠿</div>
          </div>
          <div className="min-w-0 flex-1 whitespace-pre border-l border-slate-600/40 pl-3"
            style={{ marginLeft: studentIndents && drag.drop ? (drag.drop.level - dragRow.level) * levelPx : 0 }}>
            {dragRow.text.map(renderText)}
          </div>
        </div>
      )}
    </div>
  )
}

export default ParsonsView
