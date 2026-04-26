import type { RefObject } from 'react'
import { RUNTIME_OPTIONS, RUNTIME_LABELS } from '../../constants'
import type { RuntimeKey } from '../../types'

interface Props {
  menuRef: RefObject<HTMLDivElement>
  isOpen: boolean
  onToggleOpen: () => void
  runtimePreference: RuntimeKey
  selectedRuntime: RuntimeKey
  onSelectRuntime: (key: RuntimeKey) => void
  isPygameLocked: boolean
  hasSab: boolean
  disabled?: boolean
}

export const RuntimeSettingsMenu = ({
  menuRef, isOpen, onToggleOpen, runtimePreference, selectedRuntime,
  onSelectRuntime, isPygameLocked, hasSab, disabled = false,
}: Props) => (
  <div className="relative" ref={menuRef}>
    <button
      type="button"
      onClick={onToggleOpen}
      disabled={disabled}
      aria-haspopup="true"
      aria-expanded={isOpen}
      className="flex items-center gap-2 rounded border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      title="Choose the execution mode"
    >
      <svg className="h-4 w-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317a1 1 0 011.35-.936l.176.081a1 1 0 001.061-.142l.14-.132a1 1 0 011.414 0l.165.165a1 1 0 001.06.143l.177-.081a1 1 0 011.35.936l.02.192a1 1 0 00.76.843l.188.047a1 1 0 01.728 1.23l-.05.186a1 1 0 00.143 1.06l.112.154a1 1 0 010 1.414l-.112.154a1 1 0 00-.143 1.06l.05.186a1 1 0 01-.728 1.23l-.188.047a1 1 0 00-.76.843l-.02.192a1 1 0 01-1.35.936l-.177-.081a1 1 0 00-1.06.143l-.165.165a1 1 0 01-1.414 0l-.14-.132a1 1 0 00-1.061-.142l-.176.081a1 1 0 01-1.35-.936l-.02-.192a1 1 0 00-.76-.843l-.188-.047a1 1 0 01-.728-1.23l.05-.186a1 1 0 00-.143-1.06l-.112-.154a1 1 0 010-1.414l.112-.154a1 1 0 00.143-1.06l-.05-.186a1 1 0 01.728-1.23l.188-.047a1 1 0 00.76-.843l.02-.192z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      Execution
      <span className="rounded border border-slate-500 bg-slate-900/80 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">
        {RUNTIME_LABELS[selectedRuntime]}
      </span>
    </button>

    {isOpen && (
      <div className="absolute right-0 z-30 mt-2 w-80 rounded-lg border border-slate-600 bg-slate-800 p-2 shadow-2xl">
        <div className="px-2 pb-2 text-[11px] uppercase tracking-wider text-slate-500">Execution Mode</div>
        <div className="space-y-1">
          {RUNTIME_OPTIONS.map(({ key, label, description }) => {
            const isDisabled = key === 'trace-worker' && isPygameLocked
            const isSelected = selectedRuntime === key
            const helperText =
              key === 'trace-worker' && isPygameLocked
                ? 'Disabled while this code imports pygame.'
                : key === 'trace-worker' && !hasSab
                  ? 'Requires SharedArrayBuffer on this page.'
                  : description
            return (
              <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-slate-900/70 ${isDisabled ? 'cursor-not-allowed opacity-60' : ''}`}>
                <input
                  type="radio"
                  name="runtime-preference"
                  checked={isSelected}
                  onChange={() => onSelectRuntime(key as RuntimeKey)}
                  disabled={isDisabled}
                  className="mt-0.5 h-4 w-4 border-slate-500 bg-slate-900"
                  style={{ accentColor: '#34d399' }}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-200">{label}</span>
                  <span className="block text-[11px] text-slate-500">{helperText}</span>
                  {runtimePreference === key && !isPygameLocked && (
                    <span className="mt-1 inline-flex rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                      Preferred
                    </span>
                  )}
                </span>
              </label>
            )
          })}
        </div>
        <div className="px-2 pt-2 text-[11px] text-slate-500">
          {isPygameLocked
            ? 'Pygame import detected. Main-thread execution is required until that import is removed.'
            : 'Use trace worker by default for debugging. Switch to main thread when browser isolation is unavailable or popup input is acceptable.'}
        </div>
      </div>
    )}
  </div>
)
