export type Theme = 'dark' | 'light'
export type RuntimeKey = 'trace-worker' | 'main-thread'
export type DiagramView = 'hierarchy' | 'outline' | 'uml'

export interface PanelVisibility {
  code: boolean
  visualizer: boolean
  diagram: boolean
  insight: boolean
}

export interface InputRequest {
  id: number
  prompt: string
}

export interface SabRef {
  sab: SharedArrayBuffer
  int32: Int32Array
  uint8: Uint8Array
}

// ── Inspector types ────────────────────────────────────────────────────────

export type InspectorNodeKind = 'primitive' | 'sequence' | 'mapping' | 'object' | 'scope' | 'reference'

export interface InspectorNode {
  kind: InspectorNodeKind
  type: string
  summary?: string
  value?: string | number | boolean | null
  items?: Array<{ label: string; value: InspectorNode }>
  length?: number
  truncated?: boolean
  entries?: Array<{ label: string; value: InspectorNode }>
  attrs?: Array<{ label: string; value: InspectorNode }>
}

export interface InspectorScopeData {
  label: string
  node: InspectorNode
}

export interface InspectorData {
  key: string
  label: string
  views: {
    locals?: InspectorScopeData
    globals?: InspectorScopeData
  }
}

export interface SimState {
  Inspector: InspectorData
}

export type InspectorPathSegment = { index: number; label: string }
export type InspectorPath = InspectorPathSegment[]

// ── Code analysis types ────────────────────────────────────────────────────

export interface FunctionDef {
  type: 'def'
  name: string
  className: string
  key: string
  interface: string
  line: number
  indent: number
}

export interface ClassDef {
  type: 'class'
  name: string
  interface: string
  line: number
  indent: number
  methods: FunctionDef[]
}

export type StructureItem = ClassDef | FunctionDef

export interface StructureModel {
  items: StructureItem[]
  definitionByKey: Record<string, FunctionDef>
  orderedDefinitions: FunctionDef[]
}

// ── Diagram types ──────────────────────────────────────────────────────────

export interface CompositionEdge {
  attr: string
  target: string
  rawTargets: string[]
}

export interface ClassRecord {
  name: string
  line: number
  bases: string[]
  primaryBase: string | null
  attributeTargets: Record<string, Set<string>>
  compositionTargets: CompositionEdge[]
}

export interface DiagramModel {
  classes: ClassRecord[]
  classByName: Record<string, ClassRecord>
  childMap: Record<string, string[]>
  inheritanceRoots: string[]
  compositionGroups: Array<{ owner: string; edges: CompositionEdge[] }>
  lineages: Record<string, string[]>
}

export interface FunctionRecord {
  name: string
  line: number
  calls: string[]
}

export interface HierarchyModel {
  functionDefs: Record<string, FunctionRecord>
  orderedNames: string[]
  roots: string[]
}

// ── Outline types ──────────────────────────────────────────────────────────

export type OutlineNodeKind = 'class' | 'method' | 'function' | 'attribute' | 'global' | 'constant' | 'local' | 'parameter'

export interface OutlineNode {
  id: string
  kind: OutlineNodeKind
  name: string
  line: number
  owner?: string
  children: OutlineNode[]
}

export interface OutlineModel {
  roots: OutlineNode[]
  lines: number
}

// ── Worker message types ───────────────────────────────────────────────────

export type WorkerMessage =
  | { type: 'trace'; line: number; func: string; cls: string; state: string }
  | { type: 'print'; text: string }
  | { type: 'error'; error: string }
  | { type: 'done' }
  | { type: 'input'; prompt: string }

// ── Diagram layout types ───────────────────────────────────────────────────

export interface DiagramMetrics {
  fontSize: number
  scale: number
  charWidth: number
  labelPadding: number
  nodeHeight: number
  nodeGap: number
  levelGap?: number
  rootGap: number
  busOffset: number
  minNodeWidth: number
  maxNodeWidth?: number
}

export interface LayoutNode {
  name: string
  x: number
  y: number
  width: number
  children: LayoutNode[]
}
