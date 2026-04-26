import type { DiagramModel, LayoutNode } from '../../types'
import { getUmlMetrics, buildCompositionLayout, buildInheritanceLayout, getDiagramNodeWidth } from './diagramLayout'
import { isClassActiveInDiagram } from '../../utils/codeAnalysis'

interface ClassBoxProps {
  x: number; y: number; width: number; label: string; active: boolean
  metrics: ReturnType<typeof getUmlMetrics>
}

const UmlClassBox = ({ x, y, width, label, active, metrics }: ClassBoxProps) => (
  <g>
    <rect x={x} y={y} width={width} height={metrics.nodeHeight} rx="10"
      fill={active ? '#1d4ed8' : '#334155'} stroke={active ? '#93c5fd' : '#64748b'} strokeWidth={active ? 2.5 : 1.5} />
    <text x={x + width / 2} y={y + metrics.nodeHeight / 2} textAnchor="middle" dominantBaseline="middle"
      fontSize={metrics.fontSize} fontWeight="700" fill="#e2e8f0">
      {label}
    </text>
  </g>
)

interface Props {
  currentClass: string
  diagramModel: DiagramModel
  fontSize: number
}

export const UmlDiagram = ({ currentClass, diagramModel, fontSize }: Props) => {
  const metrics = getUmlMetrics(fontSize)
  const compositionLayout = buildCompositionLayout(diagramModel, metrics)
  const inheritanceLayout = buildInheritanceLayout(diagramModel, metrics)
  const width = Math.max(compositionLayout.width, inheritanceLayout.width, 1)
  const compositionYOffset = metrics.topPadding
  const inheritanceYOffset = compositionYOffset + compositionLayout.height + metrics.sectionGap
  const height = inheritanceYOffset + inheritanceLayout.height + metrics.footerPadding

  const renderInheritanceNode = (node: LayoutNode): React.ReactNode => {
    const nodeCenterX = node.x + node.width / 2
    const childrenRowY = node.y + metrics.inheritanceLevelGap
    const busY = childrenRowY - metrics.busOffset
    return (
      <g key={`${node.name}-${node.x}-${node.y}`}>
        {node.children.length > 0 && (
          <>
            <line x1={nodeCenterX} y1={node.y + metrics.nodeHeight} x2={nodeCenterX} y2={busY}
              stroke="#94a3b8" strokeWidth="2" markerStart="url(#uml-generalization)" />
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
        <UmlClassBox x={node.x} y={node.y} width={node.width} label={node.name}
          active={isClassActiveInDiagram(diagramModel, currentClass, node.name)} metrics={metrics} />
        {node.children.map(renderInheritanceNode)}
      </g>
    )
  }

  if (!diagramModel.classes?.length) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-600 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
        No class definitions found in the current editor yet.
      </div>
    )
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      className="mx-auto block max-w-none" role="img" aria-label="Live UML class diagram">
      <defs>
        <marker id="uml-generalization" markerWidth="12" markerHeight="12" refX="10" refY="6"
          orient="auto-start-reverse" markerUnits="strokeWidth">
          <path d="M0,0 L12,6 L0,12 z" fill="#0f172a" stroke="#94a3b8" strokeWidth="1.2" />
        </marker>
      </defs>

      <text x={width / 2} y={metrics.sectionLabelY} textAnchor="middle" fontSize={metrics.sectionLabelFontSize} fill="#94a3b8">
        Composition
      </text>

      {compositionLayout.groups.length > 0 ? (
        compositionLayout.groups.map(group => {
          const ownerWidth = getDiagramNodeWidth(group.owner, metrics)
          const ownerCenterX = (width - group.groupWidth) / 2 + group.x + ownerWidth / 2
          const ownerY = compositionYOffset + group.y
          const busY = compositionYOffset + (group.children[0]?.y ?? 0) - metrics.busOffset
          const childrenStartX = (width - group.groupWidth) / 2

          return (
            <g key={`composition-${group.owner}`}>
              <polygon
                points={`${ownerCenterX},${ownerY + metrics.diamondTopOffset} ${ownerCenterX + metrics.diamondHalfWidth},${ownerY + metrics.diamondCenterOffset} ${ownerCenterX},${ownerY + metrics.diamondBottomOffset} ${ownerCenterX - metrics.diamondHalfWidth},${ownerY + metrics.diamondCenterOffset}`}
                fill="#94a3b8" stroke="#94a3b8" strokeWidth="1.5" />
              <line x1={ownerCenterX} y1={ownerY + metrics.diamondBottomOffset} x2={ownerCenterX} y2={busY} stroke="#94a3b8" strokeWidth="2" />
              {group.children.length > 1 && (
                <line
                  x1={childrenStartX + group.children[0].x + group.children[0].width / 2} y1={busY}
                  x2={childrenStartX + group.children[group.children.length - 1].x + group.children[group.children.length - 1].width / 2}
                  y2={busY} stroke="#475569" strokeWidth="2" />
              )}
              <UmlClassBox x={(width - group.groupWidth) / 2 + group.x} y={ownerY} width={group.width}
                label={group.owner} active={isClassActiveInDiagram(diagramModel, currentClass, group.owner)} metrics={metrics} />
              {group.children.map(child => (
                <g key={`${group.owner}-${child.attr}-${child.target}`}>
                  <line x1={childrenStartX + child.x + child.width / 2} y1={busY}
                    x2={childrenStartX + child.x + child.width / 2} y2={compositionYOffset + child.y} stroke="#475569" strokeWidth="2" />
                  <UmlClassBox x={childrenStartX + child.x} y={compositionYOffset + child.y} width={child.width}
                    label={child.target} active={isClassActiveInDiagram(diagramModel, currentClass, child.target)} metrics={metrics} />
                </g>
              ))}
            </g>
          )
        })
      ) : (
        <text x={width / 2} y={metrics.compositionEmptyY} textAnchor="middle" fontSize={metrics.emptyMessageFontSize} fill="#64748b">
          No composition relationships inferred from the current code.
        </text>
      )}

      <text x={width / 2} y={inheritanceYOffset - metrics.inheritanceLabelOffset}
        textAnchor="middle" fontSize={metrics.sectionLabelFontSize} fill="#94a3b8">
        Inheritance
      </text>

      <g transform={`translate(0 ${inheritanceYOffset})`}>
        {inheritanceLayout.roots.map(renderInheritanceNode)}
      </g>
    </svg>
  )
}
