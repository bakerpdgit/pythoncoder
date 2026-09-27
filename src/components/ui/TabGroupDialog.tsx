import { useEffect } from 'react'
import type { ViewMode } from '../../types'
import {
  CENTER_PANELS, CENTER_PANEL_LABELS, tabGroupMembers, type CenterPanel, type TabGroupPrefs,
} from '../../utils/tabGroup'

interface Props {
  isOpen: boolean
  onClose: () => void
  tabGroup: TabGroupPrefs
  onChange: (next: TabGroupPrefs) => void
  viewMode: ViewMode
}

const DESCRIPTIONS: Record<CenterPanel, string> = {
  editor: 'The code editor',
  console: 'Program output and input',
  display: 'Turtle, pygame, tkinter, canvas and charts',
}

/**
 * Reached from the Panels menu. Ticks put panels of the central column into one
 * tabbed panel; the change applies as it is made, and the sketch shows what the
 * column will look like.
 */
export const TabGroupDialog = ({ isOpen, onClose, tabGroup, onChange, viewMode }: Props) => {
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const members = tabGroupMembers(tabGroup)
  const isGroup = members.length >= 2
  const lead = CENTER_PANELS.filter(panel => !tabGroup[panel])
  const horizontal = viewMode === 'developer'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tab-group-title"
        className="w-full max-w-md rounded-xl border border-slate-600 bg-slate-800 shadow-2xl overflow-y-auto max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <h2 id="tab-group-title" className="text-sm font-bold uppercase tracking-wider text-slate-200">Tab Group</h2>
          <button type="button" onClick={onClose}
            className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-400 hover:border-slate-400 hover:text-slate-200">
            Done
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            Tick the panels that should share one tabbed panel. The tab group always comes last
            in the middle column, after any panel you leave unticked.
          </p>

          <div className="flex flex-col gap-1">
            {CENTER_PANELS.map(panel => (
              <label key={panel} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-slate-900/70">
                <input type="checkbox" checked={tabGroup[panel]}
                  onChange={() => onChange({ ...tabGroup, [panel]: !tabGroup[panel] })}
                  className="h-4 w-4 rounded border-slate-500 bg-slate-900" style={{ accentColor: '#34d399' }} />
                <span className="text-sm font-medium text-slate-200">{CENTER_PANEL_LABELS[panel]}</span>
                <span className="text-[11px] text-slate-500">{DESCRIPTIONS[panel]}</span>
              </label>
            ))}
          </div>

          {/* A sketch of the column, in this view's direction. */}
          <div aria-hidden="true" className={`flex gap-1.5 h-28 rounded-lg border border-slate-700 bg-slate-900/50 p-2 ${horizontal ? 'flex-row' : 'flex-col'}`}>
            {(isGroup ? lead : CENTER_PANELS).map(panel => (
              <div key={panel} className="flex flex-1 items-center justify-center rounded border border-slate-600 bg-slate-800 text-[11px] text-slate-400">
                {CENTER_PANEL_LABELS[panel]}
              </div>
            ))}
            {isGroup && (
              <div className="flex flex-1 flex-col overflow-hidden rounded border border-emerald-600/60 bg-slate-800">
                <div className="flex gap-0.5 border-b border-slate-700 p-1">
                  {members.map((panel, i) => (
                    <span key={panel} className={`rounded px-1.5 text-[10px] font-bold uppercase tracking-wider ${i === 0 ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400'}`}>
                      {CENTER_PANEL_LABELS[panel]}
                    </span>
                  ))}
                </div>
                <div className="flex-1" />
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            {members.length === 1
              ? 'Tick at least two panels to make a tab group.'
              : 'A tab only appears while its panel has something to show — the Display tab arrives with the first drawing. Choosing Minimal or Developer view ungroups everything. Save layout keeps the group.'}
          </p>
        </div>
      </div>
    </div>
  )
}
