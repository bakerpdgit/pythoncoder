import { useEffect, useRef, useState } from 'react'

export type SaveMode = 'save' | 'saveAs'

const SAVE_PATH = 'M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8'
// The same disk with its corner given to a pencil: a save that asks where.
const SAVE_AS_PATHS = [
  'M11 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v3',
  'M7 3v5h8M7 21v-8h6',
  'M19.5 13.5l2 2-6.5 6.5H13v-2l6.5-6.5z',
]

export function SaveModeIcon({ mode, className = 'h-4 w-4' }: { mode: SaveMode; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      {(mode === 'save' ? [SAVE_PATH] : SAVE_AS_PATHS).map(d => (
        <path key={d} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={d} />
      ))}
    </svg>
  )
}

const LABELS: Record<SaveMode, string> = { save: 'Save', saveAs: 'Save as…' }

interface Props {
  mode: SaveMode
  onModeChange: (mode: SaveMode) => void
  onSave: () => void
  onSaveAs: () => void
  disabled?: boolean
  /** Save only: the menu is not offered (book edit mode). */
  saveOnly?: boolean
}

/**
 * The editor's save button. The main half does whichever of Save / Save as…
 * was chosen last; choosing from the menu both switches it and does it.
 */
export function SaveSplitButton({ mode, onModeChange, onSave, onSaveAs, disabled = false, saveOnly = false }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const effective: SaveMode = saveOnly ? 'save' : mode

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  useEffect(() => { if (disabled) setOpen(false) }, [disabled])

  const run = (which: SaveMode) => { if (which === 'save') onSave(); else onSaveAs() }
  const mainTitle = effective === 'save' ? 'Save to virtual filesystem' : 'Save as… (choose a new name or folder)'

  return (
    <div ref={ref} className="relative inline-flex">
      <button type="button" title={mainTitle} aria-label={mainTitle} onClick={() => run(effective)} disabled={disabled}
        className={`icon-button${saveOnly ? '' : ' split-main'}`}>
        <SaveModeIcon mode={effective} />
      </button>
      {!saveOnly && (
        <button type="button" title="Save or Save as…" aria-label="Choose Save or Save as" aria-haspopup="menu" aria-expanded={open}
          onClick={() => setOpen(o => !o)} disabled={disabled} className="icon-button split-caret">
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-50 w-40 rounded-lg border border-slate-600 bg-slate-800 shadow-xl py-1">
          {(['save', 'saveAs'] as const).map(which => (
            <button key={which} type="button" role="menuitemradio" aria-checked={effective === which}
              onClick={() => { setOpen(false); onModeChange(which); run(which) }}
              className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-2">
              <SaveModeIcon mode={which} className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{LABELS[which]}</span>
              {effective === which && <span className="text-[10px] text-emerald-400">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
