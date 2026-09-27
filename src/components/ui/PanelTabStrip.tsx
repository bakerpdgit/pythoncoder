import type { KeyboardEvent } from 'react'
import { CENTER_PANEL_LABELS, type CenterPanel } from '../../utils/tabGroup'

interface Props {
  tabs: readonly CenterPanel[]
  active: CenterPanel
  onSelect: (panel: CenterPanel) => void
}

/**
 * The tabs of the central column's tab group. Each grouped panel draws this
 * same strip in its own header, and only the chosen panel is on screen, so the
 * group reads as one tabbed panel while every member keeps its own tools.
 */
export function PanelTabStrip({ tabs, active, onSelect }: Props) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const index = tabs.indexOf(active)
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
    onSelect(next)
    // The strip that has focus is about to be hidden with its panel; hand focus
    // to the same tab in the panel that replaces it.
    requestAnimationFrame(() => {
      const candidates = document.querySelectorAll<HTMLButtonElement>(`[data-panel-tab="${next}"]`)
      Array.from(candidates).find(button => button.offsetParent !== null)?.focus()
    })
  }
  return (
    <div className="flex flex-shrink-0 rounded overflow-hidden border border-slate-600 text-[11px]" role="tablist"
      aria-label="Tabbed panels" onKeyDown={onKeyDown}>
      {tabs.map(tab => (
        <button key={tab} type="button" role="tab" data-panel-tab={tab}
          aria-selected={tab === active} tabIndex={tab === active ? 0 : -1}
          onClick={() => onSelect(tab)}
          // Translucent tints, so the chosen tab reads in both themes.
          className={`px-2.5 py-1 font-bold uppercase tracking-wider transition-colors ${tab === active ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:bg-slate-500/20 hover:text-slate-200'}`}>
          {CENTER_PANEL_LABELS[tab]}
        </button>
      ))}
    </div>
  )
}
