export type Theme = 'dark' | 'light'
export type RuntimeKey = 'trace-worker' | 'main-thread'
export type DiagramView = 'hierarchy' | 'outline' | 'uml' | 'turtle' | 'notes' | 'inputs'
export type TurtleMode = 'pyo-js-turtle' | 'basthon-svg'
export type InputMode = 'inline-console' | 'input-bar' | 'popup-dialog'
export type ViewMode = 'minimal' | 'developer'

/** An editor breakpoint. `condition` is a Python boolean expression; empty = unconditional. */
export interface Breakpoint {
  enabled: boolean
  condition: string
}

export interface AppSettings {
  turtleMode: TurtleMode
  inputMode: InputMode
  useFixedInputs: boolean
  inlineTraceValues: boolean
}

export interface LayoutPrefs {
  viewMode: ViewMode
  visiblePanels: PanelVisibility
  leftSidebarCollapsed: boolean
}

export interface NamedLayout {
  name: string
  visiblePanels: PanelVisibility
  leftWidth: number
  fsSidebarWidth: number
  leftSidebarSplit: number
  inspectorSplit: number
  rightColSplit: number
  bookPanelWidth: number
  viewMode?: ViewMode
  leftSidebarCollapsed?: boolean
  centerVerticalSplit?: number
  structureColWidth?: number
}

export interface PanelVisibility {
  code: boolean
  visualizer: boolean
  diagram: boolean
  notes: boolean
  output: boolean
  filesystem: boolean
  teacherTools: boolean
}

// ── Virtual File System types ──────────────────────────────────────────────

export interface VFSFilesystem {
  id: string
  name: string
  createdAt: number
}

export interface VFSEntry {
  id: string
  fsId: string
  parentPath: string
  path: string
  name: string
  type: 'file' | 'folder'
  content?: ArrayBuffer
  mimeType?: string
  size?: number
  modifiedAt: number
}

// A filesystem mutation to mirror onto a connected local OS folder.
export type LocalFolderSyncOp =
  | { kind: 'write'; path: string; content: ArrayBuffer }
  | { kind: 'mkdir'; path: string }
  | { kind: 'delete'; path: string }
  | { kind: 'rename'; path: string; newName: string }

export interface VFSFile {
  path: string
  content: ArrayBuffer
  mimeType: string
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
  | { type: 'trace'; line: number; func: string; cls: string; state: string; turtleSvg?: string; watchValues?: Record<string, InspectorNode> }
  | { type: 'print'; text: string }
  | { type: 'error'; error: string; files?: Array<{ path: string; content: ArrayBuffer; mimeType: string }> }
  | { type: 'done'; files?: Array<{ path: string; content: ArrayBuffer; mimeType: string }> }
  | { type: 'input'; prompt: string }
  | { type: 'turtle_update'; svg: string }

// ── Book / learning types ──────────────────────────────────────────────────

export interface BookRef {
  id: string
  name: string
  bookLink: string
}

export interface BookAdditionalFile {
  filename: string
  visible: boolean
}

export interface BookTestOutputReq {
  pattern?: string
  typ?: string        // '+' | '-' | 'c+' | 'c-' | 'f+' | 'f-' | 's+' | 's-' | 't'
  ignore?: string     // flags: 'w'=whitespace 'c'=case 'p'=punctuation
  count?: number | string
  statement?: string
  filename?: string
}

export interface BookTestCase {
  in?: string | Array<string | number>
  out?: string | BookTestOutputReq[]
  reveal?: boolean
}

/** Solution reference (pythonsponge convention). `file` is a relative .py path. */
export interface BookSolution {
  file: string
  showSolution?: number | boolean
}

export interface BookChallenge {
  id: string
  name: string
  guide?: string
  py?: string
  isExample?: string | boolean
  tests?: BookTestCase[]
  additionalFiles?: BookAdditionalFile[]
  typ?: string
  sol?: BookSolution
}

// ── Test runner result types ───────────────────────────────────────────────

export interface TesterRunOutput {
  output: string
  error: string | null
  statementResults: Record<string, string>
  fileContents: Record<string, string | null>
  turtleSvg?: string
  solutionTurtleSvgs?: Record<string, string>
}

export interface TestReqResult {
  passed: boolean
  typ: string
  pattern: string
  ignore: string
  count: number
  statement?: string
  filename?: string
}

export interface TestCaseResult {
  caseIndex: number
  passed: boolean
  reveal: boolean
  inputs: Array<string | number>
  out: string | BookTestOutputReq[]
  output?: string
  error?: string
  reqResults: TestReqResult[]
}

export interface OverallTestResult {
  allPassed: boolean
  results: TestCaseResult[]
}

export type BookChild = BookRef | BookChallenge

export interface BookManifest {
  id?: string
  name?: string
  children: BookChild[]
}

export interface BreadcrumbEntry {
  name: string
  bookUrl: string
}

export interface BookNavState {
  rootUrl: string
  currentBookUrl: string
  breadcrumb: BreadcrumbEntry[]
  activeChallengeId: string | null
}

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
