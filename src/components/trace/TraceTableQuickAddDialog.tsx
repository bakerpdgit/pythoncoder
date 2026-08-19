import { useEffect, useRef, useState } from 'react'
import type { TraceVariableDefinition } from '../../types/traceTable'

interface TraceTableQuickAddDialogProps {
  open: boolean
  availableVariables: TraceVariableDefinition[]
  onAdd: (variableId: string, headerLabel: string) => void
  onClose: () => void
}

export const TraceTableQuickAddDialog = ({
  open,
  availableVariables,
  onAdd,
  onClose,
}: TraceTableQuickAddDialogProps) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const expressionRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [expression, setExpression] = useState('')
  const [headerLabel, setHeaderLabel] = useState('')
  const [validationMessage, setValidationMessage] = useState('')

  useEffect(() => {
    if (!open) return
    const first = availableVariables[0]
    setExpression(first?.defaultLabel ?? '')
    setHeaderLabel(first?.defaultLabel ?? '')
    setValidationMessage('')
    requestAnimationFrame(() => (expressionRef.current ?? closeRef.current)?.focus())
  }, [availableVariables, open])

  if (!open) return null

  const resolveExpression = (value: string) => {
    const normalised = value.trim()
    return availableVariables.find(variable =>
      variable.defaultLabel === normalised || variable.name === normalised || variable.id === normalised,
    )
  }
  const selected = resolveExpression(expression)
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'select:not(:disabled), input:not(:disabled), button:not(:disabled)',
    ) ?? [])
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable.at(-1)!
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trace-table-quick-add-title"
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-lg border border-slate-600 bg-slate-900 p-4 shadow-2xl"
      >
        <h3 id="trace-table-quick-add-title" className="text-sm font-semibold text-slate-100">Add a trace column</h3>
        <p className="mt-1 text-xs text-slate-400">Choose a user-variable expression discovered during this trace and optionally shorten its heading.</p>
        {availableVariables.length > 0 ? (
          <form
            className="mt-4 space-y-3"
            onSubmit={event => {
              event.preventDefault()
              if (!selected) {
                setValidationMessage('Choose one of the available user variables.')
                return
              }
              onAdd(selected.id, headerLabel.trim() || selected.defaultLabel)
            }}
          >
            <label htmlFor="trace-table-quick-add-expression" className="block text-xs font-medium text-slate-300">
              Discovered variable expression
              <input
                id="trace-table-quick-add-expression"
                aria-label="Discovered variable expression"
                ref={expressionRef}
                type="text"
                list="trace-table-quick-add-variables"
                value={expression}
                onChange={event => {
                  const next = resolveExpression(event.target.value)
                  setExpression(event.target.value)
                  setValidationMessage('')
                  if (next) setHeaderLabel(next.defaultLabel)
                }}
                aria-describedby={validationMessage ? 'trace-table-quick-add-error' : undefined}
                aria-invalid={validationMessage ? 'true' : undefined}
                className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              />
              <datalist id="trace-table-quick-add-variables">
                {availableVariables.map(variable => (
                  <option key={variable.id} value={variable.defaultLabel}>{variable.name}</option>
                ))}
              </datalist>
            </label>
            {validationMessage && <p id="trace-table-quick-add-error" role="alert" className="text-xs text-red-200">{validationMessage}</p>}
            <label htmlFor="trace-table-quick-add-heading" className="block text-xs font-medium text-slate-300">
              Column header
              <input
                id="trace-table-quick-add-heading"
                aria-label="Column header"
                type="text"
                value={headerLabel}
                onChange={event => setHeaderLabel(event.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800">Cancel</button>
              <button type="submit" className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500">Add column</button>
            </div>
          </form>
        ) : (
          <div className="mt-4">
            <p className="rounded-md bg-slate-800/70 p-3 text-sm text-slate-400">Every available user variable is already shown.</p>
            <div className="mt-3 flex justify-end">
              <button ref={closeRef} type="button" onClick={onClose} className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800">Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TraceTableQuickAddDialog
