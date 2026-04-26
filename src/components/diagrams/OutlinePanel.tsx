import type { OutlineModel, OutlineNode } from '../../types'
import { getExpandableOutlineIds, countOutlineNodes } from '../../utils/codeAnalysis'

const OUTLINE_KIND_LABELS: Record<string, string> = {
  class: 'Class', method: 'Method', function: 'Function', attribute: 'Attribute',
  global: 'Global', constant: 'Constant', local: 'Local', parameter: 'Parameter',
}

const OUTLINE_KIND_MARKS: Record<string, string> = {
  class: 'C', method: 'M', function: 'F', attribute: 'A',
  global: 'G', constant: 'K', local: 'L', parameter: 'P',
}

interface Props {
  outlineModel: OutlineModel
  expandedIds: Set<string>
  setExpandedIds: (fn: (prev: Set<string>) => Set<string>) => void
  onJumpToLine: (line: number) => void
  currentLine: number
}

export const OutlinePanel = ({ outlineModel, expandedIds, setExpandedIds, onJumpToLine, currentLine }: Props) => {
  const expandableIds = getExpandableOutlineIds(outlineModel)
  const anyExpanded = expandedIds.size > 0

  const toggleNode = (nodeId: string) => {
    setExpandedIds(current => {
      const next = new Set(current)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  const renderNode = (node: OutlineNode, depth = 0): React.ReactNode => {
    const hasChildren = node.children?.length > 0
    const isExpanded = expandedIds.has(node.id)
    const isCurrent = currentLine > 0 && node.line <= currentLine

    return (
      <div key={node.id}>
        <div
          className={`flex min-w-0 items-center gap-1 rounded px-2 py-1 text-sm transition-colors ${isCurrent ? 'bg-sky-700/60 text-white' : 'text-slate-300 hover:bg-slate-700/60'}`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          <button type="button" onClick={() => hasChildren && toggleNode(node.id)} disabled={!hasChildren}
            className="h-5 w-5 shrink-0 text-slate-400 disabled:text-transparent" title={hasChildren ? 'Expand or collapse' : ''}>
            {hasChildren ? (isExpanded ? '▾' : '▸') : '•'}
          </button>
          <button type="button" onClick={() => onJumpToLine(node.line)} className="flex min-w-0 flex-1 items-center gap-2 text-left"
            title={`${OUTLINE_KIND_LABELS[node.kind] || 'Symbol'}: ${node.name}`}>
            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-600 text-[10px] font-bold text-slate-300">
              {OUTLINE_KIND_MARKS[node.kind] || 'S'}
            </span>
            <span className="truncate">{node.name}</span>
            <span className="ml-auto shrink-0 text-[11px] text-slate-500">{node.line}</span>
          </button>
        </div>
        {hasChildren && isExpanded && (
          <div>{node.children.map(child => renderNode(child, depth + 1))}</div>
        )}
      </div>
    )
  }

  if (!outlineModel.roots.length) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-600 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
        No classes, functions, or variables found in the current editor yet.
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[280px] flex-col rounded-lg border border-slate-700 bg-slate-900/50">
      <div className="flex items-center justify-between border-b border-slate-700 px-3 py-2">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">{countOutlineNodes(outlineModel)} symbols</div>
        <button type="button"
          onClick={() => setExpandedIds(() => anyExpanded ? new Set() : new Set(expandableIds))}
          className="rounded border border-slate-600 px-2 py-1 text-[11px] font-semibold text-slate-300 transition-colors hover:border-sky-400">
          {anyExpanded ? 'Collapse All' : 'Expand All'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {outlineModel.roots.map(node => renderNode(node))}
      </div>
    </div>
  )
}
