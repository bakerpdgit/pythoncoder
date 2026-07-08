import React, { useState, useCallback } from 'react'
import type { InspectorNode, InspectorScopeData, InspectorPath } from '../types'

const INSPECTOR_RUNTIME_NAMES = new Set([
  'MAX_ITEMS', 'MAX_STRING', 'code_obj', 'control_blocks', 'current_breakpoints',
  'frame_depths', 'pending_action', 'source_lines', 'tree', 'user_code_str', 'node',
  'watch_expressions', 'evaluate_watches',
])

const isRuntimeInspectorEntry = (entry: { label: unknown }): boolean => {
  const label = String(entry?.label || '').replace(/^['"]|['"]$/g, '')
  return INSPECTOR_RUNTIME_NAMES.has(label) || label.startsWith('js_') || label.startsWith('pyodide')
}

const getInspectorChildren = (node: InspectorNode | null): Array<{ label: string; value: InspectorNode }> => {
  if (!node) return []
  if (node.kind === 'object') return node.attrs || []
  if (node.kind === 'scope' || node.kind === 'mapping') return node.entries || []
  if (node.kind === 'sequence') return node.items || []
  return []
}

const filterInspectorChildren = (children: Array<{ label: string; value: InspectorNode }>, showRuntimeValues: boolean) =>
  showRuntimeValues ? children : children.filter(entry => !isRuntimeInspectorEntry(entry))

const getInspectorNodeAtPath = (rootNode: InspectorNode, path: InspectorPath, showRuntimeValues = false): InspectorNode => {
  let currentNode: InspectorNode = rootNode
  for (const segment of path) {
    const children = filterInspectorChildren(getInspectorChildren(currentNode), showRuntimeValues)
    const nextChild = children[segment.index]
    if (!nextChild) return currentNode
    currentNode = nextChild.value
  }
  return currentNode
}

const buildInspectorBreadcrumbs = (root: InspectorScopeData, path: InspectorPath, showRuntimeValues = false) => {
  if (!root?.node) return []
  const breadcrumbs: Array<{ label: string; path: InspectorPath }> = [{ label: root.label, path: [] }]
  let currentNode: InspectorNode = root.node
  path.forEach((segment, depth) => {
    const children = filterInspectorChildren(getInspectorChildren(currentNode), showRuntimeValues)
    const child = children[segment.index]
    if (!child) return
    breadcrumbs.push({ label: child.label, path: path.slice(0, depth + 1) })
    currentNode = child.value
  })
  return breadcrumbs
}

const isInspectorCompound = (node: InspectorNode | null): boolean =>
  !!node && ['object', 'scope', 'mapping', 'sequence'].includes(node.kind)

const formatInspectorValue = (node: InspectorNode | null): string => {
  if (!node) return 'Unavailable'
  if (node.kind === 'primitive') {
    if (typeof node.value === 'string') return `"${node.summary ?? node.value}"`
    return node.summary ?? String(node.value)
  }
  if (node.kind === 'reference') return node.summary ?? node.type
  if (node.kind === 'object') return `${node.type} • ${node.attrs?.length ?? 0} attrs`
  if (node.kind === 'sequence') return `${node.type} • ${node.length ?? node.items?.length ?? 0} items`
  if (node.kind === 'mapping') return `dict • ${node.length ?? node.entries?.length ?? 0} entries`
  if (node.kind === 'scope') return `${node.type} scope • ${node.entries?.length ?? 0} values`
  return node.summary ?? node.type ?? 'Value'
}

// Short summary for the detail heading — omits the type name (shown separately above)
// so we don't render e.g. "Demo" then "Demo • 3 attrs".
const formatInspectorSummaryShort = (node: InspectorNode | null): string => {
  if (!node) return 'Unavailable'
  if (node.kind === 'object') return `${node.attrs?.length ?? 0} attrs`
  if (node.kind === 'sequence') return `${node.length ?? node.items?.length ?? 0} items`
  if (node.kind === 'mapping') return `${node.length ?? node.entries?.length ?? 0} entries`
  if (node.kind === 'scope') return `${node.entries?.length ?? 0} values`
  return formatInspectorValue(node)
}

const MAX_INLINE_STR = 80

const formatInspectorPrimitive = (node: InspectorNode | null): string => {
  if (!node) return ''
  if (node.kind !== 'primitive') return formatInspectorValue(node)
  if (typeof node.value === 'string') return `"${node.value}"`
  return node.summary ?? String(node.value)
}

const getCopyText = (node: InspectorNode | null): string => {
  if (!node) return ''
  if (node.kind === 'primitive') {
    if (typeof node.value === 'string') return node.value
    return node.summary ?? String(node.value)
  }
  return formatInspectorValue(node)
}

function useCopyFeedback() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copy = useCallback((key: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => { /* ignore */ })
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1200)
  }, [])
  return { copiedKey, copy }
}

interface Props {
  title: string
  root: InspectorScopeData | null
  path: InspectorPath
  setPath: (path: InspectorPath) => void
  emptyMessage: string
  unavailableMessage?: string
  showRuntimeValues?: boolean
  isCollapsed?: boolean
  onToggleCollapsed?: () => void
}

export const InspectorPane = ({
  title, root, path, setPath, emptyMessage, unavailableMessage = '',
  showRuntimeValues = false, isCollapsed = false, onToggleCollapsed,
}: Props) => {
  const [popupContent, setPopupContent] = useState<string | null>(null)
  const { copiedKey, copy } = useCopyFeedback()

  const header = (
    <div className="flex-shrink-0 border-b border-slate-700 px-3 py-2 flex items-center justify-between gap-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</div>
      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={isCollapsed ? 'Expand' : 'Collapse'}
          className="text-slate-500 hover:text-slate-300 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isCollapsed
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />}
          </svg>
        </button>
      )}
    </div>
  )

  if (isCollapsed) {
    return <div className="flex-shrink-0 rounded-lg border border-slate-700 bg-slate-900/60">{header}</div>
  }

  if (unavailableMessage) {
    return (
      <div className="flex h-full flex-col rounded-lg border border-slate-700 bg-slate-900/40">
        {header}
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-500">{unavailableMessage}</div>
      </div>
    )
  }

  if (!root?.node) {
    return (
      <div className="flex h-full flex-col rounded-lg border border-slate-700 bg-slate-900/40">
        {header}
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-500">{emptyMessage}</div>
      </div>
    )
  }

  const activeNode = getInspectorNodeAtPath(root.node, path, showRuntimeValues)
  const children = filterInspectorChildren(getInspectorChildren(activeNode), showRuntimeValues)
  const breadcrumbs = buildInspectorBreadcrumbs(root, path, showRuntimeValues)
  const isAtRootScope = path.length === 0 && root.node.kind === 'scope'

  return (
    <>
      <div className="flex h-full flex-col rounded-lg border border-slate-700 bg-slate-900/60">
        {header}

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
          {/* Breadcrumbs */}
          {path.length > 0 && (
            <div className="flex-shrink-0 flex flex-wrap items-center gap-2 text-xs">
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={`${crumb.label}-${index}`}>
                  {index > 0 && <span className="text-slate-500">/</span>}
                  <button
                    type="button"
                    onClick={() => setPath(crumb.path)}
                    className={`rounded border px-2 py-1 ${index === breadcrumbs.length - 1 ? 'border-sky-500 bg-sky-900/40 text-sky-100' : 'border-slate-600 bg-slate-900/60 text-slate-300 hover:border-sky-500'}`}
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              ))}
              <button type="button" onClick={() => setPath([])} className="ml-auto rounded border border-slate-600 px-2 py-1 text-slate-300 hover:border-sky-500">
                Back
              </button>
            </div>
          )}

          {/* Summary box */}
          {!isAtRootScope && (
            <div className="flex-shrink-0 rounded-lg border border-slate-700 bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-sm font-bold text-white truncate">{activeNode?.type || 'Value'}</span>
                  {isInspectorCompound(activeNode) && (
                    <span className="text-xs text-slate-400 flex-shrink-0">{formatInspectorSummaryShort(activeNode)}</span>
                  )}
                </div>
                {isInspectorCompound(activeNode) && <span className="text-xs text-slate-400 flex-shrink-0">{children.length} visible</span>}
              </div>
              {activeNode?.truncated && <div className="mt-3 text-xs text-amber-300">Showing first 120 entries.</div>}
              {!isInspectorCompound(activeNode) && (
                <pre className="mt-2 whitespace-pre-wrap rounded bg-black/40 p-2 text-sm text-emerald-300">
                  {formatInspectorPrimitive(activeNode)}
                </pre>
              )}
            </div>
          )}

          {/* Variable list — one row per variable, click a compound to drill in */}
          {isInspectorCompound(activeNode) ? (
            children.length > 0 ? (
              <div className="flex flex-col overflow-hidden rounded-lg border border-slate-700 divide-y divide-slate-800">
                {children.map((child, index) => {
                  const childNode = child.value
                  const canOpen = isInspectorCompound(childNode)
                  const cardKey = `${child.label}-${index}`
                  const isLongString = childNode?.kind === 'primitive' && typeof childNode.value === 'string' && childNode.value.length > MAX_INLINE_STR

                  const handleContextMenu = (e: React.MouseEvent) => {
                    e.preventDefault()
                    copy(cardKey, getCopyText(childNode))
                  }
                  const onRowClick = canOpen
                    ? () => setPath([...path, { index, label: child.label }])
                    : isLongString
                      ? () => setPopupContent(childNode.value as string)
                      : undefined

                  const valueText = canOpen ? formatInspectorValue(childNode) : formatInspectorPrimitive(childNode)
                  const rowClasses = `flex w-full items-center gap-2 px-2 py-1 text-left transition-colors bg-slate-800/60 ${onRowClick ? 'hover:bg-slate-700 cursor-pointer' : ''}`

                  const rowInner = (
                    <>
                      <span className="flex-shrink-0 max-w-[45%] truncate font-semibold text-slate-100" title={child.label}>{child.label}</span>
                      <span className="flex-shrink-0 text-[9px] uppercase tracking-wider text-slate-500">{childNode?.type || 'value'}</span>
                      <span className={`flex-1 truncate text-right text-xs ${copiedKey === cardKey ? 'text-amber-300' : 'text-emerald-300'}`}
                        title={valueText}>
                        {copiedKey === cardKey ? '✓ Copied' : valueText}
                      </span>
                      {canOpen
                        ? <span className="flex-shrink-0 text-sky-300">›</span>
                        : isLongString ? <span className="flex-shrink-0 text-[10px] text-sky-400 underline">full</span> : null}
                    </>
                  )

                  return onRowClick ? (
                    <button type="button" key={cardKey} onClick={onRowClick} onContextMenu={handleContextMenu}
                      className={rowClasses} title={canOpen ? 'Open — right-click to copy' : 'Show full — right-click to copy'}>
                      {rowInner}
                    </button>
                  ) : (
                    <div key={cardKey} className={rowClasses} onContextMenu={handleContextMenu} title="Right-click to copy">
                      {rowInner}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-sm italic text-slate-500">{isAtRootScope ? emptyMessage : 'No values to display.'}</div>
            )
          ) : null}
        </div>
      </div>

      {/* Full-string popup */}
      {popupContent !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPopupContent(null)}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-slate-600 bg-slate-800 shadow-2xl flex flex-col max-h-[80vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3 flex-shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">String Value</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(popupContent).catch(() => {}) }}
                  className="text-xs text-sky-400 hover:text-sky-300 border border-slate-600 rounded px-2 py-1"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => setPopupContent(null)}
                  className="text-xs text-slate-400 hover:text-slate-200 border border-slate-600 rounded px-2 py-1"
                >
                  Close
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-sm text-emerald-300 whitespace-pre-wrap break-words font-mono">
              {popupContent}
            </pre>
            <div className="border-t border-slate-700 px-4 py-2 flex-shrink-0 text-[11px] text-slate-500">
              {popupContent.length.toLocaleString()} characters
            </div>
          </div>
        </div>
      )}
    </>
  )
}
