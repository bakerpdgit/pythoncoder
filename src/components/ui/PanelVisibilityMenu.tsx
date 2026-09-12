import type { RefObject } from 'react'
import type { PanelVisibility, NamedLayout, ViewMode } from '../../types'

interface PanelOption {
  key: string
  label: string
}

interface Props {
  menuRef: RefObject<HTMLDivElement>
  isOpen: boolean
  onToggleOpen: () => void
  panelOptions: readonly PanelOption[]
  visiblePanels: PanelVisibility
  onTogglePanel: (key: string) => void
  buttonHoverClass?: string
  checkboxAccent?: string
  disabled?: boolean
  onRestoreDefaults?: () => void
  savedLayouts?: NamedLayout[]
  onSaveLayout?: () => void
  onRestoreLayout?: (layout: NamedLayout) => void
  onDeleteLayout?: (name: string) => void
  viewMode?: ViewMode
  onSelectViewMode?: (mode: ViewMode) => void
}

export const PanelVisibilityMenu = ({
  menuRef, isOpen, onToggleOpen, panelOptions, visiblePanels, onTogglePanel,
  buttonHoverClass = 'hover:border-emerald-400', checkboxAccent = '#34d399', disabled = false,
  onRestoreDefaults, savedLayouts = [], onSaveLayout, onRestoreLayout, onDeleteLayout,
  viewMode, onSelectViewMode,
}: Props) => {
  const visibleCount = panelOptions.filter(({ key }) => visiblePanels[key as keyof PanelVisibility]).length
  const hasLayoutActions = Boolean(onRestoreDefaults || onSaveLayout)

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={onToggleOpen}
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={isOpen ? 'true' : 'false'}
        className={`flex items-center gap-2 rounded border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors ${buttonHoverClass} disabled:cursor-not-allowed disabled:opacity-50`}
        title="Show or hide panels"
      >
        <svg className="h-4 w-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        Panels
      </button>

      {isOpen && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-lg border border-slate-600 bg-slate-800 p-2 shadow-2xl">
          {/* Layout actions */}
          {hasLayoutActions && (
            <div className="flex gap-1.5 px-2 py-1">
              {onRestoreDefaults && (
                <button
                  type="button"
                  onClick={onRestoreDefaults}
                  className="flex-1 rounded border border-slate-600 px-2 py-1.5 text-[11px] text-slate-300 hover:border-slate-400 hover:text-slate-100 transition-colors"
                >
                  Restore defaults
                </button>
              )}
              {onSaveLayout && (
                <button
                  type="button"
                  onClick={onSaveLayout}
                  className="flex-1 rounded border border-slate-600 px-2 py-1.5 text-[11px] text-slate-300 hover:border-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  Save layout…
                </button>
              )}
            </div>
          )}

          {/* Saved layouts list */}
          {savedLayouts.length > 0 && (
            <>
              <div className="px-2 pt-1 pb-1 text-[11px] uppercase tracking-wider text-slate-500">Saved Layouts</div>
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {savedLayouts.map(layout => (
                  <div key={layout.name} className="flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-slate-900/70">
                    <button
                      type="button"
                      onClick={() => onRestoreLayout?.(layout)}
                      className="flex-1 text-left text-sm text-slate-200 truncate hover:text-emerald-300 transition-colors"
                      title={`Restore layout "${layout.name}"`}
                    >
                      {layout.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteLayout?.(layout.name)}
                      className="flex-shrink-0 text-slate-500 hover:text-red-400 transition-colors px-1"
                      title="Delete layout"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {(hasLayoutActions || savedLayouts.length > 0) && <div className="my-1.5 border-t border-slate-700" />}

          {onSelectViewMode && viewMode && (
            <>
              <div className="px-2 pb-1 text-[11px] uppercase tracking-wider text-slate-500">View</div>
              <div className="space-y-0.5">
                {([
                  { key: 'minimal' as const, label: 'Minimal' },
                  { key: 'developer' as const, label: 'Developer' },
                ]).map(({ key, label }) => (
                  <button key={key} type="button" onClick={() => onSelectViewMode(key)}
                    className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-slate-900/70 ${viewMode === key ? 'bg-slate-900/40' : ''}`}>
                    <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-emerald-400 text-xs">
                      {viewMode === key ? '✓' : ''}
                    </span>
                    <span className="text-sm font-medium text-slate-200">{label}</span>
                  </button>
                ))}
              </div>
              <div className="my-1.5 border-t border-slate-700" />
            </>
          )}
          <div className="px-2 pb-1 text-[11px] uppercase tracking-wider text-slate-500">Panel Visibility</div>
          <div className="space-y-0.5">
            {panelOptions.map(({ key, label }) => {
              const isVisible = visiblePanels[key as keyof PanelVisibility]
              const isLastVisible = visibleCount === 1 && isVisible
              return (
                <label key={key} className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-slate-900/70 ${isLastVisible ? 'opacity-60' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={() => onTogglePanel(key)}
                    disabled={isLastVisible}
                    className="h-4 w-4 rounded border-slate-500 bg-slate-900"
                    style={{ accentColor: checkboxAccent }}
                  />
                  <span className="text-sm font-medium text-slate-200">{label}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
