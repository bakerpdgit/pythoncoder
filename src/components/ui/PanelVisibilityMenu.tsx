import type { RefObject } from 'react'
import type { PanelVisibility } from '../../types'

interface PanelOption {
  key: string
  label: string
  description: string
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
}

export const PanelVisibilityMenu = ({
  menuRef, isOpen, onToggleOpen, panelOptions, visiblePanels, onTogglePanel,
  buttonHoverClass = 'hover:border-emerald-400', checkboxAccent = '#34d399', disabled = false,
}: Props) => {
  const visibleCount = panelOptions.filter(({ key }) => visiblePanels[key as keyof PanelVisibility]).length

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={onToggleOpen}
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={isOpen}
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
          <div className="px-2 pb-2 text-[11px] uppercase tracking-wider text-slate-500">Panel Visibility</div>
          <div className="space-y-1">
            {panelOptions.map(({ key, label, description }) => {
              const isVisible = visiblePanels[key as keyof PanelVisibility]
              const isLastVisible = visibleCount === 1 && isVisible
              return (
                <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-slate-900/70 ${isLastVisible ? 'opacity-60' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={() => onTogglePanel(key)}
                    disabled={isLastVisible}
                    className="mt-0.5 h-4 w-4 rounded border-slate-500 bg-slate-900"
                    style={{ accentColor: checkboxAccent }}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-200">{label}</span>
                    <span className="block text-[11px] text-slate-500">{description}</span>
                  </span>
                </label>
              )
            })}
          </div>
          <div className="px-2 pt-2 text-[11px] text-slate-500">Focus a checkbox and press Space to toggle it.</div>
        </div>
      )}
    </div>
  )
}
