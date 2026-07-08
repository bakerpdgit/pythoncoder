import { useState } from 'react'

interface Props {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Optional amber warning line shown beneath the message. */
  warning?: string
  /** When provided, renders a checkbox; its state is passed to onConfirm. */
  checkboxLabel?: string
  onConfirm: (checked: boolean) => void
  onCancel: () => void
}

export function ConfirmDialog({ message, confirmLabel = 'OK', cancelLabel = 'Cancel', warning, checkboxLabel, onConfirm, onCancel }: Props) {
  const [checked, setChecked] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-full max-w-sm mx-4 p-6">
        <p className="text-slate-200 text-sm mb-4 whitespace-pre-wrap">{message}</p>
        {warning && (
          <div className="confirm-warning flex items-start gap-2 mb-4 rounded px-3 py-2 text-xs">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>{warning}</span>
          </div>
        )}
        {checkboxLabel && (
          <label className="flex items-center gap-2 mb-4 text-slate-300 text-xs cursor-pointer select-none">
            <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
              className="accent-sky-500" />
            {checkboxLabel}
          </label>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition-colors">
            {cancelLabel}
          </button>
          <button type="button" onClick={() => onConfirm(checked)}
            className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
