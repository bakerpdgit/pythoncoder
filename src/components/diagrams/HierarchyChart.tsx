import type { HierarchyModel, LayoutNode } from '../../types'
import { buildCallHierarchyLayout, getHierarchyMetrics } from './diagramLayout'

interface NodeProps {
  x: number; y: number; width: number; label: string; active: boolean
  metrics: ReturnType<typeof getHierarchyMetrics>
}

const HierarchyNode = ({ x, y, width, label, active, metrics }: NodeProps) => (
  <g>
    <rect x={x} y={y} width={width} height={metrics.nodeHeight} rx="10"
      fill={active ? '#065f46' : '#334155'} stroke={active ? '#34d399' : '#64748b'} strokeWidth={active ? 2.5 : 1.5} />
    <text x={x + width / 2} y={y + metrics.nodeHeight / 2} textAnchor="middle" dominantBaseline="middle"
      fontSize={metrics.fontSize} fontWeight="700" fill="#e2e8f0">
      {label}
    </text>
  </g>
)

interface Props {
  currentFunc: string
  hierarchyModel: HierarchyModel
  fontSize: number
}

export const HierarchyChart = ({ currentFunc, hierarchyModel, fontSize }: Props) => {
  const layout = buildCallHierarchyLayout(hierarchyModel, fontSize)
  const { metrics } = layout

  const renderNode = (node: LayoutNode): React.ReactNode => {
    const active = node.name === currentFunc
    const nodeCenterX = node.x + node.width / 2
    const busY = node.y + metrics.levelGap! - metrics.busOffset
    return (
      <g key={`${node.name}-${node.x}-${node.y}`}>
        {node.children.length > 0 && (
          <>
            <line x1={nodeCenterX} y1={node.y + metrics.nodeHeight} x2={nodeCenterX} y2={busY} stroke="#94a3b8" strokeWidth="2" />
            {node.children.length > 1 && (
              <line x1={node.children[0].x + node.children[0].width / 2} y1={busY}
                x2={node.children[node.children.length - 1].x + node.children[node.children.length - 1].width / 2}
                y2={busY} stroke="#475569" strokeWidth="2" />
            )}
            {node.children.map(child => (
              <line key={`${node.name}-${child.name}-link`} x1={child.x + child.width / 2} y1={busY}
                x2={child.x + child.width / 2} y2={child.y} stroke="#475569" strokeWidth="2" />
            ))}
          </>
        )}
        <HierarchyNode x={node.x} y={node.y} width={node.width} label={node.name} active={active} metrics={metrics} />
        {node.children.map(renderNode)}
      </g>
    )
  }

  if (!hierarchyModel.orderedNames?.length) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-600 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
        No function definitions found in the current editor yet.
      </div>
    )
  }

  return (
    <svg width={layout.width} height={layout.height + metrics.busOffset}
      viewBox={`0 0 ${layout.width} ${layout.height + metrics.busOffset}`}
      className="mx-auto block max-w-none" role="img" aria-label="Live function call hierarchy chart">
      {layout.roots.map(renderNode)}
    </svg>
  )
}
