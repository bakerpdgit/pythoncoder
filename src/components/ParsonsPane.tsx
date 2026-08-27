import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMonaco } from '@monaco-editor/react'
import type {
  ParsonsArrangement,
  ParsonsFeedback,
  ParsonsLine,
  ParsonsProblem,
} from '../utils/parsons'

type Zone = 'source' | 'solution'

interface Props {
  problem: ParsonsProblem
  arrangement: ParsonsArrangement
  onChange: (next: ParsonsArrangement) => void
  feedback: ParsonsFeedback | null
  onShuffle: () => void
  /** Colorize fragments as Python (off for books whose fragments aren't code). */
  highlightPython: boolean
  fontSize: number
  theme: 'light' | 'dark'
  disabled?: boolean
}

/** Horizontal pixels per indent level while dragging. */
const INDENT_PX = 32
/** Pointer travel before a press becomes a drag, so clicks and focus still work. */
const DRAG_THRESHOLD = 4

interface DragState {
  id: string
  from: Zone
  pointerId: number
  offsetX: number
  offsetY: number
  width: number
  startX: number
  startY: number
  x: number
  y: number
  active: boolean
  drop: { zone: Zone; index: number; indent: number } | null
}

/** Remove a fragment from wherever it is, then insert it at a new place. */
function moveFragment(
  arrangement: ParsonsArrangement,
  id: string,
  zone: Zone,
  index: number,
  indent: number,
): ParsonsArrangement {
  const source = arrangement.source.filter(s => s !== id)
  const solution = arrangement.solution.filter(s => s.id !== id)
  if (zone === 'source') {
    // Back in the source list a fragment always loses its indentation.
    source.splice(Math.max(0, Math.min(index, source.length)), 0, id)
  } else {
    solution.splice(Math.max(0, Math.min(index, solution.length)), 0, { id, indent })
  }
  return { source, solution }
}

function zoneOf(arrangement: ParsonsArrangement, id: string): Zone {
  return arrangement.solution.some(s => s.id === id) ? 'solution' : 'source'
}

function indexOf(arrangement: ParsonsArrangement, id: string): number {
  const inSolution = arrangement.solution.findIndex(s => s.id === id)
  return inSolution === -1 ? arrangement.source.indexOf(id) : inSolution
}

export function ParsonsPane({
  problem, arrangement, onChange, feedback, onShuffle,
  highlightPython, fontSize, theme, disabled = false,
}: Props) {
  const monaco = useMonaco()
  const [colorized, setColorized] = useState<Record<string, string>>({})
  const [drag, setDrag] = useState<DragState | null>(null)

  const sourceRef = useRef<HTMLDivElement | null>(null)
  const solutionRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag

  const byId = useMemo(() => new Map(problem.pool.map(l => [l.id, l])), [problem])

  // ── Syntax highlighting ────────────────────────────────────────────────
  // Monaco is already loaded for the code editor, so its colorizer gives the
  // fragments exactly the editor's palette in both themes — no second theme to
  // keep in step. Non-Python books (maths proofs and the like) stay plain.
  useEffect(() => {
    if (!monaco || !highlightPython) { setColorized({}); return }
    let cancelled = false
    void (async () => {
      const out: Record<string, string> = {}
      for (const line of problem.pool) {
        try {
          // colorize() terminates its output with a <br>, which would leave every
          // fragment a blank line taller than its code.
          const html = await monaco.editor.colorize(line.code, 'python', { tabSize: 4 })
          out[line.id] = html.replace(/<br\s*\/?>\s*$/i, '')
        } catch { /* fall back to plain text for this fragment */ }
      }
      if (!cancelled) setColorized(out)
    })()
    return () => { cancelled = true }
  }, [monaco, problem, highlightPython, theme])

  // ── Drag ───────────────────────────────────────────────────────────────
  const computeDrop = useCallback((state: DragState, clientX: number, clientY: number) => {
    const inRect = (el: HTMLElement | null) => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
    }
    const zone: Zone = inRect(solutionRef.current) ? 'solution'
      : inRect(sourceRef.current) ? 'source'
      : state.drop?.zone ?? state.from

    const container = zone === 'solution' ? solutionRef.current : sourceRef.current
    if (!container) return null

    const items = Array.from(container.querySelectorAll<HTMLElement>('[data-frag-id]'))
      .filter(el => el.dataset.fragId !== state.id)
    let index = items.length
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect()
      if (clientY < r.top + r.height / 2) { index = i; break }
    }

    let indent = 0
    if (zone === 'solution' && problem.canIndent) {
      const left = container.getBoundingClientRect().left
      const ghostLeft = clientX - state.offsetX
      const prev = index > 0
        ? arrangement.solution.filter(s => s.id !== state.id)[index - 1]
        : undefined
      const max = prev ? prev.indent + 1 : 0
      indent = Math.max(0, Math.min(Math.round((ghostLeft - left) / INDENT_PX), max))
    }
    return { zone, index, indent }
  }, [arrangement, problem.canIndent])

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
        onChange(moveFragment(arrangement, state.id, state.drop.zone, state.drop.index, state.drop.indent))
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
  }, [drag, arrangement, computeDrop, onChange])

  const startDrag = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (disabled || e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    setDrag({
      id,
      from: zoneOf(arrangement, id),
      pointerId: e.pointerId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      active: false,
      drop: null,
    })
  }

  // ── Keyboard equivalents ───────────────────────────────────────────────
  const onFragmentKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (disabled) return
    const zone = zoneOf(arrangement, id)
    const index = indexOf(arrangement, id)
    const indent = arrangement.solution.find(s => s.id === id)?.indent ?? 0
    const length = zone === 'solution' ? arrangement.solution.length : arrangement.source.length

    if (e.key === 'ArrowUp' && index > 0) {
      onChange(moveFragment(arrangement, id, zone, index - 1, indent))
    } else if (e.key === 'ArrowDown' && index < length - 1) {
      onChange(moveFragment(arrangement, id, zone, index + 1, indent))
    } else if (e.key === 'Enter' || e.key === ' ') {
      const to: Zone = zone === 'solution' ? 'source' : 'solution'
      onChange(moveFragment(arrangement, id, to, to === 'solution' ? arrangement.solution.length : arrangement.source.length, 0))
    } else if (zone === 'solution' && problem.canIndent && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const prev = index > 0 ? arrangement.solution[index - 1].indent : -1
      const max = index > 0 ? prev + 1 : 0
      const next = e.key === 'ArrowRight' ? Math.min(indent + 1, max) : Math.max(indent - 1, 0)
      onChange(moveFragment(arrangement, id, 'solution', index, next))
    } else {
      return
    }
    e.preventDefault()
    // Keep focus on the fragment as it moves.
    const target = e.currentTarget as HTMLElement
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-frag-id="${CSS.escape(id)}"]`)
      ;(el ?? target).focus()
    })
  }

  // ── Rendering ──────────────────────────────────────────────────────────
  const flagClass = (id: string) => {
    switch (feedback?.flags[id]) {
      case 'incorrectPosition': return 'ring-1 ring-red-500/70 bg-red-500/10'
      case 'incorrectIndent': return 'ring-1 ring-amber-500/70 bg-amber-500/10 border-l-4 border-l-amber-500'
      case 'correct': return 'ring-1 ring-emerald-500/50 bg-emerald-500/10'
      default: return 'border-slate-600 bg-slate-800 hover:border-slate-400'
    }
  }

  const renderFragment = (line: ParsonsLine, indent: number, zone: Zone) => {
    const isDragging = drag?.active && drag.id === line.id
    if (isDragging) return null
    return (
      <div
        key={line.id}
        data-frag-id={line.id}
        tabIndex={disabled ? -1 : 0}
        role="button"
        aria-label={`Code fragment: ${line.code}`}
        onPointerDown={e => startDrag(e, line.id)}
        onKeyDown={e => onFragmentKeyDown(e, line.id)}
        style={{
          marginLeft: zone === 'solution' ? indent * INDENT_PX : 0,
          fontSize: `${fontSize}px`,
          lineHeight: 1.5,
          touchAction: 'none',
        }}
        className={`parsons-fragment select-none cursor-grab rounded border px-3 py-1.5 font-mono whitespace-pre overflow-x-auto text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${flagClass(line.id)} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        {colorized[line.id]
          ? <span dangerouslySetInnerHTML={{ __html: colorized[line.id] }} />
          : line.code}
      </div>
    )
  }

  const dropLine = (zone: Zone, index: number) => {
    if (!drag?.active || !drag.drop || drag.drop.zone !== zone || drag.drop.index !== index) return null
    return (
      <div
        key={`drop-${zone}-${index}`}
        className="h-0.5 rounded bg-sky-400"
        style={{ marginLeft: zone === 'solution' ? drag.drop.indent * INDENT_PX : 0 }}
      />
    )
  }

  const sourceLines = arrangement.source.map(id => byId.get(id)).filter((l): l is ParsonsLine => !!l)
  const solutionEntries = arrangement.solution
    .map(s => ({ line: byId.get(s.id), indent: s.indent }))
    .filter((s): s is { line: ParsonsLine; indent: number } => !!s.line)

  const dragLine = drag?.active ? byId.get(drag.id) : undefined

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-950">
      {/* Toolbar */}
      <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-700 bg-slate-900 px-3 py-1.5">
        <div className="text-[11px] text-slate-500">
          {solutionEntries.length}/{problem.pool.length} fragments placed
          {problem.canIndent
            ? ' · drag right to indent'
            : ''}
        </div>
        <button
          type="button"
          onClick={onShuffle}
          disabled={disabled}
          title="Shuffle the fragments and start again"
          className="flex items-center gap-1.5 rounded border border-slate-600 px-2 py-0.5 text-[11px] text-slate-300 transition-colors hover:border-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h5M20 20v-5h-5M20 9a8 8 0 00-14.9-3M4 15a8 8 0 0014.9 3" />
          </svg>
          Shuffle
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* Source ("trash") */}
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Drag from here</div>
        <div
          ref={sourceRef}
          className="mb-4 flex min-h-[56px] flex-col gap-1.5 rounded-lg border-2 border-dashed border-slate-700 p-2"
        >
          {sourceLines.length === 0 && !drag?.active && (
            <div className="py-2 text-center text-xs text-slate-600">All fragments used</div>
          )}
          {sourceLines.map((line, i) => (
            <div key={line.id} className="contents">
              {dropLine('source', i)}
              {renderFragment(line, 0, 'source')}
            </div>
          ))}
          {dropLine('source', sourceLines.length)}
        </div>

        {/* Solution */}
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Construct your solution here</div>
        <div
          ref={solutionRef}
          className={`flex min-h-[80px] flex-col gap-1.5 rounded-lg border-2 border-dashed p-2 ${
            feedback?.success ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-sky-700/70'
          }`}
        >
          {solutionEntries.length === 0 && !drag?.active && (
            <div className="py-4 text-center text-xs text-slate-600">Drag fragments here, in order</div>
          )}
          {solutionEntries.map((entry, i) => (
            <div key={entry.line.id} className="contents">
              {dropLine('solution', i)}
              {renderFragment(entry.line, entry.indent, 'solution')}
            </div>
          ))}
          {dropLine('solution', solutionEntries.length)}
        </div>

        {/* Feedback messages */}
        {feedback && feedback.messages.length > 0 && (
          <ul className="mt-3 space-y-1 rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
            {feedback.messages.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        )}
        {feedback?.success && (
          <div className="mt-3 rounded border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-300">
            Correct — well done.
          </div>
        )}

        {/* Fixed header/footer code, when the problem fences a body with # start */}
        {problem.header !== null && (
          <div className="mt-4">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Fixed code (not editable)
            </div>
            <pre
              className="overflow-x-auto rounded border border-slate-700 bg-slate-900 p-2 font-mono text-slate-400"
              style={{ fontSize: `${Math.max(fontSize - 1, 8)}px`, lineHeight: 1.5 }}
            >
              {[problem.header, '    ⋯ your fragments go here ⋯', problem.footer]
                .filter(part => part !== null && part !== '')
                .join('\n')}
            </pre>
          </div>
        )}
      </div>

      {/* Drag ghost */}
      {drag?.active && dragLine && (
        <div
          className="pointer-events-none fixed z-50 rounded border border-sky-400 bg-slate-800 px-3 py-1.5 font-mono whitespace-pre text-slate-100 shadow-2xl opacity-90"
          style={{
            left: drag.x - drag.offsetX,
            top: drag.y - drag.offsetY,
            width: drag.width,
            fontSize: `${fontSize}px`,
            lineHeight: 1.5,
          }}
        >
          {colorized[dragLine.id]
            ? <span dangerouslySetInnerHTML={{ __html: colorized[dragLine.id] }} />
            : dragLine.code}
        </div>
      )}
    </div>
  )
}

export default ParsonsPane
