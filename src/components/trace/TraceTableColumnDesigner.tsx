import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { TraceVariableDefinition, TraceVariableId } from '../../types/traceTable'

export interface TraceTableColumnDesignerResult {
  autoSelect: boolean
  variableIds: TraceVariableId[]
  aliases: Record<TraceVariableId, string>
}

export interface TraceTableColumnDesignerProps {
  open: boolean
  availableVariables: TraceVariableDefinition[]
  selectedVariableIds: TraceVariableId[]
  aliases: Record<TraceVariableId, string>
  fallbackLabels?: Record<TraceVariableId, string>
  autoSelect: boolean
  onApply: (result: TraceTableColumnDesignerResult) => void
  onClose: () => void
}

interface VariableGroup {
  key: string
  heading: string
  variables: TraceVariableDefinition[]
}

const uniqueIds = (ids: TraceVariableId[]): TraceVariableId[] => [...new Set(ids)]

const decodeIdPart = (part: string): string => {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

const unavailableLabel = (id: TraceVariableId): string => {
  const parts = id.split(':')
  const sourceName = parts.length > 1 ? decodeIdPart(parts.at(-1) ?? id) : id
  const readableName = sourceName.replace(/[_-]+/g, ' ').trim()
  return readableName || 'Saved variable'
}

const scopeLabel = (variable: TraceVariableDefinition): string => {
  if (variable.scope.kind === 'global') return 'Global scope'
  const owner = variable.scope.owner
  return owner === variable.scope.functionName
    ? `Local to ${owner}`
    : `Local to ${owner} (${variable.scope.functionName})`
}

const sortVariables = (left: TraceVariableDefinition, right: TraceVariableDefinition): number =>
  left.firstSeenSequence - right.firstSeenSequence
  || left.defaultLabel.localeCompare(right.defaultLabel)
  || left.id.localeCompare(right.id)

const groupVariables = (variables: TraceVariableDefinition[]): VariableGroup[] => {
  const globals: TraceVariableDefinition[] = []
  const locals = new Map<string, { owner: string; functionName: string; variables: TraceVariableDefinition[] }>()

  variables.forEach(variable => {
    if (variable.scope.kind === 'global') {
      globals.push(variable)
      return
    }

    const key = `${variable.scope.owner}\u0000${variable.scope.functionName}`
    const group = locals.get(key) ?? {
      owner: variable.scope.owner,
      functionName: variable.scope.functionName,
      variables: [],
    }
    group.variables.push(variable)
    locals.set(key, group)
  })

  const groups: VariableGroup[] = []
  if (globals.length > 0) groups.push({ key: 'globals', heading: 'Globals', variables: globals.sort(sortVariables) })

  ;[...locals.entries()]
    .sort(([, left], [, right]) => left.owner.localeCompare(right.owner) || left.functionName.localeCompare(right.functionName))
    .forEach(([key, group]) => {
      const functionDetail = group.owner === group.functionName ? '' : ` · ${group.functionName}`
      groups.push({
        key: `locals:${key}`,
        heading: `Locals — ${group.owner}${functionDetail}`,
        variables: group.variables.sort(sortVariables),
      })
    })

  return groups
}

/** Accessible modal for choosing, ordering, and naming trace-table columns. */
export const TraceTableColumnDesigner = ({
  open,
  availableVariables,
  selectedVariableIds,
  aliases,
  fallbackLabels = {},
  autoSelect,
  onApply,
  onClose,
}: TraceTableColumnDesignerProps) => {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const wasOpenRef = useRef(false)
  const onCloseRef = useRef(onClose)
  const [search, setSearch] = useState('')
  const [draftVariableIds, setDraftVariableIds] = useState(() => uniqueIds(selectedVariableIds))
  const [draftAliases, setDraftAliases] = useState<Record<TraceVariableId, string>>(() => ({ ...aliases }))
  const [draftAutoSelect, setDraftAutoSelect] = useState(autoSelect)

  const availableById = useMemo(
    () => new Map(availableVariables.map(variable => [variable.id, variable])),
    [availableVariables],
  )

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Automatic mode remains a live view of the recorder catalogue. New
  // variables are merged without disturbing aliases, ordering, or other edits.
  // This effect intentionally runs before the open-transition reset below.
  useEffect(() => {
    if (!open || !draftAutoSelect) return
    setDraftVariableIds(current => uniqueIds([
      ...current,
      ...availableVariables.slice().sort(sortVariables).map(variable => variable.id),
    ]))
  }, [availableVariables, draftAutoSelect, open])

  useEffect(() => {
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = open
    if (!open || wasOpen) return
    setSearch('')
    setDraftVariableIds(uniqueIds(selectedVariableIds))
    setDraftAliases({ ...aliases })
    setDraftAutoSelect(autoSelect)
  }, [aliases, autoSelect, open, selectedVariableIds])

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    searchRef.current?.focus()

    const handleDialogKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = [...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleDialogKey)
    return () => {
      document.removeEventListener('keydown', handleDialogKey)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [open])

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    const matchingVariables = query
      ? availableVariables.filter(variable => {
          const searchableScope = variable.scope.kind === 'global'
            ? 'global globals'
            : `local locals ${variable.scope.owner} ${variable.scope.functionName} ${variable.scope.className ?? ''}`
          return [variable.name, variable.defaultLabel, variable.category ?? '', searchableScope]
            .some(value => value.toLocaleLowerCase().includes(query))
        })
      : availableVariables
    return groupVariables(matchingVariables)
  }, [availableVariables, search])

  if (!open) return null

  const selectedSet = new Set(draftVariableIds)

  const toggleVariable = (id: TraceVariableId) => {
    setDraftAutoSelect(false)
    setDraftVariableIds(current => current.includes(id)
      ? current.filter(variableId => variableId !== id)
      : [...current, id])
  }

  const moveVariable = (index: number, offset: -1 | 1) => {
    setDraftAutoSelect(false)
    setDraftVariableIds(current => {
      const target = index + offset
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const selectAll = () => {
    setDraftAutoSelect(false)
    setDraftVariableIds(current => {
      const unavailableIds = current.filter(id => !availableById.has(id))
      return uniqueIds([...availableVariables.slice().sort(sortVariables).map(variable => variable.id), ...unavailableIds])
    })
  }

  const reset = () => {
    setSearch('')
    setDraftVariableIds(uniqueIds(selectedVariableIds))
    setDraftAliases({ ...aliases })
    setDraftAutoSelect(autoSelect)
  }

  const apply = () => {
    const selectedAliases = draftVariableIds.reduce<Record<TraceVariableId, string>>((result, id) => {
      const alias = draftAliases[id]?.trim()
      const defaultLabel = availableById.get(id)?.defaultLabel ?? fallbackLabels[id] ?? unavailableLabel(id)
      if (alias && alias !== defaultLabel) result[id] = alias
      return result
    }, {})
    onApply({ autoSelect: draftAutoSelect, variableIds: draftVariableIds, aliases: selectedAliases })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="flex max-h-[min(90vh,52rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-700 px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-slate-100">Design trace table columns</h2>
            <p id={descriptionId} className="mt-1 text-sm text-slate-400">
              Choose the variables to display, then arrange their left-to-right order and edit their column headers.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close column designer"
            className="rounded-md px-2 py-1 text-lg leading-none text-slate-400 hover:bg-slate-700/60 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <fieldset className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
            <legend className="px-1 text-sm font-semibold text-slate-200">How columns are added</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={`flex cursor-pointer gap-2 rounded-md border p-3 ${draftAutoSelect ? 'border-sky-500 bg-sky-500/10' : 'border-slate-700'}`}>
                <input
                  type="radio"
                  name="trace-column-mode"
                  checked={draftAutoSelect}
                  onChange={() => setDraftAutoSelect(true)}
                  className="mt-0.5 accent-sky-500"
                />
                <span>
                  <span className="block text-sm font-medium">Automatic</span>
                  <span className="mt-0.5 block text-xs text-slate-400">New runtime variables automatically appear as they are discovered.</span>
                </span>
              </label>
              <label className={`flex cursor-pointer gap-2 rounded-md border p-3 ${!draftAutoSelect ? 'border-sky-500 bg-sky-500/10' : 'border-slate-700'}`}>
                <input
                  type="radio"
                  name="trace-column-mode"
                  checked={!draftAutoSelect}
                  onChange={() => setDraftAutoSelect(false)}
                  className="mt-0.5 accent-sky-500"
                />
                <span>
                  <span className="block text-sm font-medium">Custom</span>
                  <span className="mt-0.5 block text-xs text-slate-400">Only variables you choose are displayed.</span>
                </span>
              </label>
            </div>
          </fieldset>

          <div className="mt-4 grid min-h-0 gap-4 lg:grid-cols-[minmax(17rem,0.9fr)_minmax(22rem,1.4fr)]">
            <section aria-labelledby={`${titleId}-available`} className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 id={`${titleId}-available`} className="text-sm font-semibold">Available variables</h3>
                <div className="flex gap-1">
                  <button type="button" onClick={selectAll} className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-sky-500/10">All</button>
                  <button type="button" onClick={() => { setDraftAutoSelect(false); setDraftVariableIds([]) }} className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-700/60">Clear</button>
                  <button type="button" onClick={reset} className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-700/60">Reset</button>
                </div>
              </div>
              <label htmlFor={`${titleId}-search`} className="sr-only">Search available variables</label>
              <input
                ref={searchRef}
                id={`${titleId}-search`}
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search variables or scopes"
                className="mt-3 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />

              <div className="mt-3 max-h-80 space-y-4 overflow-y-auto pr-1">
                {filteredGroups.map(group => (
                  <fieldset key={group.key}>
                    <legend className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">{group.heading}</legend>
                    <div className="space-y-1.5">
                      {group.variables.map((variable, index) => (
                        <label key={variable.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-700 bg-slate-800/40 p-2 hover:border-slate-600">
                          <input
                            type="checkbox"
                            checked={selectedSet.has(variable.id)}
                            onChange={() => toggleVariable(variable.id)}
                            className="mt-0.5 accent-sky-500"
                            aria-describedby={`${titleId}-variable-${group.key.replace(/[^a-zA-Z0-9_-]/g, '-')}-${index}`}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-200">{variable.defaultLabel}</span>
                            <span id={`${titleId}-variable-${group.key.replace(/[^a-zA-Z0-9_-]/g, '-')}-${index}`} className="block text-xs text-slate-400">
                              Default header: {variable.defaultLabel} · {scopeLabel(variable)}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
                {filteredGroups.length === 0 && (
                  <p role="status" className="py-6 text-center text-sm text-slate-500">No variables match this search.</p>
                )}
              </div>
            </section>

            <section aria-labelledby={`${titleId}-selected`} className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 id={`${titleId}-selected`} className="text-sm font-semibold">Selected columns</h3>
                <span className="text-xs text-slate-400" aria-live="polite">{draftVariableIds.length} selected · left to right</span>
              </div>

              {draftVariableIds.length > 0 ? (
                <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                  {draftVariableIds.map((id, index) => {
                    const variable = availableById.get(id)
                    const label = variable?.defaultLabel ?? fallbackLabels[id] ?? unavailableLabel(id)
                    const unavailable = !variable
                    return (
                      <li key={id} className="rounded-md border border-slate-700 bg-slate-800/40 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Column {index + 1}</span>
                            <span className="block truncate text-sm font-medium text-slate-200">{label}</span>
                            <span className="block text-xs text-slate-400">
                              {unavailable ? 'Unavailable this run' : scopeLabel(variable)}
                            </span>
                          </div>
                          <div className="flex shrink-0 gap-1" role="group" aria-label={`Arrange ${label}`}>
                            <button
                              type="button"
                              onClick={() => moveVariable(index, -1)}
                              disabled={index === 0}
                              aria-label={`Move ${label} left`}
                              className="rounded px-1.5 py-1 text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              onClick={() => moveVariable(index, 1)}
                              disabled={index === draftVariableIds.length - 1}
                              aria-label={`Move ${label} right`}
                              className="rounded px-1.5 py-1 text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              →
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleVariable(id)}
                              aria-label={`Remove ${label}`}
                              className="rounded px-1.5 py-1 text-red-200 hover:bg-red-500/10"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        <label className="mt-2 block text-xs text-slate-400">
                          Column header for {label}
                          <input
                            type="text"
                            value={draftAliases[id] ?? label}
                            onChange={event => setDraftAliases(current => ({ ...current, [id]: event.target.value }))}
                            className="mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </label>
                      </li>
                    )
                  })}
                </ol>
              ) : (
                <p className="mt-3 rounded-md border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
                  No columns selected. Choose variables from the available list.
                </p>
              )}
            </section>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-700 bg-slate-950/40 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700/60">
            Cancel
          </button>
          <button type="button" onClick={apply} className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500">
            Apply columns
          </button>
        </footer>
      </section>
    </div>
  )
}

export default TraceTableColumnDesigner
