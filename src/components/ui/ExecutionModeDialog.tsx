import { useEffect } from 'react'
import { RUNTIME_OPTIONS } from '../../constants'
import type { RuntimeKey } from '../../types'

interface Props {
  isOpen: boolean
  onClose: () => void
  runtimePreference: RuntimeKey
  selectedRuntime: RuntimeKey
  onSelectRuntime: (key: RuntimeKey) => void
  isPygameLocked: boolean
  hasSab: boolean
}

/** Reached from the settings menu's "Execution: …" row; holds the detail that row leaves out. */
export const ExecutionModeDialog = ({
  isOpen, onClose, runtimePreference, selectedRuntime, onSelectRuntime, isPygameLocked, hasSab,
}: Props) => {
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="execution-mode-title"
        className="w-full max-w-md rounded-xl border border-slate-600 bg-slate-800 shadow-2xl overflow-y-auto max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <h2 id="execution-mode-title" className="text-sm font-bold uppercase tracking-wider text-slate-200">Execution Mode</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-400 hover:border-slate-400 hover:text-slate-200"
          >
            Close
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          {RUNTIME_OPTIONS.map(({ key, label, description }) => {
            const isDisabled = key === 'trace-worker' && isPygameLocked
            const active = selectedRuntime === key
            const helperText =
              isDisabled
                ? 'Disabled while this code imports pygame.'
                : key === 'trace-worker' && !hasSab
                  ? 'Requires SharedArrayBuffer on this page.'
                  : description
            return (
              <button
                key={key}
                type="button"
                disabled={isDisabled}
                aria-pressed={active}
                onClick={() => onSelectRuntime(key)}
                className={`rounded-lg border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  active
                    ? 'border-emerald-500 bg-emerald-900/20'
                    : 'border-slate-600 bg-slate-900/40 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full border-2 flex-shrink-0 ${
                    active ? 'border-emerald-400 bg-emerald-400' : 'border-slate-500 bg-transparent'
                  }`} />
                  <span className={`text-sm font-semibold ${active ? 'text-emerald-300' : 'text-slate-200'}`}>{label}</span>
                  {runtimePreference === key && !isPygameLocked && (
                    <span className="ml-auto rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                      Preferred
                    </span>
                  )}
                </div>
                <p className="mt-1.5 pl-5 text-xs text-slate-400 leading-relaxed">{helperText}</p>
              </button>
            )
          })}
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {isPygameLocked
              ? 'Pygame import detected. Main-thread execution is required until that import is removed.'
              : 'Use trace worker by default for debugging. Switch to main thread when browser isolation is unavailable or popup input is acceptable.'}
          </p>
        </div>
      </div>
    </div>
  )
}
