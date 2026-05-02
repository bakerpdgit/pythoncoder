import { useState, useEffect, useRef, useMemo, useDeferredValue, startTransition } from 'react'
import TracerWorker from './workers/tracer.worker.ts?worker'
import Editor, { type Monaco, loader } from '@monaco-editor/react'

// In dev, use the locally-installed monaco-editor instead of CDN to avoid the
// 404 source map error (jsdelivr serves the bundle with a sourceMappingURL that
// points to a path that doesn't exist on that CDN).
if (import.meta.env.DEV) {
  import('monaco-editor').then(m => loader.config({ monaco: m }))
}
import type { editor as MonacoEditor } from 'monaco-editor'
import {
  buildPythonStructureModel, analyzePythonClasses, analyzePythonFunctions,
  analyzePythonOutline, cleanCodeText, codeUsesPygame, codeUsesTurtle, getExpandableOutlineIds,
} from './utils/codeAnalysis'
import { getStoredTheme, getStoredNoteOverrides, persistNoteOverrides, getStoredSettings, persistSettings, getStoredBookNavState, persistBookNavState, getStoredFixedInputs, persistFixedInputs, getStoredEditorFontSize, persistEditorFontSize, getStoredConsoleFontSize, persistConsoleFontSize, getStoredWatches, persistWatches, getStoredNamedLayouts, persistNamedLayouts } from './utils/storage'
import { triggerDownload, getBaseFileStem } from './utils/download'
import { buildCommentExport, buildDocstringExport, replaceExistingDocstring, getDefinitionNote, getDefaultDefinitionNote, sanitizeNoteText } from './utils/export'
import { loadMainThreadPyodide, resetMainThreadPyodide, PYGAME_MAIN_THREAD_BOOTSTRAP, TURTLE_CANVAS_BOOTSTRAP, TURTLE_SVG_BOOTSTRAP, SVG_TURTLE_WORKER_SETUP } from './utils/mainThread'
import { fetchBookManifest, getOrCreateChallengeFs, getHiddenPathsForFs, BOOK_FS_PREFIX, BOOK_SRC_PREFIX } from './utils/bookLoader'
import {
  ensureDefaultFilesystem, getAllFiles, syncFilesFromPyodide, writeFile,
  isTextMime, guessMimeType, mountFilesToPyodide, readFilesFromPyodide,
  getEntryByPath, cleanFilesFromPyodide, ensureFilesystemFromUrl,
  createFilesystem, deleteFilesystem, listFilesystems, importFileMapToFs,
} from './utils/virtualFS'
import { FileSystemPanel } from './components/FileSystemPanel'
import { BookPanel } from './components/BookPanel'
import { SaveFileDialog } from './components/dialogs/SaveFileDialog'
import { getExplanation, getDefinitionKey } from './data/explanations'
import { ThemeToggleButton } from './components/ui/ThemeToggleButton'
import { RuntimeSettingsMenu } from './components/ui/RuntimeSettingsMenu'
import { PanelVisibilityMenu } from './components/ui/PanelVisibilityMenu'
import { DiagramFontControls } from './components/ui/DiagramFontControls'
import { IconButton } from './components/ui/IconButton'
import { SettingsDialog } from './components/ui/SettingsDialog'
import { HierarchyChart } from './components/diagrams/HierarchyChart'
import { UmlDiagram } from './components/diagrams/UmlDiagram'
import { OutlinePanel } from './components/diagrams/OutlinePanel'
import { TurtleScrubber } from './components/TurtleScrubber'
import { InspectorPane } from './components/InspectorPane'
import { ConsoleTerminal, type ConsoleTerminalHandle } from './components/ConsoleTerminal'
import { clampDiagramFontSize } from './components/diagrams/diagramLayout'
import {
  TRACE_CMD_STEP_INTO, TRACE_CMD_STEP_OVER, TRACE_CMD_STEP_OUT_BLOCK, TRACE_CMD_CONTINUE,
  DEFAULT_CODE_FILENAME, DIAGRAM_FONT_DEFAULT, DIAGRAM_FONT_MIN, DIAGRAM_FONT_MAX,
  PANEL_OPTIONS,
} from './constants'
import type {
  Theme, RuntimeKey, PanelVisibility, InputRequest, SabRef, SimState, InspectorPath,
  StructureModel, DiagramModel, HierarchyModel, OutlineModel, DiagramView, VFSEntry,
  AppSettings, BookNavState, BookChallenge, NamedLayout,
} from './types'

async function readDirectoryToMap(handle: FileSystemDirectoryHandle, prefix = ''): Promise<Map<string, ArrayBuffer>> {
  const map = new Map<string, ArrayBuffer>()
  for await (const [name, entry] of handle) {
    const relPath = prefix ? `${prefix}/${name}` : name
    if (entry.kind === 'directory') {
      const sub = await readDirectoryToMap(entry as FileSystemDirectoryHandle, relPath)
      for (const [k, v] of sub) map.set(k, v)
    } else {
      const file = await (entry as FileSystemFileHandle).getFile()
      map.set(relPath, await file.arrayBuffer())
    }
  }
  return map
}

async function writeFileToFolderHandle(root: FileSystemDirectoryHandle, vfsPath: string, content: ArrayBuffer): Promise<void> {
  const parts = vfsPath.replace(/^\//, '').split('/')
  const filename = parts.pop()!
  let dir = root
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true })
  const fh = await dir.getFileHandle(filename, { create: true })
  const w = await fh.createWritable()
  await w.write(content)
  await w.close()
}

const MONACO_DARK_THEME: MonacoEditor.IStandaloneThemeData = {
  base: 'vs-dark', inherit: true,
  rules: [
    { token: 'comment', foreground: '64748b' }, { token: 'keyword', foreground: '7dd3fc' },
    { token: 'string', foreground: '86efac' }, { token: 'number', foreground: 'fbbf24' },
  ],
  colors: {
    'editor.background': '#0f172a', 'editorLineNumber.foreground': '#475569',
    'editorLineNumber.activeForeground': '#cbd5e1', 'editorCursor.foreground': '#f8fafc',
    'editorIndentGuide.background1': '#1e293b', 'editorIndentGuide.activeBackground1': '#334155',
    'editor.selectionBackground': '#065f46', 'editor.inactiveSelectionBackground': '#064e3b',
    'editorGutter.background': '#0f172a', 'editorOverviewRuler.border': '#0f172a',
  },
}

const MONACO_LIGHT_THEME: MonacoEditor.IStandaloneThemeData = {
  base: 'vs', inherit: true,
  rules: [
    { token: 'comment', foreground: '64748b' }, { token: 'keyword', foreground: '047857' },
    { token: 'string', foreground: '15803d' }, { token: 'number', foreground: 'b45309' },
  ],
  colors: {
    'editor.background': '#f8fbff', 'editorLineNumber.foreground': '#94a3b8',
    'editorLineNumber.activeForeground': '#334155', 'editorCursor.foreground': '#0f172a',
    'editorIndentGuide.background1': '#dbe4ee', 'editorIndentGuide.activeBackground1': '#94a3b8',
    'editor.selectionBackground': '#bbf7d0', 'editor.inactiveSelectionBackground': '#dcfce7',
    'editorGutter.background': '#f8fbff', 'editorOverviewRuler.border': '#f8fbff',
  },
}

const PYTHON_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
  'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
  'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise',
  'return', 'try', 'while', 'with', 'yield',
])

export default function App() {
  const [codeText, setCodeText] = useState('')
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme())
  const [noteOverrides, setNoteOverrides] = useState<Record<string, string>>(() => getStoredNoteOverrides())
  const [codeStatus, setCodeStatus] = useState('No code loaded. Use Load or start typing.')
  const [codeFileName, setCodeFileName] = useState(DEFAULT_CODE_FILENAME)
  const [isEditorReady, setIsEditorReady] = useState(false)
  const [structureModel, setStructureModel] = useState<StructureModel>(() => buildPythonStructureModel(''))
  const [diagramModel, setDiagramModel] = useState<DiagramModel>(() => analyzePythonClasses(''))
  const [hierarchyModel, setHierarchyModel] = useState<HierarchyModel>(() => analyzePythonFunctions(''))
  const [outlineModel, setOutlineModel] = useState<OutlineModel>(() => analyzePythonOutline(''))
  const [isInsightEditing, setIsInsightEditing] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [currentLine, setCurrentLine] = useState(-1)
  const [currentFunc, setCurrentFunc] = useState('')
  const [currentClass, setCurrentClass] = useState('')
  const [simState, setSimState] = useState<SimState | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [hasSab, setHasSab] = useState(false)
  const [isCrossOriginIsolated, setIsCrossOriginIsolated] = useState(false)
  const [inputRequest, setInputRequest] = useState<InputRequest | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [outputLog, setOutputLog] = useState('')
  const [activeRuntime, setActiveRuntime] = useState<RuntimeKey | ''>('')
  const [mainThreadStatus, setMainThreadStatus] = useState('Main-thread runtime is ready.')
  const [isPygameRunActive, setIsPygameRunActive] = useState(false)
  const [isTurtleCanvasRunActive, setIsTurtleCanvasRunActive] = useState(false)
  const [pendingRestore, setPendingRestore] = useState<(() => void) | null>(null)
  const [turtleSvg, setTurtleSvg] = useState('')
  const [turtleSvgHistory, setTurtleSvgHistory] = useState<string[]>([])
  const [turtleScrubStep, setTurtleScrubStep] = useState(0)
  const [turtleScrubPlaying, setTurtleScrubPlaying] = useState(false)
  const [turtleScrubSpeed, setTurtleScrubSpeed] = useState(400)
  const [isConsolePresentationMode, setIsConsolePresentationMode] = useState(false)
  const [runtimePreference, setRuntimePreference] = useState<RuntimeKey>('trace-worker')
  const [appSettings, setAppSettings] = useState<AppSettings>(() => getStoredSettings())
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [visiblePanels, setVisiblePanels] = useState<PanelVisibility>({ code: true, visualizer: true, diagram: true, notes: true, output: true, filesystem: true })
  // notes is now a tab inside Structure, not a separate panel — kept in type for compat
  const [activeFilesystemId, setActiveFilesystemId] = useState<string>('default')
  const [currentWorkingDir, setCurrentWorkingDir] = useState<string>('/')
  const [openFilePath, setOpenFilePath] = useState<string | null>(null)
  const [bookNavState, setBookNavState] = useState<BookNavState | null>(null)
  const [challengeHiddenPaths, setChallengeHiddenPaths] = useState<string[]>([])
  const [vfsReloadTrigger, setVfsReloadTrigger] = useState(0)
  const [isUnsaved, setIsUnsaved] = useState(false)
  const [pendingCodeLoad, setPendingCodeLoad] = useState<{ content: string; name: string; rawBuffer: ArrayBuffer; mimeType: string } | null>(null)
  const [showCodeSaveDialog, setShowCodeSaveDialog] = useState(false)
  const [diagramFontSize, setDiagramFontSize] = useState(DIAGRAM_FONT_DEFAULT)
  const [isPanelMenuOpen, setIsPanelMenuOpen] = useState(false)
  const [isRuntimeMenuOpen, setIsRuntimeMenuOpen] = useState(false)
  const [isQuickSettingsOpen, setIsQuickSettingsOpen] = useState(false)
  const [fixedInputsText, setFixedInputsText] = useState<string>('')
  const [popupInputValue, setPopupInputValue] = useState('')
  const [diagramView, setDiagramView] = useState<DiagramView>('outline')
  const [outlineExpandedIds, setOutlineExpandedIds] = useState<Set<string>>(() => new Set())
  const [showInterpreterVars] = useState(false)
  const [globalsInspectorPath, setGlobalsInspectorPath] = useState<InspectorPath>([])
  const [localsInspectorPath, setLocalsInspectorPath] = useState<InspectorPath>([])
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set())
  const breakpointsRef = useRef<Set<number>>(new Set())
  const [runModeChoice, setRunModeChoice] = useState<'trace' | 'run' | 'break'>('trace')
  const [isRunDropdownOpen, setIsRunDropdownOpen] = useState(false)
  const [editorFontSize, setEditorFontSize] = useState(() => getStoredEditorFontSize())
  const [consoleFontSize, setConsoleFontSize] = useState(() => getStoredConsoleFontSize())
  const [editorCursorLine, setEditorCursorLine] = useState(1)
  const [leftWidth, setLeftWidth] = useState(55)         // % of center for code vs right col
  const [fsSidebarWidth, setFsSidebarWidth] = useState(224)  // px width of left sidebar
  const [leftSidebarSplit, setLeftSidebarSplit] = useState(55) // % of left sidebar for FS (top)
  const [inspectorSplit, setInspectorSplit] = useState(50)    // % of inspector for globals (top)
  const [rightColSplit, setRightColSplit] = useState(42)      // % of right col for Console (top)
  const [bookPanelWidth, setBookPanelWidth] = useState(360)   // px width of book panel
  const [watches, setWatches] = useState<string[]>(() => getStoredWatches())
  const [inspectorCollapsed, setInspectorCollapsed] = useState({ globals: false, locals: false, watches: false })
  const [savedLayouts, setSavedLayouts] = useState<NamedLayout[]>(() => getStoredNamedLayouts())

  const workerRef = useRef<Worker | null>(null)
  const sabRef = useRef<SabRef | null>(null)
  const consoleTermRef = useRef<ConsoleTerminalHandle | null>(null)
  const inputModeRef = useRef(appSettings.inputMode)
  const runDropdownRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const editorDecorationsRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
  const breakpointDecorationsRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
  const traceValueDecorationsRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
  const prevTraceLineRef = useRef<number>(-1)
  const applyingEditorValueRef = useRef(false)
  const outputRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const inlineInputRef = useRef<HTMLInputElement | null>(null)
  const popupDialogRef = useRef<HTMLDialogElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const panelMenuRef = useRef<HTMLDivElement | null>(null)
  const runtimeMenuRef = useRef<HTMLDivElement | null>(null)
  const quickSettingsRef = useRef<HTMLDivElement | null>(null)
  const fixedInputsQueueRef = useRef<string[]>([])
  const mainThreadCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const mainThreadCanvasSnapshotRef = useRef<HTMLCanvasElement | null>(null)
  const mainThreadCanvasWatcherRef = useRef(0)
  const mainThreadStopRequestedRef = useRef<boolean>(false)
  const pygameLayoutSnapshotRef = useRef<{ visiblePanels: PanelVisibility; leftWidth: number } | null>(null)
  const consoleLayoutSnapshotRef = useRef<{ visiblePanels: PanelVisibility; leftWidth: number } | null>(null)
  const turtleLayoutSnapshotRef = useRef<{ visiblePanels: PanelVisibility; leftWidth: number } | null>(null)
  const svgTurtleLayoutSnapshotRef = useRef<{ visiblePanels: PanelVisibility; leftWidth: number } | null>(null)
  const mainThreadRunIdRef = useRef(0)
  const mainThreadAbandonedRef = useRef(false)
  const noteDraftRef = useRef('')
  const isInsightEditingRef = useRef(false)
  const activeInsightKeyRef = useRef('')
  const savedCodeRef = useRef('')
  const resizeDragRef = useRef<{ type: string; startX: number; startY: number; startVal: number } | null>(null)
  const localFolderHandleRef = useRef<FileSystemDirectoryHandle | null>(null)
  const localFolderFsIdRef = useRef<string | null>(null)
  const mainContainerRef = useRef<HTMLDivElement | null>(null)
  const centerRef = useRef<HTMLDivElement | null>(null)
  const leftSidebarRef = useRef<HTMLDivElement | null>(null)
  const rightColRef = useRef<HTMLDivElement | null>(null)
  const inspectorRef = useRef<HTMLDivElement | null>(null)
  const mainThreadMountedPathsRef = useRef<string[]>([])
  const workerRunModeRef = useRef<'trace' | 'run' | 'break'>('trace')
  const turtleSvgHistoryRef = useRef<string[]>([])
  const turtleScrubLockedRef = useRef(false)

  const deferredCodeText = useDeferredValue(codeText)
  const hasCode = codeText.trim().length > 0

  // ── Derived state ────────────────────────────────────────────────────────

  const isPygameLocked = codeUsesPygame(codeText)
  const isTurtleLocked = codeUsesTurtle(codeText) && appSettings.turtleMode === 'pyo-js-turtle'
  const selectedRuntime: RuntimeKey = (isPygameLocked || isTurtleLocked) ? 'main-thread' : runtimePreference
  const resolvedRuntime = isRunning ? activeRuntime : selectedRuntime
  const isMainThreadRuntime = resolvedRuntime === 'main-thread'
  const isPygameCanvasRuntime = isPygameRunActive || (isMainThreadRuntime && isPygameLocked)
  const inspectorRoot = simState?.Inspector || null
  const inspectorRootKey = inspectorRoot?.key || null
  const inspectorViews = inspectorRoot?.views || {}
  const globalsInspectorRoot = inspectorViews.globals ?? null
  const localsInspectorRoot = inspectorViews.locals ?? null
  const GLOBAL_NOTE_KEY = '__global__'

  // During a trace, key is set by the traced function; in editing mode use cursor position
  const traceInsightKey = currentFunc ? getDefinitionKey(currentFunc, currentClass) : ''
  const cursorInsightKey = useMemo(() => {
    if (isRunning) return ''
    const defs = [...structureModel.orderedDefinitions].sort((a, b) => a.line - b.line)
    let matched = ''
    for (const def of defs) {
      if (def.line <= editorCursorLine) matched = def.key
    }
    return matched
  }, [isRunning, editorCursorLine, structureModel.orderedDefinitions])
  const activeInsightKey = isRunning ? traceInsightKey : cursorInsightKey
  const effectiveNoteKey = activeInsightKey || GLOBAL_NOTE_KEY

  const activeInsightDefinition = structureModel.definitionByKey[activeInsightKey] || null
  const activeInsightText = activeInsightDefinition
    ? getDefinitionNote(activeInsightDefinition, noteOverrides)
    : effectiveNoteKey === GLOBAL_NOTE_KEY
      ? (noteOverrides[GLOBAL_NOTE_KEY] || '')
      : isRunning && currentFunc
        ? getExplanation(currentFunc, currentClass)
        : ''
  const activeInsightHeading = activeInsightDefinition?.interface
    || (effectiveNoteKey === GLOBAL_NOTE_KEY
      ? 'Module / Global Scope'
      : currentClass ? `${currentClass}.${currentFunc}()` : currentFunc ? `${currentFunc}()` : 'Global Scope')
  const hasCustomInsightNote = effectiveNoteKey === GLOBAL_NOTE_KEY
    ? Object.prototype.hasOwnProperty.call(noteOverrides, GLOBAL_NOTE_KEY)
    : !!activeInsightDefinition && Object.prototype.hasOwnProperty.call(noteOverrides, activeInsightDefinition.key)
  const canExportNotes = structureModel.orderedDefinitions.length > 0 && hasCode
  const displayedTurtleSvg = turtleSvgHistory.length > 0 && turtleScrubStep >= 0 && turtleScrubStep < turtleSvgHistory.length
    ? turtleSvgHistory[turtleScrubStep]
    : turtleSvg
  const hasLeftSidebar = visiblePanels.filesystem || visiblePanels.visualizer
  const hasInspectorAndFs = visiblePanels.filesystem && visiblePanels.visualizer
  const hasRightCol = visiblePanels.output || visiblePanels.diagram
  const hasConsoleAndStructure = visiblePanels.output && visiblePanels.diagram
  const hasBookPanel = !!bookNavState

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    setIsCrossOriginIsolated(window.crossOriginIsolated === true)
    setHasSab(typeof SharedArrayBuffer !== 'undefined' && window.crossOriginIsolated === true)
    void (async () => {
      await ensureDefaultFilesystem()
      setVfsReloadTrigger(t => t + 1)

      const fsParam = new URLSearchParams(window.location.search).get('filesystem')
      if (fsParam) {
        const url = decodeURIComponent(fsParam)
        try {
          const fsId = await ensureFilesystemFromUrl(url)
          setActiveFilesystemId(fsId)
          setCurrentWorkingDir('/')
          setVfsReloadTrigger(t => t + 1)
          return
        } catch { /* fall through to default */ }
      }

      // Restore book challenge filesystem if one was active
      const savedNav = getStoredBookNavState()
      if (savedNav?.activeChallengeId) {
        const { listFilesystems: lfs, listChildren: lc } = await import('./utils/virtualFS')
        const fsList = await lfs()
        const idPrefix = BOOK_FS_PREFIX + savedNav.activeChallengeId
        const challengeFs = fsList.find(f => f.name === idPrefix || f.name.startsWith(idPrefix + ':'))
        if (challengeFs) {
          setActiveFilesystemId(challengeFs.id)
          setChallengeHiddenPaths(getHiddenPathsForFs(challengeFs.id))
          setBookNavState(savedNav)
          const children = await lc(challengeFs.id, '/')
          const pyFile = children.find(e => e.type === 'file' && e.name.endsWith('.py'))
          if (pyFile?.content) {
            const text = new TextDecoder().decode(pyFile.content)
            loadCodeText(text, pyFile.name, pyFile.path)
          }
          setVfsReloadTrigger(t => t + 1)
          return
        }
      }

      // No challenge FS found — clear any stale book nav state and load default
      persistBookNavState(null)

      const entry = await getEntryByPath('default', '/main.py')
      if (entry?.content) {
        const text = new TextDecoder().decode(entry.content)
        loadCodeText(text, 'main.py', '/main.py')
      }
    })()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('aqa_prelim_site_theme', theme) } catch { /* ignore */ }
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(theme === 'light' ? 'as-tracer-light' : 'as-tracer-dark')
    }
  }, [theme])

  useEffect(() => {
    if (!editorRef.current || !visiblePanels.code) return
    const frameId = requestAnimationFrame(() => editorRef.current?.layout())
    return () => cancelAnimationFrame(frameId)
  }, [leftWidth, fsSidebarWidth, leftSidebarSplit, inspectorSplit, rightColSplit, bookPanelWidth, visiblePanels.code, visiblePanels.visualizer, visiblePanels.diagram, visiblePanels.output, visiblePanels.filesystem])

  useEffect(() => {
    if (!visiblePanels.diagram) setShowExportDialog(false)
  }, [visiblePanels.diagram])

  useEffect(() => { persistNoteOverrides(noteOverrides) }, [noteOverrides])
  useEffect(() => { persistSettings(appSettings) }, [appSettings])
  useEffect(() => { inputModeRef.current = appSettings.inputMode }, [appSettings.inputMode])
  useEffect(() => { persistEditorFontSize(editorFontSize) }, [editorFontSize])
  useEffect(() => { persistConsoleFontSize(consoleFontSize) }, [consoleFontSize])
  useEffect(() => { persistWatches(watches) }, [watches])
  useEffect(() => { persistNamedLayouts(savedLayouts) }, [savedLayouts])

  useEffect(() => {
    const text = getStoredFixedInputs(activeFilesystemId)
    setFixedInputsText(text)
  }, [activeFilesystemId])

  useEffect(() => {
    if (appSettings.useFixedInputs) setDiagramView('inputs')
    else if (diagramView === 'inputs') setDiagramView('outline')
  }, [appSettings.useFixedInputs]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { noteDraftRef.current = noteDraft }, [noteDraft])
  useEffect(() => { isInsightEditingRef.current = isInsightEditing }, [isInsightEditing])

  useEffect(() => {
    startTransition(() => {
      const nextOutlineModel = analyzePythonOutline(deferredCodeText)
      setStructureModel(buildPythonStructureModel(deferredCodeText))
      setDiagramModel(analyzePythonClasses(deferredCodeText))
      setHierarchyModel(analyzePythonFunctions(deferredCodeText))
      setOutlineModel(nextOutlineModel)
      setOutlineExpandedIds(new Set(getExpandableOutlineIds(nextOutlineModel)))
    })
  }, [deferredCodeText])

  useEffect(() => {
    if (!isRunning) return
    setIsPanelMenuOpen(false)
    setIsRuntimeMenuOpen(false)
    setIsQuickSettingsOpen(false)
    setIsRunDropdownOpen(false)
  }, [isRunning])

  useEffect(() => {
    if (!isRunDropdownOpen) return
    const handle = (e: MouseEvent) => {
      if (!runDropdownRef.current?.contains(e.target as Node)) setIsRunDropdownOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [isRunDropdownOpen])

  useEffect(() => {
    if (!isPanelMenuOpen && !isRuntimeMenuOpen && !isQuickSettingsOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (panelMenuRef.current?.contains(event.target as Node) || runtimeMenuRef.current?.contains(event.target as Node) || quickSettingsRef.current?.contains(event.target as Node)) return
      setIsPanelMenuOpen(false); setIsRuntimeMenuOpen(false); setIsQuickSettingsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setIsPanelMenuOpen(false); setIsRuntimeMenuOpen(false); setIsQuickSettingsOpen(false) }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => { document.removeEventListener('mousedown', handlePointerDown); document.removeEventListener('keydown', handleKeyDown) }
  }, [isPanelMenuOpen, isRuntimeMenuOpen, isQuickSettingsOpen])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const drag = resizeDragRef.current
      if (!drag) return
      if (drag.type === 'col-main' && centerRef.current) {
        const rect = centerRef.current.getBoundingClientRect()
        setLeftWidth(Math.max(20, Math.min(80, ((e.clientX - rect.left) / rect.width) * 100)))
      } else if (drag.type === 'col-fssidebar') {
        setFsSidebarWidth(Math.max(160, Math.min(400, drag.startVal + (e.clientX - drag.startX))))
      } else if (drag.type === 'col-bookpanel') {
        setBookPanelWidth(Math.max(240, Math.min(600, drag.startVal + (drag.startX - e.clientX))))
      } else if (drag.type === 'row-leftsidebar' && leftSidebarRef.current) {
        const rect = leftSidebarRef.current.getBoundingClientRect()
        setLeftSidebarSplit(Math.max(20, Math.min(80, ((e.clientY - rect.top) / rect.height) * 100)))
      } else if (drag.type === 'row-inspector' && inspectorRef.current) {
        const rect = inspectorRef.current.getBoundingClientRect()
        setInspectorSplit(Math.max(20, Math.min(80, ((e.clientY - rect.top) / rect.height) * 100)))
      } else if (drag.type === 'row-rightcol' && rightColRef.current) {
        const rect = rightColRef.current.getBoundingClientRect()
        setRightColSplit(Math.max(20, Math.min(80, ((e.clientY - rect.top) / rect.height) * 100)))
      }
    }
    const onMouseUp = () => { resizeDragRef.current = null; document.body.style.cursor = ''; document.body.style.userSelect = '' }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp) }
  }, [])

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [outputLog])

  useEffect(() => {
    if (inputRequest === null) return
    const mode = appSettings.inputMode
    // inline-console is the xterm terminal — it self-handles prompts via the ConsoleTerminal prop
    if (mode === 'input-bar' && inlineInputRef.current) {
      inlineInputRef.current.focus(); inlineInputRef.current.select()
    } else if (mode === 'popup-dialog' && popupDialogRef.current) {
      if (!popupDialogRef.current.open) popupDialogRef.current.showModal()
    }
  }, [inputRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const dialog = popupDialogRef.current
    if (!dialog) return
    if (inputRequest === null && dialog.open) dialog.close()
  }, [inputRequest])

  useEffect(() => { setGlobalsInspectorPath([]); setLocalsInspectorPath([]) }, [inspectorRootKey])
  useEffect(() => { setGlobalsInspectorPath([]); setLocalsInspectorPath([]) }, [showInterpreterVars])

  useEffect(() => {
    const previousKey = activeInsightKeyRef.current
    if (previousKey && previousKey !== activeInsightKey && isInsightEditingRef.current) {
      const previousDefinition = structureModel.definitionByKey[previousKey] || null
      const previousDefault = getDefaultDefinitionNote(previousDefinition)
      const nextValue = sanitizeNoteText(noteDraftRef.current)
      setNoteOverrides(current => {
        const updated = { ...current }
        if (!nextValue && !previousDefault) delete updated[previousKey]
        else if (nextValue === previousDefault) delete updated[previousKey]
        else updated[previousKey] = nextValue
        return updated
      })
      setIsInsightEditing(false)
    }
    activeInsightKeyRef.current = activeInsightKey
    if (!isInsightEditingRef.current) setNoteDraft(activeInsightText)
  }, [activeInsightKey, activeInsightText, structureModel.definitionByKey])

  useEffect(() => {
    if (!isRunning && isInsightEditingRef.current && activeInsightKeyRef.current) {
      const currentDefinition = structureModel.definitionByKey[activeInsightKeyRef.current] || null
      const defaultNote = getDefaultDefinitionNote(currentDefinition)
      const nextValue = sanitizeNoteText(noteDraftRef.current)
      setNoteOverrides(current => {
        const updated = { ...current }
        if (!nextValue && !defaultNote) delete updated[activeInsightKeyRef.current]
        else if (nextValue === defaultNote) delete updated[activeInsightKeyRef.current]
        else updated[activeInsightKeyRef.current] = nextValue
        return updated
      })
      setIsInsightEditing(false)
    }
  }, [isRunning, structureModel.definitionByKey])

  // Sync breakpoints into editor decorations
  useEffect(() => {
    const editor = editorRef.current
    const decorations = breakpointDecorationsRef.current
    if (!editor || !decorations) return
    decorations.set(
      [...breakpoints].map(line => ({
        range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
        options: { glyphMarginClassName: 'monaco-breakpoint-glyph', stickiness: 1 },
      })),
    )
  }, [breakpoints])

  // Sync current line highlight into editor decorations
  useEffect(() => {
    const editor = editorRef.current
    const decorations = editorDecorationsRef.current
    if (!editor || !decorations) return
    if (currentLine < 1) { decorations.set([]); return }
    decorations.set([{
      range: { startLineNumber: currentLine, startColumn: 1, endLineNumber: currentLine, endColumn: 1 },
      options: { isWholeLine: true, className: 'monaco-trace-line', glyphMarginClassName: 'monaco-trace-glyph', stickiness: 1 },
    }])
    editor.revealLineInCenterIfOutsideViewport(currentLine)
  }, [currentLine])

  // Sync inline trace value annotations (current line + one-line trail)
  useEffect(() => {
    const decorations = traceValueDecorationsRef.current
    if (!decorations) return
    if (!appSettings.inlineTraceValues || currentLine < 1 || !simState) {
      decorations.set([])
      prevTraceLineRef.current = -1
      return
    }
    const localsNode = localsInspectorRoot?.node
    const globalsNode = globalsInspectorRoot?.node
    const allEntries = [
      ...((localsNode?.kind === 'scope' || localsNode?.kind === 'mapping') ? (localsNode.entries ?? []) : []),
      ...((globalsNode?.kind === 'scope' || globalsNode?.kind === 'mapping') ? (globalsNode.entries ?? []) : []),
    ]
    if (allEntries.length === 0) { decorations.set([]); prevTraceLineRef.current = currentLine; return }

    const model = editorRef.current?.getModel()

    const valueMap = new Map<string, string>()
    for (const entry of allEntries) {
      const label = String(entry.label ?? '').replace(/^['"]|['"]$/g, '')
      if (!label) continue
      const node = entry.value
      if (!node) continue
      if (node.kind === 'primitive') {
        const raw = typeof node.value === 'string' ? node.value : String(node.summary ?? node.value)
        const truncated = raw.length > 20 ? raw.slice(0, 20) + '…' : raw
        valueMap.set(label, typeof node.value === 'string' ? `"${truncated}"` : truncated)
      } else {
        valueMap.set(label, node.summary ?? node.type ?? '?')
      }
    }

    const buildDec = (line: number) => {
      if (line < 1 || !model) return null
      const tokens = (model.getLineContent(line).match(/\b[a-zA-Z_]\w*\b/g) ?? [])
      const parts: string[] = []
      for (const name of [...new Set(tokens)].filter(t => !PYTHON_KEYWORDS.has(t))) {
        if (parts.length >= 4) break
        if (valueMap.has(name)) parts.push(`${name}=${valueMap.get(name)}`)
      }
      if (parts.length === 0) return null
      const lineEnd = model.getLineMaxColumn(line)
      return {
        range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: lineEnd },
        options: { after: { content: `  // ${parts.join(', ')}`, inlineClassName: 'monaco-trace-inline-value' } },
      }
    }

    const newDecs = []
    const cur = buildDec(currentLine)
    if (cur) newDecs.push(cur)
    const prevLine = prevTraceLineRef.current
    if (prevLine >= 1 && prevLine !== currentLine) {
      const prev = buildDec(prevLine)
      if (prev) newDecs.push(prev)
    }
    decorations.set(newDecs)
    prevTraceLineRef.current = currentLine
  }, [currentLine, simState, appSettings.inlineTraceValues, globalsInspectorRoot, localsInspectorRoot])

  // Turtle scrubber playback: advance one step per interval, stop at end
  useEffect(() => {
    if (!turtleScrubPlaying) return
    const maxStep = turtleSvgHistory.length - 1
    if (turtleScrubStep >= maxStep) { setTurtleScrubPlaying(false); return }
    const id = window.setTimeout(() => {
      setTurtleScrubStep(prev => Math.min(prev + 1, turtleSvgHistoryRef.current.length - 1))
    }, turtleScrubSpeed)
    return () => window.clearTimeout(id)
  }, [turtleScrubPlaying, turtleScrubStep, turtleSvgHistory.length, turtleScrubSpeed])

  // ── Monaco editor handlers ────────────────────────────────────────────────

  const handleEditorBeforeMount = (monaco: Monaco) => {
    if (!(window as { __asTracerMonacoThemeDefined?: boolean }).__asTracerMonacoThemeDefined) {
      monaco.editor.defineTheme('as-tracer-dark', MONACO_DARK_THEME)
      monaco.editor.defineTheme('as-tracer-light', MONACO_LIGHT_THEME)
      ;(window as { __asTracerMonacoThemeDefined?: boolean }).__asTracerMonacoThemeDefined = true
    }
  }

  const handleEditorMount = (editor: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    editorDecorationsRef.current = editor.createDecorationsCollection()
    breakpointDecorationsRef.current = editor.createDecorationsCollection()
    traceValueDecorationsRef.current = editor.createDecorationsCollection()

    editor.onMouseDown(e => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const line = e.target.position?.lineNumber
        if (!line) return
        const next = new Set(breakpointsRef.current)
        if (next.has(line)) next.delete(line)
        else next.add(line)
        breakpointsRef.current = next
        setBreakpoints(new Set(next))
      }
    })

    // Track cursor position for notes editing
    editor.onDidChangeCursorPosition(e => {
      setEditorCursorLine(e.position.lineNumber)
    })

    // Ctrl+Alt+Shift+> / < — editor font size (also updates the stored value)
    const KM = monaco.KeyMod
    const KC = monaco.KeyCode
    editor.addAction({
      id: 'increase-font-size',
      label: 'Increase Font Size',
      keybindings: [KM.CtrlCmd | KM.Alt | KM.Shift | KC.Period],
      run: (ed) => {
        const size = ed.getOption(monaco.editor.EditorOption.fontSize)
        const next = Math.min(size + 1, 40)
        ed.updateOptions({ fontSize: next })
        setEditorFontSize(next)
      },
    })
    editor.addAction({
      id: 'decrease-font-size',
      label: 'Decrease Font Size',
      keybindings: [KM.CtrlCmd | KM.Alt | KM.Shift | KC.Comma],
      run: (ed) => {
        const size = ed.getOption(monaco.editor.EditorOption.fontSize)
        const next = Math.max(size - 1, 8)
        ed.updateOptions({ fontSize: next })
        setEditorFontSize(next)
      },
    })

    editor.addAction({
      id: 'add-to-watches',
      label: 'Add Selection to Watches',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: (ed) => {
        const selection = ed.getSelection()
        if (!selection) return
        const text = ed.getModel()?.getValueInRange(selection)?.trim()
        if (!text) return
        setWatches(w => w.includes(text) ? w : [...w, text])
      },
    })

    setIsEditorReady(true)
  }

  const handleEditorChange = (value: string | undefined) => {
    if (applyingEditorValueRef.current) return
    const nextValue = value ?? ''
    setCodeText(nextValue)
    setCodeStatus(nextValue.trim() ? 'Code edited in the browser.' : 'Editor is empty. Load or type Python.')
    setIsUnsaved(openFilePath !== null && nextValue !== savedCodeRef.current)
  }

  // ── Code loading ─────────────────────────────────────────────────────────

  const loadCodeText = (text: string, fileName = DEFAULT_CODE_FILENAME, vfsPath: string | null = null) => {
    const cleanCode = cleanCodeText(text)
    breakpointsRef.current = new Set()
    setBreakpoints(new Set())
    setCodeText(cleanCode)
    setCodeFileName(fileName)
    setCodeStatus(`${fileName} loaded.`)
    setOpenFilePath(vfsPath)
    savedCodeRef.current = cleanCode
    setIsUnsaved(false)
    setCurrentLine(-1); setCurrentFunc(''); setCurrentClass(''); setSimState(null)
    setInputRequest(null); setInputValue(''); setOutputLog(''); setActiveRuntime('')
    setMainThreadStatus('Main-thread runtime is ready.')
    setIsInsightEditing(false); setShowExportDialog(false)

    if (editorRef.current) {
      applyingEditorValueRef.current = true
      editorRef.current.setValue(cleanCode)
      applyingEditorValueRef.current = false
    }
  }

  const handleLoadButtonClick = () => { if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click() } }

  const handleCodeFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const rawBuffer = await file.arrayBuffer()
      const mime = file.type || guessMimeType(file.name)
      const name = file.name || DEFAULT_CODE_FILENAME
      const content = isTextMime(mime) ? new TextDecoder().decode(rawBuffer) : ''
      setPendingCodeLoad({ content, name, rawBuffer, mimeType: mime })
      setShowCodeSaveDialog(true)
    } catch { setCodeStatus('Failed to read the selected file.') }
    finally { event.target.value = '' }
  }

  const handleCodeSaveDialogSave = async (parentPath: string, filename: string) => {
    if (!pendingCodeLoad) return
    try {
      const path = parentPath === '/' ? `/${filename}` : `${parentPath}/${filename}`
      const mimeType = pendingCodeLoad.mimeType || guessMimeType(filename)
      await writeFile(activeFilesystemId, path, pendingCodeLoad.rawBuffer, mimeType)
      if (isTextMime(mimeType)) {
        loadCodeText(pendingCodeLoad.content, filename, path)
      } else {
        setCodeStatus(`${filename} saved to virtual filesystem.`)
      }
      setPendingCodeLoad(null); setShowCodeSaveDialog(false)
      setVfsReloadTrigger(t => t + 1)
    } catch (err) { setCodeStatus(`Failed to save: ${String(err)}`) }
  }

  const handleNewFileButton = () => {
    setPendingCodeLoad({ content: '', name: 'new_file.py', rawBuffer: new ArrayBuffer(0), mimeType: 'text/x-python' })
    setShowCodeSaveDialog(true)
  }

  const handleSaveCode = async () => {
    if (!hasCode) return
    if (openFilePath) {
      const content = new TextEncoder().encode(codeText)
      await writeFile(activeFilesystemId, openFilePath, content.buffer as ArrayBuffer, 'text/x-python')
      savedCodeRef.current = codeText
      setIsUnsaved(false)
      setCodeStatus(`Saved to ${openFilePath}.`)
      setVfsReloadTrigger(t => t + 1)
    } else {
      const name = codeFileName || DEFAULT_CODE_FILENAME
      setPendingCodeLoad({ content: codeText, name, rawBuffer: new TextEncoder().encode(codeText).buffer as ArrayBuffer, mimeType: 'text/x-python' })
      setShowCodeSaveDialog(true)
    }
  }

  const saveCurrentToVFS = async () => {
    if (!openFilePath || !codeText.trim()) return
    const content = new TextEncoder().encode(codeText)
    try {
      await writeFile(activeFilesystemId, openFilePath, content.buffer as ArrayBuffer, 'text/x-python')
      savedCodeRef.current = codeText
      setIsUnsaved(false)
      setVfsReloadTrigger(t => t + 1)
    } catch { /* ignore */ }
    if (localFolderFsIdRef.current === activeFilesystemId && localFolderHandleRef.current) {
      try {
        const perm = await localFolderHandleRef.current.queryPermission({ mode: 'readwrite' })
        if (perm === 'granted') {
          await writeFileToFolderHandle(localFolderHandleRef.current, openFilePath, content.buffer as ArrayBuffer)
        }
      } catch { /* ignore */ }
    }
  }

  const onOpenVFSFile = async (entry: VFSEntry) => {
    if (entry.type !== 'file') return
    const mime = entry.mimeType ?? guessMimeType(entry.name)
    if (!isTextMime(mime)) {
      setCodeStatus(`Cannot open '${entry.name}' in the editor (not a text file). Use the file panel to download it.`)
      return
    }
    if (openFilePath && codeText !== savedCodeRef.current) {
      const confirmed = window.confirm(`Save changes to "${codeFileName}" before opening "${entry.name}"?`)
      if (confirmed) await saveCurrentToVFS()
    }
    if (entry.content) {
      const text = new TextDecoder().decode(entry.content)
      savedCodeRef.current = text
      loadCodeText(text, entry.name, entry.path)
    }
  }

  // ── Note management ───────────────────────────────────────────────────────

  const saveInsightNote = (targetKey = effectiveNoteKey, rawValue = noteDraftRef.current, closeEditor = true) => {
    if (!targetKey) return
    const nextValue = sanitizeNoteText(rawValue)
    if (targetKey === GLOBAL_NOTE_KEY) {
      setNoteOverrides(current => {
        const updated = { ...current }
        if (!nextValue) delete updated[GLOBAL_NOTE_KEY]
        else updated[GLOBAL_NOTE_KEY] = nextValue
        return updated
      })
    } else {
      const definition = structureModel.definitionByKey[targetKey] || null
      const defaultNote = getDefaultDefinitionNote(definition)
      setNoteOverrides(current => {
        const updated = { ...current }
        if (!nextValue && !defaultNote) delete updated[targetKey]
        else if (nextValue === defaultNote) delete updated[targetKey]
        else updated[targetKey] = nextValue
        return updated
      })
    }
    if (closeEditor) setIsInsightEditing(false)
  }

  const beginEditingInsightNote = () => {
    // Allow editing in trace mode (inside a def) or editing mode (always)
    if (isRunning && !activeInsightKey) return
    setNoteDraft(activeInsightText)
    setIsInsightEditing(true)
  }

  const resetInsightNote = () => {
    if (effectiveNoteKey === GLOBAL_NOTE_KEY) {
      setNoteOverrides(current => { const updated = { ...current }; delete updated[GLOBAL_NOTE_KEY]; return updated })
      setNoteDraft('')
      setIsInsightEditing(false)
      return
    }
    if (!activeInsightKey) return
    setNoteOverrides(current => { const updated = { ...current }; delete updated[activeInsightKey]; return updated })
    setNoteDraft(getDefaultDefinitionNote(activeInsightDefinition))
    setIsInsightEditing(false)
  }

  const handleInsertDocstring = () => {
    const noteText = isInsightEditing ? noteDraft : activeInsightText
    const cleanNote = sanitizeNoteText(noteText)
    if (!cleanNote) return

    const lines = codeText.split('\n')

    if (!activeInsightDefinition) {
      // Global docstring at top of file
      let insertIdx = 0
      while (insertIdx < lines.length && /^\s*(#!|#\s*-\*-|#\s*coding)/.test(lines[insertIdx])) insertIdx++
      while (insertIdx < lines.length && lines[insertIdx].trim() === '') insertIdx++
      const safeLines = cleanNote.split('\n').map(l => l.replace(/"""/g, '\\"\\"\\"'))
      const docLines = ['"""', ...safeLines, '"""']
      const trimmed = lines[insertIdx]?.trim() || ''
      if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
        const quote = trimmed.startsWith('"""') ? '"""' : "'''"
        let endIdx = insertIdx
        const rest = trimmed.slice(3)
        if (!rest.includes(quote)) {
          endIdx++
          while (endIdx < lines.length && !lines[endIdx].includes(quote)) endIdx++
        }
        lines.splice(insertIdx, endIdx - insertIdx + 1, ...docLines)
      } else {
        lines.splice(insertIdx, 0, ...docLines, '')
      }
    } else {
      const lineIndex = activeInsightDefinition.line - 1
      const originalLine = lines[lineIndex] || ''
      const leadingWs = originalLine.match(/^\s*/)?.[0] || ''
      const docIndent = `${leadingWs}    `
      const safeLines = cleanNote.split('\n').map(l => l.replace(/"""/g, '\\"\\"\\"'))
      const docLines = [`${docIndent}"""`, ...safeLines.map(l => `${docIndent}${l}`), `${docIndent}"""`]
      const insertIndex = replaceExistingDocstring(lines, lineIndex + 1)
      lines.splice(insertIndex, 0, ...docLines)
    }

    const newCode = lines.join('\n')
    setCodeText(newCode)
    if (editorRef.current) {
      applyingEditorValueRef.current = true
      editorRef.current.setValue(newCode)
      applyingEditorValueRef.current = false
    }
    setIsUnsaved(openFilePath !== null)
  }

  const downloadNotesExport = (mode: 'comments' | 'docstrings') => {
    if (!canExportNotes) return
    if (isInsightEditing && activeInsightKey) saveInsightNote(activeInsightKey, noteDraft, true)
    const currentOverrides = (() => {
      if (!isInsightEditing || !activeInsightKey) return noteOverrides
      const definition = structureModel.definitionByKey[activeInsightKey] || null
      const defaultNote = getDefaultDefinitionNote(definition)
      const nextValue = sanitizeNoteText(noteDraft)
      const updated = { ...noteOverrides }
      if (!nextValue && !defaultNote) delete updated[activeInsightKey]
      else if (nextValue === defaultNote) delete updated[activeInsightKey]
      else updated[activeInsightKey] = nextValue
      return updated
    })()
    const stem = getBaseFileStem(codeFileName, DEFAULT_CODE_FILENAME)
    if (mode === 'comments') {
      triggerDownload(`${stem}_notes.txt`, buildCommentExport(structureModel, currentOverrides), 'text/plain;charset=utf-8')
    } else {
      triggerDownload(`${stem}_annotated.py`, buildDocstringExport(codeText, structureModel, currentOverrides), 'text/x-python;charset=utf-8')
    }
    setShowExportDialog(false)
  }

  // ── Output helpers ────────────────────────────────────────────────────────

  const appendOutput = (text: string) => {
    if (inputModeRef.current === 'inline-console') {
      consoleTermRef.current?.write(text + '\n')
    } else {
      setOutputLog(prev => prev + text + '\n')
    }
  }

  const clearConsole = () => {
    setOutputLog('')
    consoleTermRef.current?.clear()
  }

  const getWatchValue = (expr: string): string => {
    if (!isRunning || !simState) return '—'
    const localsNode = localsInspectorRoot?.node
    const globalsNode = globalsInspectorRoot?.node
    const allEntries = [
      ...((localsNode?.kind === 'scope' || localsNode?.kind === 'mapping') ? (localsNode.entries ?? []) : []),
      ...((globalsNode?.kind === 'scope' || globalsNode?.kind === 'mapping') ? (globalsNode.entries ?? []) : []),
    ]
    const entry = allEntries.find(e => String(e.label ?? '').replace(/^['"]|['"]$/g, '') === expr)
    if (!entry) return '—'
    const node = entry.value
    if (!node) return '—'
    if (node.kind === 'primitive') {
      return typeof node.value === 'string' ? `"${node.value}"` : String(node.summary ?? node.value)
    }
    return node.summary ?? node.type ?? '?'
  }

  // ── Panel & theme controls ────────────────────────────────────────────────

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')
  const increaseDiagramFontSize = () => setDiagramFontSize(f => clampDiagramFontSize(f + 1))
  const decreaseDiagramFontSize = () => setDiagramFontSize(f => clampDiagramFontSize(f - 1))
  const togglePanelVisibility = (panelKey: string) => {
    setVisiblePanels(current => {
      const visibleCount = Object.values(current).filter(Boolean).length
      if (current[panelKey as keyof PanelVisibility] && visibleCount === 1) return current
      return { ...current, [panelKey]: !current[panelKey as keyof PanelVisibility] }
    })
  }

  const handleRestoreDefaults = () => {
    setVisiblePanels({ code: true, visualizer: true, diagram: true, notes: true, output: true, filesystem: true })
    setLeftWidth(55)
    setFsSidebarWidth(224)
    setLeftSidebarSplit(55)
    setInspectorSplit(50)
    setRightColSplit(42)
    setIsPanelMenuOpen(false)
  }

  const handleSaveLayout = () => {
    const name = window.prompt('Name for this layout:')
    if (!name?.trim()) return
    const layout: NamedLayout = { name: name.trim(), visiblePanels: { ...visiblePanels }, leftWidth, fsSidebarWidth, leftSidebarSplit, inspectorSplit, rightColSplit, bookPanelWidth }
    setSavedLayouts(prev => [...prev.filter(l => l.name !== layout.name), layout])
  }

  const handleRestoreLayout = (layout: NamedLayout) => {
    setVisiblePanels(layout.visiblePanels)
    setLeftWidth(layout.leftWidth)
    setFsSidebarWidth(layout.fsSidebarWidth)
    setLeftSidebarSplit(layout.leftSidebarSplit)
    setInspectorSplit(layout.inspectorSplit)
    setRightColSplit(layout.rightColSplit)
    setBookPanelWidth(layout.bookPanelWidth)
    setIsPanelMenuOpen(false)
  }

  const handleDeleteLayout = (name: string) => {
    setSavedLayouts(prev => prev.filter(l => l.name !== name))
  }

  const jumpToSourceLine = (lineNumber: number) => {
    if (!editorRef.current || !lineNumber) return
    editorRef.current.focus()
    editorRef.current.setPosition({ lineNumber, column: 1 })
    editorRef.current.revealLineInCenter(lineNumber)
  }

  // ── Canvas helpers ────────────────────────────────────────────────────────

  const ensureMainThreadCanvas = () => {
    const canvas = mainThreadCanvasRef.current
    if (!canvas) throw new Error('The pygame canvas host is not available.')
    canvas.id = 'canvas'; canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'pygame canvas')
    if (!canvas.width) canvas.width = 960
    if (!canvas.height) canvas.height = 540
    return canvas
  }

  const clearMainThreadCanvas = () => {
    const canvas = mainThreadCanvasRef.current
    mainThreadCanvasSnapshotRef.current = null
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.save(); ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, canvas.width || 960, canvas.height || 540); ctx.restore()
  }

  const focusMainThreadCanvas = () => {
    const canvas = mainThreadCanvasRef.current
    if (!canvas) return
    requestAnimationFrame(() => { try { canvas.focus({ preventScroll: true }) } catch { canvas.focus() } })
  }

  const stopMainThreadCanvasWatcher = ({ restoreSnapshot = false } = {}) => {
    if (mainThreadCanvasWatcherRef.current) { cancelAnimationFrame(mainThreadCanvasWatcherRef.current); mainThreadCanvasWatcherRef.current = 0 }
    if (!restoreSnapshot) return
    const canvas = mainThreadCanvasRef.current
    const snapshot = mainThreadCanvasSnapshotRef.current
    if (!canvas || !snapshot) return
    if (canvas.width > 0 && canvas.height > 0) return
    canvas.width = snapshot.width; canvas.height = snapshot.height
    canvas.getContext('2d')?.drawImage(snapshot, 0, 0)
  }

  const startMainThreadCanvasWatcher = () => {
    stopMainThreadCanvasWatcher()
    const step = () => {
      const canvas = mainThreadCanvasRef.current
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        let snapshot = mainThreadCanvasSnapshotRef.current
        if (!snapshot || snapshot.width !== canvas.width || snapshot.height !== canvas.height) {
          snapshot = document.createElement('canvas')
          snapshot.width = canvas.width; snapshot.height = canvas.height
          mainThreadCanvasSnapshotRef.current = snapshot
        }
        snapshot.getContext('2d')?.drawImage(canvas, 0, 0)
      }
      mainThreadCanvasWatcherRef.current = requestAnimationFrame(step)
    }
    mainThreadCanvasWatcherRef.current = requestAnimationFrame(step)
  }

  const enterPygamePresentationMode = () => {
    if (!pygameLayoutSnapshotRef.current) {
      pygameLayoutSnapshotRef.current = { visiblePanels: { ...visiblePanels }, leftWidth }
    }
    setShowExportDialog(false)
    setVisiblePanels({ code: false, visualizer: false, diagram: true, notes: false, output: true, filesystem: false })
    setIsPygameRunActive(true)
  }

  const restorePygamePresentationMode = () => {
    setIsPygameRunActive(false)
    const snapshot = pygameLayoutSnapshotRef.current
    pygameLayoutSnapshotRef.current = null
    if (!snapshot) return
    setVisiblePanels(snapshot.visiblePanels)
    setLeftWidth(snapshot.leftWidth)
  }

  const enterConsolePresentationMode = () => {
    if (!consoleLayoutSnapshotRef.current) {
      consoleLayoutSnapshotRef.current = { visiblePanels: { ...visiblePanels }, leftWidth }
    }
    setShowExportDialog(false)
    setVisiblePanels({ code: false, visualizer: false, diagram: false, notes: false, output: true, filesystem: false })
    setIsConsolePresentationMode(true)
  }

  const restoreConsolePresentationMode = () => {
    setIsConsolePresentationMode(false)
    const snapshot = consoleLayoutSnapshotRef.current
    consoleLayoutSnapshotRef.current = null
    if (!snapshot) return
    setVisiblePanels(snapshot.visiblePanels)
    setLeftWidth(snapshot.leftWidth)
  }

  const enterTurtleCanvasPresentationMode = () => {
    if (!turtleLayoutSnapshotRef.current) {
      turtleLayoutSnapshotRef.current = { visiblePanels: { ...visiblePanels }, leftWidth }
    }
    setShowExportDialog(false)
    setVisiblePanels({ code: false, visualizer: false, diagram: true, notes: false, output: true, filesystem: false })
    setIsTurtleCanvasRunActive(true)
  }

  const restoreTurtleCanvasPresentationMode = () => {
    setIsTurtleCanvasRunActive(false)
    const snapshot = turtleLayoutSnapshotRef.current
    turtleLayoutSnapshotRef.current = null
    if (!snapshot) return
    setVisiblePanels(snapshot.visiblePanels)
    setLeftWidth(snapshot.leftWidth)
  }

  const enterSvgTurtlePresentationMode = () => {
    if (!svgTurtleLayoutSnapshotRef.current) {
      svgTurtleLayoutSnapshotRef.current = { visiblePanels: { ...visiblePanels }, leftWidth }
    }
    setShowExportDialog(false)
    setVisiblePanels({ code: false, visualizer: false, diagram: true, notes: false, output: true, filesystem: false })
  }

  const restoreSvgTurtlePresentationMode = () => {
    const snapshot = svgTurtleLayoutSnapshotRef.current
    svgTurtleLayoutSnapshotRef.current = null
    if (!snapshot) return
    setVisiblePanels(snapshot.visiblePanels)
    setLeftWidth(snapshot.leftWidth)
  }

  // ── Filesystem switching ─────────────────────────────────────────────────

  const clearEditorForSwitch = () => {
    if (editorRef.current) {
      applyingEditorValueRef.current = true
      editorRef.current.setValue('')
      applyingEditorValueRef.current = false
    }
    setCodeText('')
    setCodeFileName(DEFAULT_CODE_FILENAME)
    setCodeStatus('No file open. Select a file from the file system panel.')
    setOpenFilePath(null)
    savedCodeRef.current = ''
    setIsUnsaved(false)
    setCurrentLine(-1); setCurrentFunc(''); setCurrentClass(''); setSimState(null)
    setInputRequest(null); setInputValue(''); setOutputLog(''); setActiveRuntime('')
    mainThreadMountedPathsRef.current = []
  }

  const handleFilesystemChange = async (id: string) => {
    if (id === activeFilesystemId) return
    if (isUnsaved && openFilePath) {
      const shouldSave = window.confirm(`Save changes to "${codeFileName}" before switching filesystems?`)
      if (shouldSave) await saveCurrentToVFS()
    }
    clearEditorForSwitch()
    setActiveFilesystemId(id)
    setCurrentWorkingDir('/')
  }

  const handleFilesystemForcedChange = (id: string) => {
    clearEditorForSwitch()
    setActiveFilesystemId(id)
    setCurrentWorkingDir('/')
  }

  // ── Runtime execution ─────────────────────────────────────────────────────

  const addToTurtleHistory = (svg: string) => {
    if (!svg) return
    const current = turtleSvgHistoryRef.current
    if (current.length > 0 && current[current.length - 1] === svg) return
    const newHistory = [...current, svg]
    turtleSvgHistoryRef.current = newHistory
    setTurtleSvgHistory(newHistory)
    if (!turtleScrubLockedRef.current) setTurtleScrubStep(newHistory.length - 1)
  }

  const resetTurtleHistory = () => {
    turtleSvgHistoryRef.current = []
    turtleScrubLockedRef.current = false
    setTurtleSvgHistory([])
    setTurtleScrubStep(0)
    setTurtleScrubPlaying(false)
    setTurtleSvg('')
    setDiagramView(prev => prev === 'turtle' ? 'hierarchy' : prev)
  }

  const closeScrubberAndClear = () => {
    turtleSvgHistoryRef.current = []
    turtleScrubLockedRef.current = false
    setTurtleSvgHistory([])
    setTurtleScrubStep(0)
    setTurtleScrubPlaying(false)
    setTurtleSvg('')
    setDiagramView('outline')
  }

  const resetExecutionState = () => {
    setCurrentLine(-1); setCurrentFunc(''); setCurrentClass(''); setSimState(null)
    setInputRequest(null); setInputValue('')
    clearConsole()
  }

  const handleBookOpen = async (url: string) => {
    try {
      const manifest = await fetchBookManifest(url)
      const newState: BookNavState = {
        rootUrl: url,
        currentBookUrl: url,
        breadcrumb: [],
        activeChallengeId: null,
      }
      setBookNavState(newState)
      persistBookNavState(newState)
    } catch (e) {
      setCodeStatus(`Failed to open book: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleBookNavStateChange = (state: BookNavState) => {
    setBookNavState(state)
    persistBookNavState(state)
    if (!state.activeChallengeId) {
      setChallengeHiddenPaths([])
      clearEditorForSwitch()
      setActiveFilesystemId('default')
      setCurrentWorkingDir('/')
    }
  }

  const handleEnterChallenge = async (bookUrl: string, challenge: BookChallenge, forceReset = false) => {
    try {
      await saveCurrentToVFS()
      clearEditorForSwitch()
      const { fsId, pyFilename, hiddenPaths } = await getOrCreateChallengeFs(bookUrl, challenge, forceReset)
      setActiveFilesystemId(fsId)
      setChallengeHiddenPaths(hiddenPaths)
      setCurrentWorkingDir('/')
      setVfsReloadTrigger(t => t + 1)
      if (pyFilename) {
        const entry = await getEntryByPath(fsId, `/${pyFilename}`)
        if (entry?.content) {
          const text = new TextDecoder().decode(entry.content)
          savedCodeRef.current = text
          loadCodeText(text, entry.name, entry.path)
        }
      }
    } catch (e) {
      setCodeStatus(`Failed to load challenge: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleCloseBook = () => {
    setBookNavState(null)
    persistBookNavState(null)
    setChallengeHiddenPaths([])
    clearEditorForSwitch()
    setActiveFilesystemId('default')
    setCurrentWorkingDir('/')
  }

  const importLocalFiles = async (fileMap: Map<string, ArrayBuffer>, sourceName: string) => {
    const bookJsonBuf = fileMap.get('book.json')
    if (bookJsonBuf) {
      const stagingName = BOOK_SRC_PREFIX + sourceName
      const fsList = await listFilesystems()
      const existing = fsList.find(f => f.name === stagingName)
      if (existing) await deleteFilesystem(existing.id)
      const { id: stagingFsId } = await createFilesystem(stagingName)
      await importFileMapToFs(stagingFsId, fileMap, true)
      await handleBookOpen(`vfs://fs:${stagingFsId}/book.json`)
    } else {
      const fsList = await listFilesystems()
      const existing = fsList.find(f => f.name === sourceName)
      let fsId: string
      if (existing) {
        const doReset = window.confirm(
          `Filesystem "${sourceName}" already exists.\n\nOK = reset (replace all files)\nCancel = merge (keep existing, add new only)`
        )
        if (doReset) {
          await deleteFilesystem(existing.id)
          const { id } = await createFilesystem(sourceName)
          await importFileMapToFs(id, fileMap, true)
          fsId = id
        } else {
          await importFileMapToFs(existing.id, fileMap, false)
          fsId = existing.id
        }
      } else {
        const { id } = await createFilesystem(sourceName)
        await importFileMapToFs(id, fileMap, true)
        fsId = id
      }
      localFolderHandleRef.current = null
      localFolderFsIdRef.current = null
      setVfsReloadTrigger(t => t + 1)
      clearEditorForSwitch()
      setActiveFilesystemId(fsId)
      setCurrentWorkingDir('/')
    }
  }

  const handleLocalFileImport = async (fileMap: Map<string, ArrayBuffer>, sourceName: string) => {
    try { await importLocalFiles(fileMap, sourceName) }
    catch (e) { setCodeStatus(`Import failed: ${e instanceof Error ? e.message : String(e)}`) }
  }

  const handleFolderConnect = async (handle: FileSystemDirectoryHandle) => {
    try {
      const perm = await handle.requestPermission({ mode: 'readwrite' })
      if (perm !== 'granted') { setCodeStatus('Folder permission denied.'); return }
      const fileMap = await readDirectoryToMap(handle)
      const bookJsonBuf = fileMap.get('book.json')
      if (bookJsonBuf) {
        await importLocalFiles(fileMap, handle.name)
      } else {
        await importLocalFiles(fileMap, handle.name)
        const fsList = await listFilesystems()
        const fs = fsList.find(f => f.name === handle.name)
        if (fs) {
          localFolderHandleRef.current = handle
          localFolderFsIdRef.current = fs.id
        }
      }
    } catch (e) { setCodeStatus(`Folder connect failed: ${e instanceof Error ? e.message : String(e)}`) }
  }

  const handlePyodideReset = () => {
    if (isRunning && activeRuntime === 'main-thread') {
      mainThreadAbandonedRef.current = true
      mainThreadRunIdRef.current++
      setIsRunning(false)
      setActiveRuntime('')
    }
    resetMainThreadPyodide()
    setMainThreadStatus('Pyodide reset. Ready.')
    appendOutput('\n[INFO] Pyodide environment reset. Files are preserved.')
  }

  const startTraceWorker = async () => {
    if (!hasSab || !hasCode) return
    const choice = runModeChoice
    if (pendingRestore) pendingRestore()
    setPendingRestore(null)
    fixedInputsQueueRef.current = appSettings.useFixedInputs
      ? fixedInputsText.split('\n').filter(l => l.length > 0)
      : []
    await saveCurrentToVFS()
    const vfsFiles = await getAllFiles(activeFilesystemId)
    const capturedFsId = activeFilesystemId
    const capturedCwd = currentWorkingDir

    const hasTurtleForMode = codeUsesTurtle(codeText)
    const isSvgTurtleRun = (choice === 'run') && hasTurtleForMode && appSettings.turtleMode === 'basthon-svg'

    workerRunModeRef.current = choice
    if (choice === 'run') {
      if (isSvgTurtleRun) enterSvgTurtlePresentationMode()
      else enterConsolePresentationMode()
    }

    resetExecutionState()
    resetTurtleHistory()
    setIsRunning(true); setActiveRuntime('trace-worker')
    setCodeStatus(choice === 'run' ? 'Worker runtime starting...' : 'Trace-worker runtime starting...')
    setMainThreadStatus('Trace-worker runtime is active.')

    const sab = new SharedArrayBuffer(1024 * 4)
    sabRef.current = { sab, int32: new Int32Array(sab), uint8: new Uint8Array(sab) }

    const worker = new TracerWorker()
    workerRef.current = worker

    worker.onmessage = (e: MessageEvent) => {
      const data = e.data
      if (data.type === 'trace') {
        if (data.turtleSvg) { setTurtleSvg(data.turtleSvg); setDiagramView('turtle'); addToTurtleHistory(data.turtleSvg) }
        const mode = workerRunModeRef.current
        if (mode === 'run') {
          sendTraceCommand(TRACE_CMD_CONTINUE)
        } else if (mode === 'break') {
          if (breakpointsRef.current.has(data.line)) {
            workerRunModeRef.current = 'trace'
            setCurrentLine(data.line); setCurrentFunc(data.func); setCurrentClass(data.cls || '')
            if (data.state && data.state !== '{}') {
              try { setSimState(JSON.parse(data.state)) } catch { /* ignore */ }
            }
          } else {
            sendTraceCommand(TRACE_CMD_CONTINUE)
          }
        } else {
          setCurrentLine(data.line); setCurrentFunc(data.func); setCurrentClass(data.cls || '')
          if (data.state && data.state !== '{}') {
            try { setSimState(JSON.parse(data.state)) } catch { /* ignore */ }
          }
        }
      } else if (data.type === 'input') {
        setInputValue('')
        if (appSettings.useFixedInputs && fixedInputsQueueRef.current.length > 0) {
          const next = fixedInputsQueueRef.current.shift()!
          appendOutput((data.prompt ?? '') + next)
          setTimeout(() => handleInputSubmit(next), 0)
        } else {
          setInputRequest({ id: Date.now(), prompt: data.prompt ?? '' })
        }
      } else if (data.type === 'print') {
        appendOutput(data.text)
      } else if (data.type === 'error') {
        if (data.files?.length) {
          void syncFilesFromPyodide(capturedFsId, data.files).then(() => setVfsReloadTrigger(t => t + 1))
        }
        appendOutput('\n[ERROR] ' + data.error)
        setInputRequest(null); setInputValue(''); setIsRunning(false); setActiveRuntime('')
        setCodeStatus('Worker runtime failed.')
        if (workerRunModeRef.current === 'run') {
          const inSvgMode = svgTurtleLayoutSnapshotRef.current !== null
          setPendingRestore(() => inSvgMode
            ? () => { restoreSvgTurtlePresentationMode(); closeScrubberAndClear() }
            : restoreConsolePresentationMode)
        }
        workerRunModeRef.current = 'trace'
        workerRef.current = null; sabRef.current = null
      } else if (data.type === 'done') {
        if (data.files?.length) {
          void syncFilesFromPyodide(capturedFsId, data.files).then(() => setVfsReloadTrigger(t => t + 1))
        }
        if (data.turtleSvg) { setTurtleSvg(data.turtleSvg); setDiagramView('turtle'); addToTurtleHistory(data.turtleSvg) }
        const wasRunMode = workerRunModeRef.current === 'run'
        const label = wasRunMode ? '[RUN FINISHED]' : '[TRACE RUN FINISHED]'
        appendOutput(`\n${label}`)
        setInputRequest(null); setInputValue(''); setIsRunning(false); setActiveRuntime('')
        setCurrentLine(-1)
        setCodeStatus(wasRunMode ? 'Worker runtime finished.' : 'Trace-worker runtime finished.')
        if (wasRunMode) {
          const inSvgMode = svgTurtleLayoutSnapshotRef.current !== null
          setPendingRestore(() => inSvgMode
            ? () => { restoreSvgTurtlePresentationMode(); closeScrubberAndClear() }
            : restoreConsolePresentationMode)
        }
        workerRunModeRef.current = 'trace'
        workerRef.current = null; sabRef.current = null
      } else if (data.type === 'turtle_update') {
        const svg = data.svg || ''
        setTurtleSvg(svg)
        if (svg) { setDiagramView('turtle'); addToTurtleHistory(svg) }
      }
    }

    const svgTurtleBootstrap = hasTurtleForMode && appSettings.turtleMode === 'basthon-svg' ? SVG_TURTLE_WORKER_SETUP : ''
    worker.postMessage({ type: 'init', sab: sabRef.current.sab, code: codeText, files: vfsFiles, cwd: capturedCwd, svgTurtleBootstrap })
  }

  const startMainThreadRun = async () => {
    if (!hasCode) return
    if (pendingRestore) pendingRestore()
    setPendingRestore(null)
    await saveCurrentToVFS()
    const vfsFiles = await getAllFiles(activeFilesystemId)
    const capturedFsId = activeFilesystemId
    const capturedCwd = currentWorkingDir

    const runId = ++mainThreadRunIdRef.current
    mainThreadAbandonedRef.current = false
    const shouldRunPygame = codeUsesPygame(codeText)
    const shouldRunTurtle = !shouldRunPygame && codeUsesTurtle(codeText)
    const turtleMode = shouldRunTurtle ? appSettings.turtleMode : null
    const shouldRunTurtleCanvas = turtleMode === 'pyo-js-turtle'
    const shouldRunTurtleSvg = turtleMode === 'basthon-svg'

    mainThreadStopRequestedRef.current = false
    if (shouldRunPygame) enterPygamePresentationMode()
    else if (shouldRunTurtleCanvas) enterTurtleCanvasPresentationMode()
    else if (shouldRunTurtleSvg) enterSvgTurtlePresentationMode()
    else enterConsolePresentationMode()

    resetExecutionState()
    resetTurtleHistory()
    if (shouldRunPygame || shouldRunTurtleCanvas) clearMainThreadCanvas()
    setIsRunning(true); setActiveRuntime('main-thread')
    setCodeStatus('Main-thread runtime starting...')
    setMainThreadStatus(
      shouldRunPygame ? 'Loading Pyodide 0.29.3 and pygame-ce on the main thread...' :
      shouldRunTurtleCanvas ? 'Loading Pyodide 0.29.3 for turtle canvas...' :
      'Loading Pyodide 0.29.3 on the main thread...'
    )

    const turtlePendingKeys: string[] = []
    let turtleKeyListener: ((e: KeyboardEvent) => void) | null = null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pyodide: any = null
    try {
      pyodide = await loadMainThreadPyodide()
      if (runId !== mainThreadRunIdRef.current) return

      if (typeof pyodide.setStdout === 'function') pyodide.setStdout({ batched: (text: string) => appendOutput(text) })
      if (typeof pyodide.setStderr === 'function') pyodide.setStderr({ batched: (text: string) => appendOutput('[stderr] ' + text) })
      if (pyodide._api) pyodide._api._skip_unwind_fatal_error = true

      cleanFilesFromPyodide(pyodide, mainThreadMountedPathsRef.current)
      mountFilesToPyodide(pyodide, vfsFiles, capturedCwd)
      mainThreadMountedPathsRef.current = vfsFiles.map(f => f.path)

      if (shouldRunPygame) {
        if (!mainThreadCanvasRef.current) await new Promise<void>(r => requestAnimationFrame(() => r()))
        const canvas = ensureMainThreadCanvas()
        if (!pyodide.canvas?.setCanvas2D) throw new Error('Pyodide canvas support is unavailable.')
        pyodide.canvas.setCanvas2D(canvas)
        focusMainThreadCanvas()
        startMainThreadCanvasWatcher()
      } else if (shouldRunTurtleCanvas) {
        if (!mainThreadCanvasRef.current) await new Promise<void>(r => requestAnimationFrame(() => r()))
        ensureMainThreadCanvas()
        focusMainThreadCanvas()
        startMainThreadCanvasWatcher()
      }

      setMainThreadStatus(shouldRunPygame ? 'Loading pygame dependencies from imports...' : 'Loading packages from imports...')
      if (!shouldRunTurtleCanvas && !shouldRunTurtleSvg) {
        await pyodide.loadPackagesFromImports(codeText)
      }
      if (runId !== mainThreadRunIdRef.current) return

      setMainThreadStatus(
        shouldRunPygame ? 'Preparing pygame for browser execution...' :
        shouldRunTurtleCanvas ? 'Running turtle canvas program...' :
        shouldRunTurtleSvg ? 'Running turtle SVG program...' :
        'Executing code on the main thread...'
      )

      const execGlobalsObj: Record<string, unknown> = {
        __name__: '__main__',
        __coder_user_code__: codeText,
        js_input_prompt: (promptText: string) => window.prompt(promptText ?? '') ?? '',
        js_should_stop_main_thread: () => Boolean(mainThreadStopRequestedRef.current),
        js_set_main_thread_status: (message: string) => setMainThreadStatus(String(message ?? '')),
        js_append_main_thread_log: (message: string) => appendOutput(String(message ?? '')),
      }
      if (shouldRunTurtleCanvas) {
        execGlobalsObj.js_turtle_canvas_id = 'canvas'
        execGlobalsObj.js_turtle_resize = (w: number, h: number) => {
          const canvas = mainThreadCanvasRef.current
          if (canvas) { canvas.width = w; canvas.height = h }
        }
        execGlobalsObj.js_turtle_listen = () => {
          const canvas = mainThreadCanvasRef.current
          if (!canvas) return
          turtleKeyListener = (e: KeyboardEvent) => { turtlePendingKeys.push(e.key); e.preventDefault() }
          canvas.addEventListener('keydown', turtleKeyListener)
          canvas.focus()
        }
        execGlobalsObj.js_turtle_poll_keys = () => pyodide.toPy(turtlePendingKeys.splice(0))
      }
      if (shouldRunTurtleSvg) {
        execGlobalsObj.js_turtle_update_svg = (svg: string) => {
          const svgStr = String(svg ?? '')
          setTurtleSvg(svgStr)
          if (svgStr) { setDiagramView('turtle'); addToTurtleHistory(svgStr) }
        }
      }
      const execGlobals = pyodide.toPy(execGlobalsObj)

      try {
        if (shouldRunPygame) {
          await pyodide.loadPackage('pygame-ce')
          await pyodide.runPythonAsync(PYGAME_MAIN_THREAD_BOOTSTRAP, { globals: execGlobals })
        } else if (shouldRunTurtleCanvas) {
          await pyodide.runPythonAsync(TURTLE_CANVAS_BOOTSTRAP, { globals: execGlobals })
        } else if (shouldRunTurtleSvg) {
          await pyodide.runPythonAsync(TURTLE_SVG_BOOTSTRAP, { globals: execGlobals })
        } else {
          await pyodide.runPythonAsync(`
import builtins
def __coder_prompt_input(prompt=""): return js_input_prompt(prompt)
builtins.input = __coder_prompt_input
code_obj = compile(__coder_user_code__, "simulation.py", "exec")
exec(code_obj, globals())
          `, { globals: execGlobals })
        }
      } finally {
        execGlobals.destroy?.()
        if (turtleKeyListener && mainThreadCanvasRef.current) {
          mainThreadCanvasRef.current.removeEventListener('keydown', turtleKeyListener)
        }
      }

      if (runId !== mainThreadRunIdRef.current) return
      if (pyodide) {
        try {
          const updatedFiles = readFilesFromPyodide(pyodide, vfsFiles.map(f => f.path), capturedCwd)
          await syncFilesFromPyodide(capturedFsId, updatedFiles)
          setVfsReloadTrigger(t => t + 1)
        } catch { /* ignore */ }
      }
      const wasStopRequested = Boolean(mainThreadStopRequestedRef.current)
      appendOutput(wasStopRequested ? '\n[MAIN-THREAD RUN STOPPED]' : '\n[MAIN-THREAD RUN FINISHED]')
      setCodeStatus(wasStopRequested ? 'Main-thread runtime stopped.' : 'Main-thread runtime finished.')
      setMainThreadStatus(wasStopRequested ? 'Main-thread run stopped.' : 'Main-thread run finished.')
      setIsRunning(false); setActiveRuntime('')
    } catch (error) {
      if (runId !== mainThreadRunIdRef.current) return
      if (pyodide) {
        try {
          const updatedFiles = readFilesFromPyodide(pyodide, vfsFiles.map(f => f.path), capturedCwd)
          void syncFilesFromPyodide(capturedFsId, updatedFiles).then(() => setVfsReloadTrigger(t => t + 1))
        } catch { /* ignore */ }
      }
      const message = error instanceof Error ? error.message : String(error)
      appendOutput('\n[ERROR] ' + message)
      setCodeStatus('Main-thread runtime failed.')
      setMainThreadStatus('Main-thread run failed. See console output for details.')
      setIsRunning(false); setActiveRuntime('')
    } finally {
      mainThreadStopRequestedRef.current = false
      stopMainThreadCanvasWatcher({ restoreSnapshot: shouldRunPygame || shouldRunTurtleCanvas })
      if (!mainThreadAbandonedRef.current) {
        const restore = shouldRunPygame ? restorePygamePresentationMode
          : shouldRunTurtleCanvas ? restoreTurtleCanvasPresentationMode
          : shouldRunTurtleSvg ? () => { restoreSvgTurtlePresentationMode(); closeScrubberAndClear() }
          : restoreConsolePresentationMode
        setPendingRestore(() => restore)
      }
      mainThreadAbandonedRef.current = false
    }
  }

  const sendTraceCommand = (cmd: number) => {
    if (!sabRef.current) return
    const { int32 } = sabRef.current
    if (Atomics.load(int32, 0) === 1) {
      if (turtleScrubLockedRef.current) {
        turtleScrubLockedRef.current = false
        setTurtleScrubPlaying(false)
        setTurtleScrubStep(turtleSvgHistoryRef.current.length - 1)
      }
      const bpArr = [...breakpointsRef.current]
      int32[500] = bpArr.length
      bpArr.forEach((ln, i) => { if (i < 99) int32[501 + i] = ln })
      Atomics.store(int32, 1, cmd); Atomics.store(int32, 0, 0); Atomics.notify(int32, 0, 1)
    }
  }

  const handleInputSubmit = (submittedValue = inputValue) => {
    if (!sabRef.current) return
    const { int32, uint8 } = sabRef.current
    if (Atomics.load(int32, 0) === 2) {
      const encoder = new TextEncoder()
      const bytes = encoder.encode(submittedValue)
      const safeBytes = bytes.slice(0, uint8.length - 12)
      int32[2] = safeBytes.length; uint8.fill(0, 12); uint8.set(safeBytes, 12)
      Atomics.store(int32, 0, 0); Atomics.notify(int32, 0, 1)
      setInputRequest(null); setInputValue('')
    }
  }

  const forceStop = () => {
    if (workerRef.current) {
      workerRef.current.terminate(); workerRef.current = null; sabRef.current = null
      setCodeStatus('Worker runtime stopped.')
      if (workerRunModeRef.current === 'run') {
        const inSvgMode = svgTurtleLayoutSnapshotRef.current !== null
        setPendingRestore(() => inSvgMode
          ? () => { restoreSvgTurtlePresentationMode(); closeScrubberAndClear() }
          : restoreConsolePresentationMode)
      }
      workerRunModeRef.current = 'trace'
    } else if (activeRuntime === 'main-thread') {
      if (isPygameRunActive || isTurtleCanvasRunActive) {
        mainThreadStopRequestedRef.current = true
        appendOutput('\n[INFO] Stop requested for main-thread run.')
        setMainThreadStatus('Stopping main-thread run...')
        return
      }
      mainThreadAbandonedRef.current = true
      mainThreadRunIdRef.current++
      setIsRunning(false)
      setActiveRuntime('')
      setMainThreadStatus('Main-thread run stopped.')
      appendOutput('\n[INFO] Main-thread run stopped.')
      const restoreFn = isConsolePresentationMode ? restoreConsolePresentationMode
        : svgTurtleLayoutSnapshotRef.current ? () => { restoreSvgTurtlePresentationMode(); closeScrubberAndClear() }
        : null
      if (restoreFn) setPendingRestore(() => restoreFn)
      return
    }
    setIsRunning(false); setActiveRuntime(''); setCurrentLine(-1); setCurrentFunc(''); setCurrentClass('')
    setSimState(null); setInputRequest(null); setInputValue('')
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden text-sm">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 flex justify-between items-center px-6 py-3 shadow-md z-10">
        <div className="flex items-center gap-3">
          <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          <h1 className="text-xl font-bold tracking-wider">Coder</h1>
        </div>

        <div className="flex items-center gap-3">
          <PanelVisibilityMenu menuRef={panelMenuRef} isOpen={isPanelMenuOpen}
            onToggleOpen={() => { setIsRuntimeMenuOpen(false); setIsPanelMenuOpen(o => !o) }}
            panelOptions={PANEL_OPTIONS} visiblePanels={visiblePanels} onTogglePanel={togglePanelVisibility}
            buttonHoverClass="hover:border-emerald-400" checkboxAccent="#34d399" disabled={isPygameRunActive || isConsolePresentationMode || isTurtleCanvasRunActive}
            onRestoreDefaults={handleRestoreDefaults}
            savedLayouts={savedLayouts}
            onSaveLayout={handleSaveLayout}
            onRestoreLayout={handleRestoreLayout}
            onDeleteLayout={handleDeleteLayout} />
          <RuntimeSettingsMenu menuRef={runtimeMenuRef} isOpen={isRuntimeMenuOpen}
            onToggleOpen={() => { setIsPanelMenuOpen(false); setIsRuntimeMenuOpen(o => !o) }}
            runtimePreference={runtimePreference} selectedRuntime={selectedRuntime}
            onSelectRuntime={key => { setRuntimePreference(key); setIsRuntimeMenuOpen(false) }}
            isPygameLocked={isPygameLocked || isTurtleLocked} hasSab={hasSab} disabled={isRunning} />
          <div ref={quickSettingsRef} className="relative">
            <button type="button" title="Settings"
              onClick={() => { setIsPanelMenuOpen(false); setIsRuntimeMenuOpen(false); setIsQuickSettingsOpen(o => !o) }}
              className={`rounded border p-1.5 transition-colors ${isQuickSettingsOpen ? 'border-slate-400 text-slate-200' : 'border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200'}`}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            {isQuickSettingsOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-50 w-52 rounded-lg border border-slate-600 bg-slate-800 shadow-xl py-1">
                <button type="button"
                  onClick={() => setAppSettings(s => ({ ...s, useFixedInputs: !s.useFixedInputs }))}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors">
                  <span className={`flex h-4 w-4 items-center justify-center rounded border text-xs ${appSettings.useFixedInputs ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-slate-500'}`}>
                    {appSettings.useFixedInputs && '✓'}
                  </span>
                  Use Fixed Inputs
                </button>
                <div className="my-1 border-t border-slate-700" />
                <button type="button"
                  onClick={() => { handlePyodideReset(); setIsQuickSettingsOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-400 hover:bg-slate-700 hover:text-amber-300 transition-colors">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h5M20 20v-5h-5M5.64 18.36A9 9 0 1020 12" />
                  </svg>
                  Reset Pyodide…
                </button>
                <button type="button"
                  onClick={() => { setIsSettingsOpen(true); setIsQuickSettingsOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors">
                  More settings…
                </button>
              </div>
            )}
          </div>
          <ThemeToggleButton theme={theme} onToggle={toggleTheme} />

          {!isRunning ? (
            selectedRuntime === 'trace-worker' ? (
              /* ── Split run button ───────────────────────────────────────── */
              <div ref={runDropdownRef} className="relative flex">
                <button
                  onClick={() => void startTraceWorker()}
                  disabled={!hasCode || !hasSab}
                  className={`rounded-l px-5 py-2 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-white ${
                    runModeChoice === 'trace' ? 'bg-emerald-600 hover:bg-emerald-500' :
                    runModeChoice === 'run'   ? 'bg-sky-600 hover:bg-sky-500' :
                                               'bg-violet-600 hover:bg-violet-500'
                  }`}
                >
                  {runModeChoice === 'trace' ? 'Trace' : runModeChoice === 'run' ? 'Run' : 'Break Run'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsRunDropdownOpen(o => !o)}
                  disabled={!hasCode || !hasSab}
                  title="Choose run mode"
                  className={`rounded-r border-l border-white/20 px-2 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-white ${
                    runModeChoice === 'trace' ? 'bg-emerald-600 hover:bg-emerald-500' :
                    runModeChoice === 'run'   ? 'bg-sky-600 hover:bg-sky-500' :
                                               'bg-violet-600 hover:bg-violet-500'
                  }`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isRunDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-lg border border-slate-600 bg-slate-800 shadow-xl py-1">
                    {([
                      { key: 'trace' as const, label: 'Trace', desc: 'Step through each line', color: 'text-emerald-300' },
                      { key: 'run'   as const, label: 'Run',   desc: 'Run without stopping',  color: 'text-sky-300' },
                      { key: 'break' as const, label: 'Break', desc: 'Run until first breakpoint', color: 'text-violet-300', disabled: breakpoints.size === 0 },
                    ] as Array<{ key: 'trace' | 'run' | 'break'; label: string; desc: string; color: string; disabled?: boolean }>).map(({ key, label, desc, color, disabled }) => (
                      <button
                        key={key}
                        type="button"
                        disabled={disabled}
                        onClick={() => { setRunModeChoice(key); setIsRunDropdownOpen(false) }}
                        className={`w-full px-3 py-2.5 text-left transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-700'}`}
                      >
                        <div className={`font-semibold text-sm flex items-center gap-1.5 ${runModeChoice === key ? color : 'text-slate-200'}`}>
                          {runModeChoice === key && <span className="text-[10px]">✓</span>}
                          {label}
                          {disabled && <span className="ml-auto text-[9px] font-normal text-slate-500">no breakpoints</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <button onClick={() => void startMainThreadRun()} disabled={!hasCode}
                  className="bg-sky-600 hover:bg-sky-500 text-white px-5 py-2 rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  Run
                </button>
                <button onClick={handlePyodideReset}
                  title="Reset Pyodide environment (clears Python state, keeps files)"
                  className="rounded border border-slate-600 p-1.5 text-slate-400 hover:border-amber-400 hover:text-amber-300 transition-colors">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </>
            )
          ) : activeRuntime === 'trace-worker' && currentLine > 0 && !isConsolePresentationMode ? (
            /* ── Step controls ──────────────────────────────────────────── */
            <>
              <button onClick={() => sendTraceCommand(TRACE_CMD_STEP_INTO)} disabled={inputRequest !== null}
                title="Step Into (F11)"
                className="bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                {/* Step Into: arrow going down into a call */}
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="3" x2="12" y2="15"/>
                  <polyline points="8 11 12 15 16 11"/>
                  <path d="M8 19h8"/>
                </svg>
                Into
              </button>
              <button onClick={() => sendTraceCommand(TRACE_CMD_STEP_OVER)} disabled={inputRequest !== null}
                title="Step Over (F10)"
                className="bg-teal-700 hover:bg-teal-600 text-white px-4 py-2 rounded font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                {/* Step Over: arrow jumping over a block */}
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12 Q5 5 12 5 Q19 5 19 12"/>
                  <polyline points="15 8 19 12 23 8"/>
                  <line x1="5" y1="19" x2="19" y2="19"/>
                </svg>
                Over
              </button>
              <button onClick={() => sendTraceCommand(TRACE_CMD_STEP_OUT_BLOCK)} disabled={inputRequest !== null}
                title="Step Out"
                className="bg-cyan-700 hover:bg-cyan-600 text-white px-4 py-2 rounded font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                {/* Step Out: arrow going up and out */}
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="21" x2="12" y2="9"/>
                  <polyline points="8 13 12 9 16 13"/>
                  <path d="M8 5h8"/>
                </svg>
                Out
              </button>
              <button onClick={() => sendTraceCommand(TRACE_CMD_CONTINUE)} disabled={inputRequest !== null}
                title="Continue (F5)"
                className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                {/* Continue: play/resume triangle */}
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21"/>
                </svg>
                Continue
              </button>
              <button onClick={forceStop} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded font-semibold transition-colors">Stop</button>
            </>
          ) : (activeRuntime === 'trace-worker' && (isConsolePresentationMode || currentLine <= 0)) ? (
            <div className="flex items-center overflow-hidden rounded border border-sky-500/70 bg-sky-900/30 text-sm font-semibold text-sky-100">
              <div className="px-4 py-2">
                {workerRunModeRef.current === 'break' ? 'Running to breakpoint…' : 'Worker running'}
              </div>
              <button type="button" onClick={forceStop}
                className="self-stretch border-l border-sky-500/70 bg-red-700 px-3 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-red-600">
                Stop
              </button>
            </div>
          ) : (
            <div className="flex items-center overflow-hidden rounded border border-amber-500/70 bg-amber-900/30 text-sm font-semibold text-amber-100">
              <div className="px-4 py-2">Main-thread execution running</div>
              <button type="button" onClick={forceStop}
                className="self-stretch border-l border-amber-500/70 bg-red-700 px-3 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-red-600">
                Stop
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SAB warning */}
      {!hasSab && selectedRuntime === 'trace-worker' && (
        <div className="m-4 rounded border border-red-500 bg-red-900/50 p-4 text-red-200">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <strong>Trace-worker Warning:</strong> Step tracing requires Cross-Origin Isolation plus <code>SharedArrayBuffer</code>.{' '}
              <code>window.crossOriginIsolated</code> is <code>{String(isCrossOriginIsolated)}</code>.{' '}
              Run with <code>npm run dev</code> or <code>npm start</code> on the built output.
              <div className="mt-2 text-sm text-red-100">
                You can switch to main-thread execution instead. That uses browser prompt pop-ups for input, and step debugging plus live inspection are currently disabled there.
              </div>
            </div>
            <button type="button" onClick={() => { setRuntimePreference('main-thread'); setIsRuntimeMenuOpen(false) }}
              className="shrink-0 rounded border border-amber-400 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/25">
              Use Main Thread
            </button>
          </div>
        </div>
      )}

      {/* Pygame / turtle canvas banner */}
      {(isPygameRunActive || isTurtleCanvasRunActive) && (
        <div className="flex-shrink-0 border-b border-sky-700 bg-sky-950/80 px-5 py-2 text-sm text-sky-100 shadow-md">
          {isPygameRunActive ? 'pygame' : 'turtle'} is running in the main page thread. Debugging and live inspection are disabled while it runs. Click inside the canvas panel to focus keyboard controls.
        </div>
      )}



      {/* Popup dialog — always in DOM, shown via showModal() when needed */}
      <dialog ref={popupDialogRef}
        className="rounded-xl border border-slate-600 bg-slate-800 p-6 shadow-2xl w-full max-w-sm backdrop:bg-slate-900/70"
        onCancel={e => e.preventDefault()}>
        <div className="flex flex-col gap-4">
          <div className="text-sm font-mono text-amber-300">
            {inputRequest?.prompt || 'Input required:'}
          </div>
          <input
            type="text"
            value={popupInputValue}
            autoFocus
            className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-400 font-mono"
            placeholder="Enter value..."
            onChange={e => setPopupInputValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { handleInputSubmit(popupInputValue); setPopupInputValue('') } }}
          />
          <div className="flex gap-2 justify-end">
            <button type="button"
              onClick={() => { forceStop(); setPopupInputValue('') }}
              className="rounded border border-slate-600 px-4 py-1.5 text-sm font-semibold text-red-400 hover:text-red-300 hover:border-red-500 transition-colors">
              Stop
            </button>
            <button type="button"
              onClick={() => { handleInputSubmit(popupInputValue); setPopupInputValue('') }}
              className="rounded bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-white transition-colors">
              OK
            </button>
          </div>
        </div>
      </dialog>

      {/* Post-run return bar */}
      {(pendingRestore || (isConsolePresentationMode && !isRunning)) && (
        <div
          className="flex-shrink-0 flex items-center justify-between border-b border-emerald-600/50 bg-emerald-900/30 px-5 py-2.5 cursor-pointer hover:bg-emerald-900/50 transition-colors"
          onClick={() => { if (pendingRestore) { pendingRestore(); setPendingRestore(null) } else { restoreConsolePresentationMode() } }}
          role="button"
        >
          <span className="text-sm text-emerald-100">Execution ended — click here to return to the editor.</span>
          <span className="flex-shrink-0 rounded border border-emerald-600/60 px-3 py-0.5 text-xs font-semibold text-emerald-300">Return to editor</span>
        </div>
      )}

      {/* Main Layout */}
      <div ref={mainContainerRef} className="flex-1 flex overflow-hidden p-2 gap-1.5">

        {/* LEFT SIDEBAR: File System (top) + Variable Inspector (bottom) */}
        {hasLeftSidebar && (
          <>
            <div ref={leftSidebarRef}
              className="flex-shrink-0 bg-slate-800 rounded-lg shadow border border-slate-700 flex flex-col overflow-hidden"
              style={{ width: fsSidebarWidth }}>

              {/* File System */}
              {visiblePanels.filesystem && (
                <div className="flex flex-col overflow-hidden min-h-0 flex-shrink-0"
                  style={{ height: hasInspectorAndFs ? `${leftSidebarSplit}%` : '100%' }}>
                  <div className="bg-slate-900 py-2 px-3 border-b border-slate-700 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0">
                    File System
                  </div>
                  <div className="overflow-hidden min-h-0 flex-1">
                    <FileSystemPanel
                      activeFilesystemId={activeFilesystemId}
                      currentWorkingDir={currentWorkingDir}
                      openFilePath={openFilePath}
                      hiddenPaths={challengeHiddenPaths}
                      isChallengeMode={!!bookNavState?.activeChallengeId}
                      onFilesystemChange={id => void handleFilesystemChange(id)}
                      onFilesystemForcedChange={handleFilesystemForcedChange}
                      onCwdChange={setCurrentWorkingDir}
                      onOpenFile={entry => void onOpenVFSFile(entry)}
                      onError={msg => setCodeStatus(msg)}
                      onBookOpen={url => void handleBookOpen(url)}
                      onLocalFileImport={(m, n) => handleLocalFileImport(m, n)}
                      onFolderConnect={h => handleFolderConnect(h)}
                      reloadTrigger={vfsReloadTrigger}
                    />
                  </div>
                </div>
              )}

              {/* Resize handle: FS ↔ Inspector */}
              {hasInspectorAndFs && (
                <div className="resize-handle-row flex-shrink-0"
                  onMouseDown={e => { e.preventDefault(); resizeDragRef.current = { type: 'row-leftsidebar', startX: e.clientX, startY: e.clientY, startVal: leftSidebarSplit }; document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none' }}>
                  <div className="resize-bar" style={{ height: '3px', width: '48px' }} />
                </div>
              )}

              {/* Variable Inspector */}
              {visiblePanels.visualizer && (
                <div ref={inspectorRef} className="flex-1 flex flex-col overflow-hidden min-h-0">
                  <div className="bg-slate-900 py-2 px-3 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
                    <div className="font-bold uppercase tracking-wider text-[10px] text-sky-300">Variables</div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] uppercase tracking-wider ${hasSab ? 'text-emerald-400' : 'text-red-400'}`}>
                        {hasSab ? 'SAB ✓' : 'SAB ✗'}
                      </span>
                      {isRunning && activeRuntime === 'main-thread' && (
                        <span className="text-[10px] text-amber-400 truncate max-w-[100px]">{mainThreadStatus}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                    {/* Globals */}
                    <div className="overflow-hidden min-h-0 flex flex-col"
                      style={{ flex: inspectorCollapsed.globals ? '0 0 auto' : (!currentFunc || inspectorCollapsed.locals) ? '1 1 0' : `0 0 ${inspectorSplit}%` }}>
                      <InspectorPane title="Global Variables" root={globalsInspectorRoot}
                        path={globalsInspectorPath} setPath={setGlobalsInspectorPath}
                        emptyMessage="Run code to see globals."
                        unavailableMessage={isMainThreadRuntime ? 'Live inspection unavailable in main-thread mode.' : ''}
                        isCollapsed={inspectorCollapsed.globals}
                        onToggleCollapsed={() => setInspectorCollapsed(c => ({ ...c, globals: !c.globals }))} />
                    </div>
                    {/* Locals */}
                    {currentFunc && (
                      <>
                        {!inspectorCollapsed.globals && !inspectorCollapsed.locals && (
                          <div className="resize-handle-row flex-shrink-0"
                            onMouseDown={e => { e.preventDefault(); resizeDragRef.current = { type: 'row-inspector', startX: e.clientX, startY: e.clientY, startVal: inspectorSplit }; document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none' }}>
                            <div className="resize-bar" style={{ height: '3px', width: '48px' }} />
                          </div>
                        )}
                        <div className="overflow-hidden min-h-0 flex flex-col"
                          style={{ flex: inspectorCollapsed.locals ? '0 0 auto' : '1 1 0' }}>
                          <InspectorPane title="Local Variables" root={localsInspectorRoot}
                            path={localsInspectorPath} setPath={setLocalsInspectorPath}
                            emptyMessage="Waiting for code to enter a function..."
                            unavailableMessage={isMainThreadRuntime ? 'Live inspection unavailable in main-thread mode.' : ''}
                            isCollapsed={inspectorCollapsed.locals}
                            onToggleCollapsed={() => setInspectorCollapsed(c => ({ ...c, locals: !c.locals }))} />
                        </div>
                      </>
                    )}
                    {/* Watches */}
                    <div className="border-t border-slate-700 overflow-hidden flex flex-col"
                      style={{ flex: inspectorCollapsed.watches ? '0 0 auto' : '0 0 140px', minHeight: 0 }}>
                      <div className="flex-shrink-0 px-3 py-2 flex items-center justify-between">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Watches</div>
                        <div className="flex items-center gap-1">
                          <button type="button"
                            onClick={() => { const expr = window.prompt('Watch expression:'); if (expr?.trim()) setWatches(w => [...w, expr.trim()]) }}
                            title="Add watch" className="text-[11px] text-slate-500 hover:text-emerald-300 transition-colors px-1 rounded">[+]</button>
                          {watches.length > 0 && (
                            <button type="button" onClick={() => setWatches([])} title="Clear all watches"
                              className="text-[10px] text-slate-500 hover:text-red-400 transition-colors px-1 rounded">clear</button>
                          )}
                          <button type="button"
                            onClick={() => setInspectorCollapsed(c => ({ ...c, watches: !c.watches }))}
                            title={inspectorCollapsed.watches ? 'Expand' : 'Collapse'}
                            className="text-slate-500 hover:text-slate-300 transition-colors">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              {inspectorCollapsed.watches
                                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />}
                            </svg>
                          </button>
                        </div>
                      </div>
                      {!inspectorCollapsed.watches && (
                        <div className="flex-1 overflow-y-auto">
                          {watches.length === 0
                            ? <div className="px-3 py-2 text-xs text-slate-500 italic">No watches. Click [+] to add.</div>
                            : <div className="p-2 flex flex-col gap-1">
                                {watches.map((expr, idx) => (
                                  <div key={idx} className="flex items-center gap-2 rounded border border-slate-700 bg-slate-900/40 px-2 py-1.5">
                                    <span className="flex-1 font-mono text-xs text-slate-200 truncate">{expr}</span>
                                    <span className="text-xs text-emerald-300 truncate max-w-[60px]" title={getWatchValue(expr)}>{getWatchValue(expr)}</span>
                                    <button type="button" onClick={() => setWatches(w => w.filter((_, j) => j !== idx))}
                                      className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0" title="Remove watch">
                                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                ))}
                              </div>
                          }
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Resize handle: left sidebar width */}
            <div className="resize-handle-col"
              onMouseDown={e => { e.preventDefault(); resizeDragRef.current = { type: 'col-fssidebar', startX: e.clientX, startY: e.clientY, startVal: fsSidebarWidth }; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none' }}>
              <div className="resize-bar" style={{ width: '3px', height: '48px' }} />
            </div>
          </>
        )}

        {/* CENTER: Code Editor + Right Column */}
        {(visiblePanels.code || hasRightCol) && (
        <div ref={centerRef} className="flex-1 flex overflow-hidden gap-1.5 min-w-0">

        {/* Code Editor */}
        {visiblePanels.code && (
          <div className="bg-slate-800 rounded-lg shadow border border-slate-700 flex flex-col overflow-hidden flex-shrink-0"
            style={{ width: hasRightCol ? `calc(${leftWidth}% - 6px)` : '100%' }}>
            {/* Code editor area */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
              <input ref={fileInputRef} type="file" className="hidden" aria-hidden="true" onChange={handleCodeFileChange} />
              <div className="bg-slate-900 py-2 px-4 border-b border-slate-700 text-slate-400 text-xs flex-shrink-0">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="font-bold uppercase tracking-wider truncate flex items-center gap-1.5">
                      {isUnsaved && <span className="inline-block w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved changes" />}
                      Code Trace ({openFilePath ? openFilePath : (codeFileName || DEFAULT_CODE_FILENAME)})
                    </div>
                    <div className="mt-1 normal-case tracking-normal text-[11px] text-slate-500">{codeStatus}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Editor font size dropdown */}
                    <select
                      value={editorFontSize}
                      onChange={e => {
                        const sz = parseInt(e.target.value, 10)
                        setEditorFontSize(sz)
                        editorRef.current?.updateOptions({ fontSize: sz })
                      }}
                      title="Editor font size"
                      className="bg-slate-800 border border-slate-600 rounded text-[11px] text-slate-300 px-1.5 py-0.5 focus:outline-none hover:border-slate-400 cursor-pointer"
                    >
                      {[8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,28,32,36,40].map(sz => (
                        <option key={sz} value={sz}>{sz}px</option>
                      ))}
                    </select>
                    <IconButton title="New file in virtual filesystem" onClick={handleNewFileButton} disabled={isRunning}>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                      </svg>
                    </IconButton>
                    <IconButton title="Upload file to virtual filesystem" onClick={handleLoadButtonClick} disabled={isRunning}>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                    </IconButton>
                    <IconButton title="Save to virtual filesystem" onClick={() => void handleSaveCode()} disabled={!hasCode || isRunning}>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8" />
                      </svg>
                    </IconButton>
                    <IconButton title="Download to OS filesystem" onClick={() => triggerDownload(codeFileName, codeText, 'text/x-python;charset=utf-8')} disabled={!hasCode}>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </IconButton>
                    <IconButton title="Clear all breakpoints" onClick={() => { breakpointsRef.current = new Set(); setBreakpoints(new Set()) }} disabled={breakpoints.size === 0}>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </IconButton>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-hidden relative">
                {openFilePath === null ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500 bg-slate-950">
                    <svg className="w-10 h-10 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-sm">Open a file to start editing</span>
                  </div>
                ) : (
                  <>
                    {!isEditorReady && (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm z-10">Loading Monaco editor...</div>
                    )}
                    <Editor
                      height="100%"
                      language="python"
                      theme={theme === 'light' ? 'as-tracer-light' : 'as-tracer-dark'}
                      value={codeText}
                      onChange={handleEditorChange}
                      beforeMount={handleEditorBeforeMount}
                      onMount={handleEditorMount}
                      options={{
                        glyphMargin: true,
                        minimap: { enabled: false },
                        lineNumbersMinChars: 4,
                        scrollBeyondLastLine: false,
                        smoothScrolling: true,
                        tabSize: 4,
                        insertSpaces: true,
                        fontSize: editorFontSize,
                        padding: { top: 14, bottom: 18 },
                        renderLineHighlight: 'none',
                        wordWrap: 'off',
                        readOnly: isRunning,
                      }}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Resize handle: code ↔ right column */}
        {visiblePanels.code && hasRightCol && (
          <div className="resize-handle-col"
            onMouseDown={e => { e.preventDefault(); resizeDragRef.current = { type: 'col-main', startX: e.clientX, startY: e.clientY, startVal: leftWidth }; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none' }}>
            <div className="resize-bar" style={{ width: '3px', height: '48px' }} />
          </div>
        )}

        {/* RIGHT COLUMN: Console Output (top) + Structure (bottom) */}
        {hasRightCol && (
          <div ref={rightColRef} className="flex-1 bg-slate-800 rounded-lg shadow border border-slate-700 flex flex-col overflow-hidden min-w-0">

            {/* Console Output */}
            {visiblePanels.output && (
              <div className="flex flex-col overflow-hidden min-h-0 flex-shrink-0"
                style={{ height: hasConsoleAndStructure ? `${rightColSplit}%` : '100%' }}>
                <div className="bg-slate-900 py-2 px-3 border-b border-slate-700 flex-shrink-0 flex items-center justify-between gap-2">
                  <div className="font-bold uppercase tracking-wider text-xs text-teal-400">Console Output</div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider">Size</label>
                    <select
                      value={consoleFontSize}
                      onChange={e => setConsoleFontSize(Number(e.target.value))}
                      title="Console font size"
                      className="bg-slate-800 border border-slate-600 rounded text-[11px] text-slate-300 px-1 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      {[9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24].map(s => (
                        <option key={s} value={s}>{s}px</option>
                      ))}
                    </select>
                  </div>
                </div>
                {appSettings.inputMode === 'inline-console' ? (
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <ConsoleTerminal
                      ref={consoleTermRef}
                      inputRequest={inputRequest}
                      onInput={handleInputSubmit}
                      onStop={forceStop}
                      fontSize={consoleFontSize}
                      theme={theme}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col flex-1 overflow-hidden bg-slate-900/40 min-h-0">
                    <div ref={outputRef} className="flex-1 overflow-y-auto font-mono text-xs leading-relaxed text-slate-300 whitespace-pre-wrap break-words p-3">
                      {outputLog || <span className="text-slate-500 italic">Console output will appear here.</span>}
                    </div>
                    {/* Inline input for input-bar mode */}
                    {inputRequest !== null && appSettings.inputMode === 'input-bar' && !(appSettings.useFixedInputs && fixedInputsQueueRef.current.length > 0) && (
                      <div className="flex-shrink-0 border-t border-amber-500/40 bg-slate-900/60 px-3 py-2 flex items-center gap-2">
                        <span className="flex-shrink-0 font-mono text-xs text-amber-300 truncate max-w-[200px]">
                          {inputRequest.prompt || '>>>'}
                        </span>
                        <input
                          key={inputRequest.id}
                          ref={inlineInputRef}
                          type="text"
                          value={inputValue}
                          className="flex-1 min-w-0 bg-transparent border-none outline-none font-mono text-xs text-white caret-amber-400"
                          placeholder="type here and press Enter…"
                          onChange={e => setInputValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleInputSubmit() }}
                        />
                        <button type="button" onClick={forceStop}
                          className="flex-shrink-0 text-[10px] font-semibold text-red-400 hover:text-red-300 border border-slate-600 rounded px-1.5 py-0.5 transition-colors">
                          Stop
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Resize handle: console ↔ structure */}
            {hasConsoleAndStructure && (
              <div className="resize-handle-row flex-shrink-0"
                onMouseDown={e => { e.preventDefault(); resizeDragRef.current = { type: 'row-rightcol', startX: e.clientX, startY: e.clientY, startVal: rightColSplit }; document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none' }}>
                <div className="resize-bar" style={{ height: '3px', width: '48px' }} />
              </div>
            )}

            {/* Structure panel */}
            {visiblePanels.diagram && (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="bg-slate-900 py-2 px-4 border-b border-slate-700 flex-shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold uppercase tracking-wider text-xs text-emerald-400">
                      {isPygameRunActive ? 'Pygame Canvas' : isTurtleCanvasRunActive ? 'Turtle Canvas' : 'Structure'}
                    </div>
                    <div className="flex items-center gap-2">
                      {!isPygameRunActive && !isTurtleCanvasRunActive && (
                        <div className="flex rounded overflow-hidden border border-slate-700 text-[11px]">
                          {(['outline', 'hierarchy', 'uml', ...(turtleSvg ? ['turtle'] : []), 'notes', ...(appSettings.useFixedInputs ? ['inputs'] : [])] as DiagramView[]).map(view => (
                            <button type="button" key={view} onClick={() => setDiagramView(view)}
                              className={`px-2.5 py-1 ${diagramView === view ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                              {view === 'outline' ? 'Outline' : view === 'hierarchy' ? 'Hierarchy' : view === 'uml' ? 'Class' : view === 'turtle' ? 'Turtle' : view === 'notes' ? 'Notes' : 'Inputs'}
                            </button>
                          ))}
                        </div>
                      )}
                      {!isPygameRunActive && !isTurtleCanvasRunActive && diagramView !== 'outline' && diagramView !== 'turtle' && diagramView !== 'notes' && diagramView !== 'inputs' && (
                        <DiagramFontControls fontSize={diagramFontSize} onDecrease={decreaseDiagramFontSize} onIncrease={increaseDiagramFontSize}
                          canDecrease={diagramFontSize > DIAGRAM_FONT_MIN} canIncrease={diagramFontSize < DIAGRAM_FONT_MAX} />
                      )}
                    </div>
                  </div>
                </div>
                {!isPygameRunActive && !isTurtleCanvasRunActive && diagramView === 'turtle' && turtleSvgHistory.length > 0 && (
                  <TurtleScrubber
                    history={turtleSvgHistory}
                    step={turtleScrubStep}
                    isPlaying={turtleScrubPlaying}
                    speed={turtleScrubSpeed}
                    onStepChange={s => { setTurtleScrubStep(s); turtleScrubLockedRef.current = s < turtleSvgHistory.length - 1 }}
                    onTogglePlay={() => { if (turtleScrubPlaying) { setTurtleScrubPlaying(false) } else { turtleScrubLockedRef.current = true; if (turtleScrubStep >= turtleSvgHistory.length - 1) setTurtleScrubStep(0); setTurtleScrubPlaying(true) } }}
                    onSpeedChange={s => setTurtleScrubSpeed(s)}
                    onClose={() => { setTurtleScrubPlaying(false); closeScrubberAndClear() }}
                  />
                )}
                <div className="flex-1 overflow-auto p-4 relative min-h-0">
                  {/* Canvas — always in DOM so ref is valid on re-run */}
                  <div className={`mx-auto flex h-full w-full max-w-6xl flex-col ${!(isPygameRunActive || isTurtleCanvasRunActive) ? 'hidden' : ''}`}>
                    <div className="flex-1 rounded-xl border border-slate-600 bg-slate-950/80 p-4">
                      <canvas id="canvas" ref={mainThreadCanvasRef}
                        className="mx-auto block max-h-full max-w-full rounded bg-slate-950"
                        style={{ imageRendering: 'pixelated', outline: 'none' }}
                        onPointerDown={() => mainThreadCanvasRef.current?.focus()} />
                    </div>
                  </div>
                  {!(isPygameRunActive || isTurtleCanvasRunActive) && (
                    diagramView === 'turtle' ? (
                      <div className="mx-auto h-full min-h-[280px] flex items-start justify-center">
                        <div dangerouslySetInnerHTML={{ __html: displayedTurtleSvg }} className="max-w-full" />
                      </div>
                    ) : diagramView === 'notes' ? (
                      <div className="h-full flex flex-col">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <h3 className="text-sm font-bold text-white mb-0.5">{activeInsightHeading}</h3>
                            <div className="text-[11px] uppercase tracking-wider text-slate-500">
                              {hasCustomInsightNote ? 'Custom Note' : effectiveNoteKey === GLOBAL_NOTE_KEY ? 'Module Notes' : 'Default Note'}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {!isInsightEditing ? (
                              <IconButton title="Edit note" onClick={beginEditingInsightNote}>
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M9 13l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 16.536A4 4 0 019.707 17.707L7 18l.293-2.707A4 4 0 018.464 12.536L14.696 6.304" />
                                </svg>
                              </IconButton>
                            ) : (
                              <IconButton title="Save note" onClick={() => saveInsightNote(effectiveNoteKey, noteDraft, true)}>
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                              </IconButton>
                            )}
                            {!isRunning && (
                              <IconButton title="Insert/update docstring in code" onClick={handleInsertDocstring} disabled={!activeInsightText && !noteDraft}>
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                </svg>
                              </IconButton>
                            )}
                            <IconButton title="Reset note to original" onClick={resetInsightNote}>
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h5M20 20v-5h-5M5.64 18.36A9 9 0 1020 12" />
                              </svg>
                            </IconButton>
                            <IconButton title="Export notes" onClick={() => setShowExportDialog(true)} disabled={!canExportNotes}>
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 16V4m0 12l4-4m-4 4l-4-4M5 20h14" />
                              </svg>
                            </IconButton>
                          </div>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col">
                          {isInsightEditing ? (
                            <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
                              className="insight-note-editor min-h-0 flex-1"
                              placeholder="Write your note here..." />
                          ) : (
                            <p className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap text-slate-300 leading-relaxed text-sm">
                              {activeInsightText || <span className="text-slate-500 italic">No note yet. Click the pencil icon to add one.</span>}
                            </p>
                          )}
                          <div className="mt-3 text-[11px] text-slate-500">
                            {isInsightEditing
                              ? 'Click save or move to another definition to commit.'
                              : isRunning
                                ? hasCustomInsightNote ? 'Your saved note is shown here.' : 'The built-in note is shown until you save your own version.'
                                : 'Move the cursor inside a function or class to edit its note, or edit the module-level note here.'}
                          </div>
                        </div>
                        {showExportDialog && (
                          <div className="export-modal-backdrop" onClick={() => setShowExportDialog(false)}>
                            <div className="export-modal-card" onClick={e => e.stopPropagation()}>
                              <div className="text-sm font-bold text-white">Export Notes</div>
                              <p className="mt-2 text-sm text-slate-300 leading-relaxed">Choose a plain text revision outline or an annotated Python file with your notes inserted as docstrings.</p>
                              <div className="mt-4 flex flex-col gap-3">
                                <button type="button" onClick={() => downloadNotesExport('comments')}
                                  className="rounded border border-slate-600 bg-slate-900 px-4 py-3 text-left transition-colors hover:border-emerald-400">
                                  <div className="font-semibold text-slate-200">Comments Only</div>
                                  <div className="mt-1 text-xs text-slate-400">Exports class and function interfaces with the notes listed underneath in code order.</div>
                                </button>
                                <button type="button" onClick={() => downloadNotesExport('docstrings')}
                                  className="rounded border border-slate-600 bg-slate-900 px-4 py-3 text-left transition-colors hover:border-emerald-400">
                                  <div className="font-semibold text-slate-200">Docstrings</div>
                                  <div className="mt-1 text-xs text-slate-400">Exports the current Python code with each note inserted as a function docstring.</div>
                                </button>
                              </div>
                              <div className="mt-4 flex justify-end">
                                <button type="button" onClick={() => setShowExportDialog(false)}
                                  className="rounded border border-slate-600 px-3 py-1.5 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-400">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : diagramView === 'inputs' && appSettings.useFixedInputs ? (
                      <div className="h-full flex flex-col gap-2">
                        <p className="text-xs text-slate-400 leading-relaxed flex-shrink-0">
                          One input value per line. Fed automatically to <code className="rounded bg-slate-700 px-1 text-emerald-300">input()</code> calls in order. Unused lines are preserved for re-runs.
                        </p>
                        <textarea
                          value={fixedInputsText}
                          onChange={e => {
                            setFixedInputsText(e.target.value)
                            persistFixedInputs(activeFilesystemId, e.target.value)
                          }}
                          className="flex-1 min-h-0 bg-slate-900 border border-slate-700 rounded p-2 font-mono text-xs text-slate-200 resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed"
                          placeholder="Enter inputs, one per line..."
                          spellCheck={false}
                        />
                      </div>
                    ) : (
                      <div className="mx-auto h-full min-h-[280px]">
                        {diagramView === 'uml' ? (
                          <UmlDiagram currentClass={currentClass} diagramModel={diagramModel} fontSize={diagramFontSize} />
                        ) : diagramView === 'outline' ? (
                          <OutlinePanel outlineModel={outlineModel} expandedIds={outlineExpandedIds}
                            setExpandedIds={setOutlineExpandedIds} onJumpToLine={jumpToSourceLine} currentLine={currentLine} />
                        ) : (
                          <HierarchyChart currentFunc={currentFunc} hierarchyModel={hierarchyModel} fontSize={diagramFontSize} />
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        </div>
        )}
        {/* end center section */}

        {/* Resize handle: center ↔ book panel */}
        {hasBookPanel && (visiblePanels.code || hasRightCol) && (
          <div className="resize-handle-col"
            onMouseDown={e => { e.preventDefault(); resizeDragRef.current = { type: 'col-bookpanel', startX: e.clientX, startY: e.clientY, startVal: bookPanelWidth }; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none' }}>
            <div className="resize-bar" style={{ width: '3px', height: '48px' }} />
          </div>
        )}

        {/* BOOK PANEL — full height, right edge */}
        {hasBookPanel && (
          <div className="flex-shrink-0 bg-slate-800 rounded-lg shadow border border-slate-700 flex flex-col overflow-hidden"
            style={{ width: bookPanelWidth }}>
            <BookPanel
              navState={bookNavState}
              onNavStateChange={handleBookNavStateChange}
              onEnterChallenge={(bookUrl, challenge, forceReset) => void handleEnterChallenge(bookUrl, challenge, forceReset)}
              onClose={handleCloseBook}
            />
          </div>
        )}
      </div>

      <SettingsDialog isOpen={isSettingsOpen} settings={appSettings} onClose={() => setIsSettingsOpen(false)} onSettingsChange={setAppSettings} />

      {/* Code file save dialog */}
      {showCodeSaveDialog && pendingCodeLoad && (
        <SaveFileDialog
          fsId={activeFilesystemId}
          initialPath={openFilePath ? openFilePath.substring(0, openFilePath.lastIndexOf('/')) || '/' : currentWorkingDir}
          initialName={pendingCodeLoad.name}
          title={pendingCodeLoad.name ? `Save "${pendingCodeLoad.name}"` : 'Save File'}
          onSave={(p, n) => void handleCodeSaveDialogSave(p, n)}
          onCancel={() => { setShowCodeSaveDialog(false); setPendingCodeLoad(null) }}
        />
      )}
    </div>
  )
}
