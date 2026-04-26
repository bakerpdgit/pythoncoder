import { DIAGRAM_FONT_DEFAULT, DIAGRAM_FONT_MIN, DIAGRAM_FONT_MAX } from '../../constants'
import type { DiagramMetrics, LayoutNode, DiagramModel, HierarchyModel } from '../../types'

export const clampDiagramFontSize = (value: number): number =>
  Math.min(DIAGRAM_FONT_MAX, Math.max(DIAGRAM_FONT_MIN, value))

export const getHierarchyMetrics = (fontSize: number): DiagramMetrics & { levelGap: number } => {
  const safeFontSize = clampDiagramFontSize(fontSize)
  const scale = safeFontSize / DIAGRAM_FONT_DEFAULT
  return {
    fontSize: safeFontSize,
    scale,
    charWidth: 7 * scale,
    labelPadding: 6 * scale,
    nodeHeight: Math.max(28, Math.round(34 * scale)),
    nodeGap: Math.max(8, Math.round(12 * scale)),
    levelGap: Math.max(64, Math.round(80 * scale)),
    rootGap: Math.max(12, Math.round(18 * scale)),
    busOffset: Math.max(16, Math.round(20 * scale)),
    minNodeWidth: Math.max(36, Math.round(36 * scale)),
  }
}

export const getUmlMetrics = (fontSize: number) => {
  const safeFontSize = clampDiagramFontSize(fontSize)
  const scale = safeFontSize / DIAGRAM_FONT_DEFAULT
  return {
    fontSize: safeFontSize,
    scale,
    charWidth: 7 * scale,
    labelPadding: 34 * scale,
    minNodeWidth: Math.max(76, Math.round(92 * scale)),
    maxNodeWidth: Math.max(140, Math.round(170 * scale)),
    nodeHeight: Math.max(28, Math.round(34 * scale)),
    groupGap: Math.max(24, Math.round(36 * scale)),
    nodeGap: Math.max(8, Math.round(12 * scale)),
    sectionGap: Math.max(32, Math.round(48 * scale)),
    compositionChildOffset: Math.max(72, Math.round(88 * scale)),
    compositionGroupHeight: Math.max(118, Math.round(144 * scale)),
    compositionMinHeight: Math.max(160, Math.round(180 * scale)),
    inheritanceLevelGap: Math.max(72, Math.round(96 * scale)),
    rootGap: Math.max(12, Math.round(18 * scale)),
    busOffset: Math.max(22, Math.round(28 * scale)),
    topPadding: Math.max(24, Math.round(28 * scale)),
    footerPadding: Math.max(36, Math.round(42 * scale)),
    sectionLabelFontSize: Math.max(10, Math.round(11 * scale)),
    emptyMessageFontSize: Math.max(11, Math.round(12 * scale)),
    sectionLabelY: Math.max(16, Math.round(16 * scale)),
    compositionEmptyY: Math.max(58, Math.round(58 * scale)),
    inheritanceLabelOffset: Math.max(18, Math.round(18 * scale)),
    diamondHalfWidth: Math.max(6, Math.round(8 * scale)),
    diamondTopOffset: Math.max(34, Math.round(42 * scale)),
    diamondCenterOffset: Math.max(42, Math.round(50 * scale)),
    diamondBottomOffset: Math.max(50, Math.round(58 * scale)),
  }
}

export const getDiagramNodeWidth = (label: string, metrics: DiagramMetrics): number =>
  Math.max(
    metrics.minNodeWidth,
    metrics.maxNodeWidth
      ? Math.min(metrics.maxNodeWidth, Math.round(label.length * metrics.charWidth + metrics.labelPadding))
      : Math.round(label.length * metrics.charWidth + metrics.labelPadding),
  )

// ── Hierarchy layout ───────────────────────────────────────────────────────

interface HierarchyTreeNode {
  name: string
  children: HierarchyTreeNode[]
  nodeWidth?: number
  subtreeWidth?: number
  depth?: number
  childLayouts?: HierarchyTreeNode[]
}

export const buildCallHierarchyLayout = (hierarchyModel: HierarchyModel, fontSize: number) => {
  const { functionDefs, orderedNames, roots } = hierarchyModel
  const metrics = getHierarchyMetrics(fontSize)

  const buildTree = (name: string, visited = new Set<string>()): HierarchyTreeNode => {
    if (visited.has(name)) return { name, children: [] }
    const nextVisited = new Set(visited)
    nextVisited.add(name)
    const fn = functionDefs[name]
    if (!fn) return { name, children: [] }
    return { name, children: fn.calls.filter(c => functionDefs[c]).map(c => buildTree(c, nextVisited)) }
  }

  const measureTree = (node: HierarchyTreeNode): HierarchyTreeNode & { nodeWidth: number; subtreeWidth: number; depth: number; childLayouts: HierarchyTreeNode[] } => {
    const nodeWidth = getDiagramNodeWidth(node.name, metrics)
    const childLayouts = node.children.map(measureTree)
    const childWidth = childLayouts.reduce((sum, child) => sum + (child.subtreeWidth ?? 0), 0) + Math.max(0, childLayouts.length - 1) * metrics.nodeGap
    return {
      ...node,
      nodeWidth,
      subtreeWidth: Math.max(nodeWidth, childWidth),
      depth: childLayouts.length > 0 ? 1 + Math.max(...childLayouts.map(c => c.depth ?? 1)) : 1,
      childLayouts,
    }
  }

  const placeTree = (layout: ReturnType<typeof measureTree>, startX: number, startY: number): LayoutNode => {
    const nodeX = startX + (layout.subtreeWidth - layout.nodeWidth) / 2
    const totalChildWidth = layout.childLayouts.reduce((sum, c) => sum + (c.subtreeWidth ?? 0), 0) + Math.max(0, layout.childLayouts.length - 1) * metrics.nodeGap
    let childCursorX = startX + (layout.subtreeWidth - totalChildWidth) / 2
    const children = layout.childLayouts.map(childLayout => {
      const child = placeTree(childLayout as ReturnType<typeof measureTree>, childCursorX, startY + metrics.levelGap)
      childCursorX += (childLayout.subtreeWidth ?? 0) + metrics.nodeGap
      return child
    })
    return { name: layout.name, x: nodeX, y: startY, width: layout.nodeWidth, children }
  }

  const treesToLayout = roots.length > 0 ? roots : orderedNames.slice(0, 1)
  if (treesToLayout.length === 0) return { width: 0, height: 54, roots: [], metrics }

  const measuredRoots = treesToLayout.map(name => measureTree(buildTree(name)))
  const forestWidth = measuredRoots.reduce((sum, r) => sum + r.subtreeWidth, 0) + Math.max(0, measuredRoots.length - 1) * metrics.rootGap
  const width = Math.max(forestWidth, 1)
  let cursorX = (width - forestWidth) / 2
  const placedRoots = measuredRoots.map(rootLayout => {
    const placed = placeTree(rootLayout, cursorX, 0)
    cursorX += rootLayout.subtreeWidth + metrics.rootGap
    return placed
  })

  const maxDepth = Math.max(...measuredRoots.map(r => r.depth))
  return { width, height: Math.max(0, maxDepth - 1) * metrics.levelGap + metrics.nodeHeight, roots: placedRoots, metrics }
}

// ── UML layout ─────────────────────────────────────────────────────────────

export const buildCompositionLayout = (diagramModel: DiagramModel, metrics: ReturnType<typeof getUmlMetrics>) => {
  const groups = diagramModel.compositionGroups || []
  if (groups.length === 0) return { width: 0, height: 54, groups: [] }

  let cursorY = 0
  let maxWidth = 0

  const laidOutGroups = groups.map(group => {
    const ownerWidth = getDiagramNodeWidth(group.owner, metrics)
    const childWidths = group.edges.map(edge => getDiagramNodeWidth(edge.target, metrics))
    const childrenRowWidth = childWidths.reduce((sum, w) => sum + w, 0) + Math.max(0, childWidths.length - 1) * metrics.nodeGap
    const groupWidth = Math.max(ownerWidth, childrenRowWidth)
    const childY = cursorY + metrics.compositionChildOffset
    const groupHeight = metrics.compositionGroupHeight
    const ownerX = (groupWidth - ownerWidth) / 2
    const childStartX = (groupWidth - childrenRowWidth) / 2
    let childCursorX = childStartX

    const children = group.edges.map((edge, index) => {
      const childWidth = childWidths[index]
      const child = { ...edge, x: childCursorX, y: childY, width: childWidth }
      childCursorX += childWidth + metrics.nodeGap
      return child
    })

    cursorY += groupHeight + metrics.groupGap
    maxWidth = Math.max(maxWidth, groupWidth)

    return { owner: group.owner, x: ownerX, y: cursorY - groupHeight - metrics.groupGap, width: ownerWidth, children, groupWidth }
  })

  return {
    width: maxWidth,
    height: Math.max(laidOutGroups.length * metrics.compositionMinHeight, cursorY - metrics.groupGap),
    groups: laidOutGroups,
  }
}

export const buildInheritanceLayout = (diagramModel: DiagramModel, metrics: ReturnType<typeof getUmlMetrics>) => {
  interface TreeNode { name: string; children: TreeNode[]; nodeWidth?: number; subtreeWidth?: number; depth?: number; childLayouts?: TreeNode[] }

  const buildTree = (name: string): TreeNode => ({
    name,
    children: (diagramModel.childMap?.[name] || []).map(buildTree),
  })

  const measureTree = (node: TreeNode): TreeNode & { nodeWidth: number; subtreeWidth: number; depth: number; childLayouts: TreeNode[] } => {
    const nodeWidth = getDiagramNodeWidth(node.name, metrics)
    const childLayouts = node.children.map(measureTree)
    const childWidth = childLayouts.reduce((sum, c) => sum + (c.subtreeWidth ?? 0), 0) + Math.max(0, childLayouts.length - 1) * metrics.nodeGap
    return {
      ...node,
      nodeWidth,
      subtreeWidth: Math.max(nodeWidth, childWidth),
      depth: childLayouts.length > 0 ? 1 + Math.max(...childLayouts.map(c => c.depth ?? 1)) : 1,
      childLayouts,
    }
  }

  const placeTree = (layout: ReturnType<typeof measureTree>, startX: number, startY: number): LayoutNode => {
    const nodeX = startX + (layout.subtreeWidth - layout.nodeWidth) / 2
    const totalChildWidth = layout.childLayouts.reduce((sum, c) => sum + (c.subtreeWidth ?? 0), 0) + Math.max(0, layout.childLayouts.length - 1) * metrics.nodeGap
    let childCursorX = startX + (layout.subtreeWidth - totalChildWidth) / 2
    const children = layout.childLayouts.map(childLayout => {
      const child = placeTree(childLayout as ReturnType<typeof measureTree>, childCursorX, startY + metrics.inheritanceLevelGap)
      childCursorX += (childLayout.subtreeWidth ?? 0) + metrics.nodeGap
      return child
    })
    return { name: layout.name, x: nodeX, y: startY, width: layout.nodeWidth, children }
  }

  const measuredRoots = (diagramModel.inheritanceRoots || []).map(buildTree).map(measureTree)
  if (measuredRoots.length === 0) return { width: 0, height: 54, roots: [] }

  const forestWidth = measuredRoots.reduce((sum, r) => sum + r.subtreeWidth, 0) + Math.max(0, measuredRoots.length - 1) * metrics.rootGap
  const width = Math.max(forestWidth, 1)
  let cursorX = (width - forestWidth) / 2
  const roots = measuredRoots.map(rootLayout => {
    const placed = placeTree(rootLayout, cursorX, 0)
    cursorX += rootLayout.subtreeWidth + metrics.rootGap
    return placed
  })

  return {
    width,
    height: Math.max(0, Math.max(...measuredRoots.map(r => r.depth)) - 1) * metrics.inheritanceLevelGap + metrics.nodeHeight,
    roots,
  }
}
