import { useState, useEffect, useRef, useDeferredValue, startTransition } from 'react'
import Editor, { type Monaco } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import {
  buildPythonStructureModel, analyzePythonClasses, analyzePythonFunctions,
  analyzePythonOutline, cleanCodeText, codeUsesPygame, getExpandableOutlineIds,
} from './utils/codeAnalysis'
import { getStoredTheme, getStoredNoteOverrides, persistNoteOverrides } from './utils/storage'
import { triggerDownload, getBaseFileStem } from './utils/download'
import { buildCommentExport, buildDocstringExport, getDefinitionNote, getDefaultDefinitionNote, sanitizeNoteText } from './utils/export'
import { loadMainThreadPyodide, PYGAME_MAIN_THREAD_BOOTSTRAP } from './utils/mainThread'
import {
  ensureDefaultFilesystem, getAllFiles, syncFilesFromPyodide, writeFile,
  isTextMime, guessMimeType, mountFilesToPyodide, readFilesFromPyodide,
  getEntryByPath, cleanFilesFromPyodide,
} from './utils/virtualFS'
import { FileSystemPanel } from './components/FileSystemPanel'
import { SaveFileDialog } from './components/dialogs/SaveFileDialog'
import { getExplanation, getDefinitionKey } from './data/explanations'
import { ThemeToggleButton } from './components/ui/ThemeToggleButton'
import { RuntimeSettingsMenu } from './components/ui/RuntimeSettingsMenu'
import { PanelVisibilityMenu } from './components/ui/PanelVisibilityMenu'
import { DiagramFontControls } from './components/ui/DiagramFontControls'
import { IconButton } from './components/ui/IconButton'
import { HierarchyChart } from './components/diagrams/HierarchyChart'
import { UmlDiagram } from './components/diagrams/UmlDiagram'
import { OutlinePanel } from './components/diagrams/OutlinePanel'
import { InspectorPane } from './components/InspectorPane'
import { clampDiagramFontSize } from './components/diagrams/diagramLayout'
import {
  TRACE_CMD_STEP_INTO, TRACE_CMD_STEP_OVER, TRACE_CMD_STEP_OUT_BLOCK, TRACE_CMD_CONTINUE,
  DEFAULT_CODE_FILENAME, DIAGRAM_FONT_DEFAULT, DIAGRAM_FONT_MIN, DIAGRAM_FONT_MAX,
  PANEL_OPTIONS,
} from './constants'
import type {
  Theme, RuntimeKey, PanelVisibility, InputRequest, SabRef, SimState, InspectorPath,
  StructureModel, DiagramModel, HierarchyModel, OutlineModel, DiagramView, VFSEntry,
} from './types'

const TRACER_WORKER_URL = new URL('./workers/tracer.worker.ts', import.meta.url)

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
  const [isConsolePresentationMode, setIsConsolePresentationMode] = useState(false)
  const [runtimePreference, setRuntimePreference] = useState<RuntimeKey>('trace-worker')
  const [visiblePanels, setVisiblePanels] = useState<PanelVisibility>({ code: true, visualizer: true, diagram: true, insight: true, filesystem: true })
  const [activeFilesystemId, setActiveFilesystemId] = useState<string>('default')
  const [currentWorkingDir, setCurrentWorkingDir] = useState<string>('/')
  const [openFilePath, setOpenFilePath] = useState<string | null>(null)
  const [vfsReloadTrigger, setVfsReloadTrigger] = useState(0)
  const [isUnsaved, setIsUnsaved] = useState(false)
  const [pendingCodeLoad, setPendingCodeLoad] = useState<{ content: string; name: string; rawBuffer: ArrayBuffer; mimeType: string } | null>(null)
  const [showCodeSaveDialog, setShowCodeSaveDialog] = useState(false)
  const [diagramFontSize, setDiagramFontSize] = useState(DIAGRAM_FONT_DEFAULT)
  const [isPanelMenuOpen, setIsPanelMenuOpen] = useState(false)
  const [isRuntimeMenuOpen, setIsRuntimeMenuOpen] = useState(false)
  const [diagramView, setDiagramView] = useState<DiagramView>('hierarchy')
  const [outlineExpandedIds, setOutlineExpandedIds] = useState<Set<string>>(() => new Set())
  const [showInterpreterVars] = useState(false)
  const [globalsInspectorPath, setGlobalsInspectorPath] = useState<InspectorPath>([])
  const [localsInspectorPath, setLocalsInspectorPath] = useState<InspectorPath>([])
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set())
  const breakpointsRef = useRef<Set<number>>(new Set())
  const [leftWidth, setLeftWidth] = useState(41.67)
  const [rightTopHeight, setRightTopHeight] = useState(50)
  const [bottomLeftWidth, setBottomLeftWidth] = useState(42.86)

  const workerRef = useRef<Worker | null>(null)
  const sabRef = useRef<SabRef | null>(null)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const editorDecorationsRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
  const breakpointDecorationsRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
  const applyingEditorValueRef = useRef(false)
  const outputRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const panelMenuRef = useRef<HTMLDivElement | null>(null)
  const runtimeMenuRef = useRef<HTMLDivElement | null>(null)
  const mainThreadCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const mainThreadCanvasSnapshotRef = useRef<HTMLCanvasElement | null>(null)
  const mainThreadCanvasWatcherRef = useRef(0)
  const mainThreadStopRequestedRef = useRef<boolean>(false)
  const pygameLayoutSnapshotRef = useRef<{ visiblePanels: PanelVisibility; leftWidth: number; rightTopHeight: number; bottomLeftWidth: number } | null>(null)
  const consoleLayoutSnapshotRef = useRef<{ visiblePanels: PanelVisibility; leftWidth: number; rightTopHeight: number; bottomLeftWidth: number } | null>(null)
  const mainThreadRunIdRef = useRef(0)
  const noteDraftRef = useRef('')
  const isInsightEditingRef = useRef(false)
  const activeInsightKeyRef = useRef('')
  const savedCodeRef = useRef('')
  const resizeDragRef = useRef<string | null>(null)
  const mainContainerRef = useRef<HTMLDivElement | null>(null)
  const mainThreadMountedPathsRef = useRef<string[]>([])
  const rightSideRef = useRef<HTMLDivElement | null>(null)
  const bottomRowRef = useRef<HTMLDivElement | null>(null)

  const deferredCodeText = useDeferredValue(codeText)
  const hasCode = codeText.trim().length > 0

  // ── Derived state ────────────────────────────────────────────────────────

  const isPygameLocked = codeUsesPygame(codeText)
  const selectedRuntime: RuntimeKey = isPygameLocked ? 'main-thread' : runtimePreference
  const resolvedRuntime = isRunning ? activeRuntime : selectedRuntime
  const isMainThreadRuntime = resolvedRuntime === 'main-thread'
  const isPygameCanvasRuntime = isPygameRunActive || (isMainThreadRuntime && isPygameLocked)
  const inspectorRoot = simState?.Inspector || null
  const inspectorRootKey = inspectorRoot?.key || null
  const inspectorViews = inspectorRoot?.views || {}
  const globalsInspectorRoot = inspectorViews.globals ?? null
  const localsInspectorRoot = inspectorViews.locals ?? null
  const activeInsightKey = currentFunc ? getDefinitionKey(currentFunc, currentClass) : ''
  const activeInsightDefinition = structureModel.definitionByKey[activeInsightKey] || null
  const activeInsightText = activeInsightDefinition
    ? getDefinitionNote(activeInsightDefinition, noteOverrides)
    : currentFunc
      ? getExplanation(currentFunc, currentClass)
      : 'Waiting for execution to enter a definition...'
  const activeInsightHeading = activeInsightDefinition?.interface
    || (currentClass ? `${currentClass}.${currentFunc}()` : currentFunc ? `${currentFunc}()` : 'Global Scope')
  const hasCustomInsightNote = !!activeInsightDefinition && Object.prototype.hasOwnProperty.call(noteOverrides, activeInsightDefinition.key)
  const canExportNotes = structureModel.orderedDefinitions.length > 0 && hasCode
  const hasBottomPanels = visiblePanels.diagram || visiblePanels.insight
  const hasRightSidePanels = visiblePanels.visualizer || hasBottomPanels

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    setIsCrossOriginIsolated(window.crossOriginIsolated === true)
    setHasSab(typeof SharedArrayBuffer !== 'undefined' && window.crossOriginIsolated === true)
    void (async () => {
      await ensureDefaultFilesystem()
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
  }, [leftWidth, rightTopHeight, bottomLeftWidth, visiblePanels.code, visiblePanels.visualizer, visiblePanels.diagram, visiblePanels.insight, visiblePanels.filesystem])

  useEffect(() => {
    if (!visiblePanels.insight) setShowExportDialog(false)
  }, [visiblePanels.insight])

  useEffect(() => { persistNoteOverrides(noteOverrides) }, [noteOverrides])
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
  }, [isRunning])

  useEffect(() => {
    if (!isPanelMenuOpen && !isRuntimeMenuOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (panelMenuRef.current?.contains(event.target as Node) || runtimeMenuRef.current?.contains(event.target as Node)) return
      setIsPanelMenuOpen(false); setIsRuntimeMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setIsPanelMenuOpen(false); setIsRuntimeMenuOpen(false) }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => { document.removeEventListener('mousedown', handlePointerDown); document.removeEventListener('keydown', handleKeyDown) }
  }, [isPanelMenuOpen, isRuntimeMenuOpen])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizeDragRef.current) return
      if (resizeDragRef.current === 'col-main' && mainContainerRef.current) {
        const rect = mainContainerRef.current.getBoundingClientRect()
        setLeftWidth(Math.max(15, Math.min(75, ((e.clientX - rect.left) / rect.width) * 100)))
      } else if (resizeDragRef.current === 'row-right' && rightSideRef.current) {
        const rect = rightSideRef.current.getBoundingClientRect()
        setRightTopHeight(Math.max(15, Math.min(85, ((e.clientY - rect.top) / rect.height) * 100)))
      } else if (resizeDragRef.current === 'col-bottom' && bottomRowRef.current) {
        const rect = bottomRowRef.current.getBoundingClientRect()
        setBottomLeftWidth(Math.max(15, Math.min(85, ((e.clientX - rect.left) / rect.width) * 100)))
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
    if (inputRequest !== null && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
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

  const saveInsightNote = (targetKey = activeInsightKey, rawValue = noteDraftRef.current, closeEditor = true) => {
    if (!targetKey) return
    const definition = structureModel.definitionByKey[targetKey] || null
    const defaultNote = getDefaultDefinitionNote(definition)
    const nextValue = sanitizeNoteText(rawValue)
    setNoteOverrides(current => {
      const updated = { ...current }
      if (!nextValue && !defaultNote) delete updated[targetKey]
      else if (nextValue === defaultNote) delete updated[targetKey]
      else updated[targetKey] = nextValue
      return updated
    })
    if (closeEditor) setIsInsightEditing(false)
  }

  const beginEditingInsightNote = () => {
    if (!activeInsightKey) return
    setNoteDraft(activeInsightText)
    setIsInsightEditing(true)
  }

  const resetInsightNote = () => {
    if (!activeInsightKey) return
    setNoteOverrides(current => { const updated = { ...current }; delete updated[activeInsightKey]; return updated })
    setNoteDraft(getDefaultDefinitionNote(activeInsightDefinition))
    setIsInsightEditing(false)
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
      pygameLayoutSnapshotRef.current = { visiblePanels: { ...visiblePanels }, leftWidth, rightTopHeight, bottomLeftWidth }
    }
    setShowExportDialog(false)
    setVisiblePanels({ code: false, visualizer: false, diagram: true, insight: true, filesystem: false })
    setBottomLeftWidth(74)
    setIsPygameRunActive(true)
  }

  const restorePygamePresentationMode = () => {
    setIsPygameRunActive(false)
    const snapshot = pygameLayoutSnapshotRef.current
    pygameLayoutSnapshotRef.current = null
    if (!snapshot) return
    setVisiblePanels(snapshot.visiblePanels)
    setLeftWidth(snapshot.leftWidth)
    setRightTopHeight(snapshot.rightTopHeight)
    setBottomLeftWidth(snapshot.bottomLeftWidth)
  }

  const enterConsolePresentationMode = () => {
    if (!consoleLayoutSnapshotRef.current) {
      consoleLayoutSnapshotRef.current = { visiblePanels: { ...visiblePanels }, leftWidth, rightTopHeight, bottomLeftWidth }
    }
    setShowExportDialog(false)
    setVisiblePanels({ code: false, visualizer: false, diagram: false, insight: true, filesystem: false })
    setIsConsolePresentationMode(true)
  }

  const restoreConsolePresentationMode = () => {
    setIsConsolePresentationMode(false)
    const snapshot = consoleLayoutSnapshotRef.current
    consoleLayoutSnapshotRef.current = null
    if (!snapshot) return
    setVisiblePanels(snapshot.visiblePanels)
    setLeftWidth(snapshot.leftWidth)
    setRightTopHeight(snapshot.rightTopHeight)
    setBottomLeftWidth(snapshot.bottomLeftWidth)
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

  const resetExecutionState = () => {
    setCurrentLine(-1); setCurrentFunc(''); setCurrentClass(''); setSimState(null)
    setInputRequest(null); setInputValue(''); setOutputLog('')
  }

  const startTraceWorker = async () => {
    if (!hasSab || !hasCode) return
    await saveCurrentToVFS()
    const vfsFiles = await getAllFiles(activeFilesystemId)
    const capturedFsId = activeFilesystemId
    const capturedCwd = currentWorkingDir

    resetExecutionState()
    setIsRunning(true); setActiveRuntime('trace-worker')
    setCodeStatus('Trace-worker runtime starting...')
    setMainThreadStatus('Trace-worker runtime is active.')

    const sab = new SharedArrayBuffer(1024 * 4)
    sabRef.current = { sab, int32: new Int32Array(sab), uint8: new Uint8Array(sab) }

    const worker = new Worker(TRACER_WORKER_URL)
    workerRef.current = worker

    worker.onmessage = (e: MessageEvent) => {
      const data = e.data
      if (data.type === 'trace') {
        setCurrentLine(data.line); setCurrentFunc(data.func); setCurrentClass(data.cls || '')
        if (data.state && data.state !== '{}') {
          try { setSimState(JSON.parse(data.state)) } catch { /* ignore */ }
        }
      } else if (data.type === 'input') {
        setInputValue(''); setInputRequest({ id: Date.now(), prompt: data.prompt ?? '' })
      } else if (data.type === 'print') {
        setOutputLog(prev => prev + data.text + '\n')
      } else if (data.type === 'error') {
        if (data.files?.length) {
          void syncFilesFromPyodide(capturedFsId, data.files).then(() => setVfsReloadTrigger(t => t + 1))
        }
        setOutputLog(prev => prev + '\n[ERROR] ' + data.error + '\n')
        setInputRequest(null); setInputValue(''); setIsRunning(false); setActiveRuntime('')
        setCodeStatus('Trace-worker runtime failed.'); workerRef.current = null; sabRef.current = null
      } else if (data.type === 'done') {
        if (data.files?.length) {
          void syncFilesFromPyodide(capturedFsId, data.files).then(() => setVfsReloadTrigger(t => t + 1))
        }
        setOutputLog(prev => prev + '\n[TRACE RUN FINISHED]\n')
        setInputRequest(null); setInputValue(''); setIsRunning(false); setActiveRuntime('')
        setCurrentLine(-1); setCodeStatus('Trace-worker runtime finished.')
        workerRef.current = null; sabRef.current = null
      }
    }

    worker.postMessage({ type: 'init', sab: sabRef.current.sab, code: codeText, files: vfsFiles, cwd: capturedCwd })
  }

  const startMainThreadRun = async () => {
    if (!hasCode) return
    await saveCurrentToVFS()
    const vfsFiles = await getAllFiles(activeFilesystemId)
    const capturedFsId = activeFilesystemId
    const capturedCwd = currentWorkingDir

    const runId = ++mainThreadRunIdRef.current
    const shouldRunPygame = codeUsesPygame(codeText)
    mainThreadStopRequestedRef.current = false
    if (shouldRunPygame) enterPygamePresentationMode(); else enterConsolePresentationMode()
    resetExecutionState()
    if (shouldRunPygame) clearMainThreadCanvas()
    setIsRunning(true); setActiveRuntime('main-thread')
    setCodeStatus('Main-thread runtime starting...')
    setMainThreadStatus(shouldRunPygame ? 'Loading Pyodide 0.29.3 and pygame-ce on the main thread...' : 'Loading Pyodide 0.29.3 on the main thread...')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pyodide: any = null
    try {
      pyodide = await loadMainThreadPyodide()
      if (runId !== mainThreadRunIdRef.current) return

      if (typeof pyodide.setStdout === 'function') pyodide.setStdout({ batched: (text: string) => setOutputLog(prev => prev + text + '\n') })
      if (typeof pyodide.setStderr === 'function') pyodide.setStderr({ batched: (text: string) => setOutputLog(prev => prev + '[stderr] ' + text + '\n') })
      if (pyodide._api) pyodide._api._skip_unwind_fatal_error = true

      cleanFilesFromPyodide(pyodide, mainThreadMountedPathsRef.current)
      mountFilesToPyodide(pyodide, vfsFiles, capturedCwd)
      mainThreadMountedPathsRef.current = vfsFiles.map(f => f.path)

      if (shouldRunPygame) {
        const canvas = ensureMainThreadCanvas()
        if (!pyodide.canvas?.setCanvas2D) throw new Error('Pyodide canvas support is unavailable.')
        pyodide.canvas.setCanvas2D(canvas)
        focusMainThreadCanvas()
        startMainThreadCanvasWatcher()
      }

      setMainThreadStatus(shouldRunPygame ? 'Loading pygame dependencies from imports...' : 'Loading packages from imports...')
      await pyodide.loadPackagesFromImports(codeText)
      if (runId !== mainThreadRunIdRef.current) return

      setMainThreadStatus(shouldRunPygame ? 'Preparing pygame for browser execution...' : 'Executing code on the main thread...')
      const execGlobals = pyodide.toPy({
        __name__: '__main__',
        __coder_user_code__: codeText,
        js_input_prompt: (promptText: string) => window.prompt(promptText ?? '') ?? '',
        js_should_stop_main_thread: () => Boolean(mainThreadStopRequestedRef.current),
        js_set_main_thread_status: (message: string) => setMainThreadStatus(String(message ?? '')),
        js_append_main_thread_log: (message: string) => setOutputLog(prev => prev + String(message ?? '') + '\n'),
      })

      try {
        if (shouldRunPygame) {
          await pyodide.loadPackage('pygame-ce')
          await pyodide.runPythonAsync(PYGAME_MAIN_THREAD_BOOTSTRAP, { globals: execGlobals })
        } else {
          await pyodide.runPythonAsync(`
import builtins
def __coder_prompt_input(prompt=""): return js_input_prompt(prompt)
builtins.input = __coder_prompt_input
code_obj = compile(__coder_user_code__, "simulation.py", "exec")
exec(code_obj, globals())
          `, { globals: execGlobals })
        }
      } finally { execGlobals.destroy?.() }

      if (runId !== mainThreadRunIdRef.current) return
      // Sync FS back
      if (pyodide) {
        try {
          const updatedFiles = readFilesFromPyodide(pyodide, vfsFiles.map(f => f.path), capturedCwd)
          await syncFilesFromPyodide(capturedFsId, updatedFiles)
          setVfsReloadTrigger(t => t + 1)
        } catch { /* ignore */ }
      }
      const wasStopRequested = Boolean(mainThreadStopRequestedRef.current)
      setOutputLog(prev => prev + (wasStopRequested ? '\n[MAIN-THREAD RUN STOPPED]\n' : '\n[MAIN-THREAD RUN FINISHED]\n'))
      setCodeStatus(wasStopRequested ? 'Main-thread pygame runtime stopped.' : 'Main-thread runtime finished.')
      setMainThreadStatus(wasStopRequested ? 'Main-thread pygame run stopped.' : 'Main-thread run finished.')
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
      setOutputLog(prev => prev + '\n[ERROR] ' + message + '\n')
      setCodeStatus('Main-thread runtime failed.')
      setMainThreadStatus('Main-thread run failed. See console output for details.')
      setIsRunning(false); setActiveRuntime('')
    } finally {
      mainThreadStopRequestedRef.current = false
      stopMainThreadCanvasWatcher({ restoreSnapshot: shouldRunPygame })
      if (shouldRunPygame) restorePygamePresentationMode()
      else restoreConsolePresentationMode()
    }
  }

  const sendTraceCommand = (cmd: number) => {
    if (!sabRef.current) return
    const { int32 } = sabRef.current
    if (Atomics.load(int32, 0) === 1) {
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
      setCodeStatus('Trace-worker runtime stopped.')
    } else if (activeRuntime === 'main-thread') {
      if (isPygameRunActive) {
        mainThreadStopRequestedRef.current = true
        setOutputLog(prev => prev + '\n[INFO] Stop requested for main-thread pygame run.\n')
        setMainThreadStatus('Stopping pygame run...')
        return
      }
      setOutputLog(prev => prev + '\n[INFO] Force stop is not available in main-thread mode yet.\n')
      setMainThreadStatus('Main-thread mode cannot be forcibly stopped in this phase.')
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
            buttonHoverClass="hover:border-emerald-400" checkboxAccent="#34d399" disabled={isPygameRunActive || isConsolePresentationMode} />
          <RuntimeSettingsMenu menuRef={runtimeMenuRef} isOpen={isRuntimeMenuOpen}
            onToggleOpen={() => { setIsPanelMenuOpen(false); setIsRuntimeMenuOpen(o => !o) }}
            runtimePreference={runtimePreference} selectedRuntime={selectedRuntime}
            onSelectRuntime={key => { setRuntimePreference(key); setIsRuntimeMenuOpen(false) }}
            isPygameLocked={isPygameLocked} hasSab={hasSab} disabled={isRunning} />
          <ThemeToggleButton theme={theme} onToggle={toggleTheme} />

          {!isRunning ? (
            selectedRuntime === 'trace-worker' ? (
              <button onClick={() => void startTraceWorker()} disabled={!hasCode || !hasSab}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Trace Run
              </button>
            ) : (
              <button onClick={() => void startMainThreadRun()} disabled={!hasCode}
                className="bg-sky-600 hover:bg-sky-500 text-white px-5 py-2 rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Run
              </button>
            )
          ) : activeRuntime === 'trace-worker' ? (
            <>
              <button onClick={() => sendTraceCommand(TRACE_CMD_STEP_INTO)} disabled={inputRequest !== null}
                className="bg-emerald-700 hover:bg-emerald-600 text-white px-5 py-2 rounded font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
                Step Into
              </button>
              <button onClick={() => sendTraceCommand(TRACE_CMD_STEP_OVER)} disabled={inputRequest !== null}
                className="bg-teal-700 hover:bg-teal-600 text-white px-5 py-2 rounded font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
                Step Over
              </button>
              <button onClick={() => sendTraceCommand(TRACE_CMD_STEP_OUT_BLOCK)} disabled={inputRequest !== null}
                className="bg-cyan-700 hover:bg-cyan-600 text-white px-5 py-2 rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Step Out Block
              </button>
              <button onClick={() => sendTraceCommand(TRACE_CMD_CONTINUE)} disabled={inputRequest !== null}
                className="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2 rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Continue
              </button>
              <button onClick={forceStop} className="bg-red-600 hover:bg-red-500 text-white px-5 py-2 rounded font-semibold transition-colors">Stop</button>
            </>
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

      {/* Pygame banner */}
      {isPygameRunActive && (
        <div className="flex-shrink-0 border-b border-sky-700 bg-sky-950/80 px-5 py-2 text-sm text-sky-100 shadow-md">
          pygame is running in the main page thread. Debugging and live inspection are disabled while it runs. Click inside the canvas panel to focus keyboard controls.
        </div>
      )}

      {/* Input bar */}
      {inputRequest !== null && (
        <div className="flex-shrink-0 bg-slate-800 border-b border-slate-600 border-l-4 border-l-amber-400 px-5 py-2.5 flex items-center gap-4 shadow-md z-10">
          <span className="flex-shrink-0 text-xs font-bold uppercase tracking-widest text-amber-400">Input</span>
          <span className="flex-shrink-0 text-slate-300 text-sm truncate max-w-xs" title={inputRequest.prompt || ''}>
            {inputRequest.prompt || 'Python is waiting for input...'}
          </span>
          <input key={inputRequest.id} ref={inputRef} type="text" value={inputValue}
            className="flex-1 min-w-0 bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
            placeholder="Type your response..."
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleInputSubmit() }} />
          <button onClick={() => handleInputSubmit()} className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded font-semibold text-sm transition-colors">Submit</button>
          <button onClick={forceStop} className="flex-shrink-0 bg-slate-700 hover:bg-slate-600 text-red-400 hover:text-red-300 border border-slate-600 px-4 py-1.5 rounded font-semibold text-sm transition-colors">Cancel / Stop</button>
        </div>
      )}

      {/* Main Layout */}
      <div ref={mainContainerRef} className="flex-1 flex overflow-hidden p-2">

        {/* PANEL 1: Code Trace (+ optional FS sidebar) */}
        {visiblePanels.code && (
          <div className="bg-slate-800 rounded-lg shadow border border-slate-700 flex overflow-hidden flex-shrink-0"
            style={{ width: hasRightSidePanels ? `calc(${leftWidth}% - 6px)` : '100%' }}>
            {/* FS Sidebar */}
            {visiblePanels.filesystem && (
              <div className="w-56 flex-shrink-0 border-r border-slate-700 flex flex-col overflow-hidden">
                <div className="bg-slate-900 py-2 px-3 border-b border-slate-700 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0">
                  File System
                </div>
                <div className="flex-1 overflow-hidden min-h-0">
                  <FileSystemPanel
                    activeFilesystemId={activeFilesystemId}
                    currentWorkingDir={currentWorkingDir}
                    openFilePath={openFilePath}
                    onFilesystemChange={id => void handleFilesystemChange(id)}
                    onFilesystemForcedChange={handleFilesystemForcedChange}
                    onCwdChange={setCurrentWorkingDir}
                    onOpenFile={entry => void onOpenVFSFile(entry)}
                    onError={msg => setCodeStatus(msg)}
                    reloadTrigger={vfsReloadTrigger}
                  />
                </div>
              </div>
            )}
            {/* Code editor area */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleCodeFileChange} />
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
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
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
              <div className="flex-1 overflow-hidden">
                {!isEditorReady && (
                  <div className="flex h-full items-center justify-center text-slate-500 text-sm">Loading Monaco editor...</div>
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
                    fontSize: 14,
                    padding: { top: 14, bottom: 18 },
                    renderLineHighlight: 'none',
                    wordWrap: 'off',
                    readOnly: isRunning,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Resize handle: Panel 1 ↔ right side */}
        {visiblePanels.code && hasRightSidePanels && (
          <div className="resize-handle-col" onMouseDown={e => { e.preventDefault(); resizeDragRef.current = 'col-main'; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none' }}>
            <div className="resize-bar" style={{ width: '3px', height: '48px' }} />
          </div>
        )}

        {/* Right side panels */}
        {hasRightSidePanels && (
          <div ref={rightSideRef} className="flex-1 flex flex-col overflow-hidden min-w-0">

            {/* PANEL 2: Inspectors */}
            {visiblePanels.visualizer && (
              <div className="bg-slate-800 rounded-lg shadow border border-slate-700 flex flex-col overflow-hidden flex-shrink-0"
                style={{ height: hasBottomPanels ? `calc(${rightTopHeight}% - 6px)` : '100%' }}>
                <div className="bg-slate-900 py-2 px-4 border-b border-slate-700 flex items-center justify-between">
                  <div className="font-bold uppercase tracking-wider text-xs text-sky-300">Variable Inspectors</div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] uppercase tracking-wider ${hasSab ? 'text-emerald-400' : 'text-red-400'}`}>
                      {hasSab ? 'SAB ✓' : 'SAB ✗'}
                    </span>
                    {isRunning && activeRuntime === 'main-thread' && (
                      <span className="text-[10px] text-amber-400 truncate max-w-[160px]">{mainThreadStatus}</span>
                    )}
                  </div>
                </div>
                <div className="flex-1 flex gap-2 overflow-hidden p-2">
                  <InspectorPane title="Global Variables" root={globalsInspectorRoot}
                    path={globalsInspectorPath} setPath={setGlobalsInspectorPath}
                    emptyMessage="Run code to see globals."
                    unavailableMessage={isMainThreadRuntime ? 'Live inspection is unavailable in main-thread mode.' : ''} />
                  <InspectorPane title="Local Variables" root={localsInspectorRoot}
                    path={localsInspectorPath} setPath={setLocalsInspectorPath}
                    emptyMessage="Waiting for code to enter a function..."
                    unavailableMessage={isMainThreadRuntime ? 'Live inspection is unavailable in main-thread mode.' : ''} />
                </div>
              </div>
            )}

            {/* Resize handle: inspectors ↔ bottom panels */}
            {visiblePanels.visualizer && hasBottomPanels && (
              <div className="resize-handle-row" onMouseDown={e => { e.preventDefault(); resizeDragRef.current = 'row-right'; document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none' }}>
                <div className="resize-bar" style={{ height: '3px', width: '48px' }} />
              </div>
            )}

            {/* Bottom row */}
            {hasBottomPanels && (
              <div ref={bottomRowRef} className="flex-1 flex overflow-hidden min-h-0">

                {/* PANEL 3: Structure / Canvas */}
                {visiblePanels.diagram && (
                  <div className="bg-slate-800 rounded-lg shadow border border-slate-700 flex flex-col overflow-hidden flex-shrink-0"
                    style={{ width: visiblePanels.insight ? `calc(${bottomLeftWidth}% - 6px)` : '100%' }}>
                    <div className="bg-slate-900 py-2 px-4 border-b border-slate-700">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-bold uppercase tracking-wider text-xs text-emerald-400">
                          {isPygameRunActive ? 'Pygame Canvas' : 'Structure Diagram'}
                        </div>
                        <div className="flex items-center gap-3">
                          {!isPygameRunActive && (
                            <div className="flex rounded overflow-hidden border border-slate-700 text-[11px]">
                              {(['hierarchy', 'outline', 'uml'] as DiagramView[]).map(view => (
                                <button key={view} onClick={() => setDiagramView(view)}
                                  className={`px-3 py-1 ${diagramView === view ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-300'}`}>
                                  {view === 'hierarchy' ? 'Hierarchy' : view === 'outline' ? 'Outline' : 'Class Diagram'}
                                </button>
                              ))}
                            </div>
                          )}
                          {!isPygameRunActive && diagramView !== 'outline' && (
                            <div className="flex flex-col items-end gap-1">
                              <div className="text-[10px] uppercase tracking-wider text-slate-500">Font</div>
                              <DiagramFontControls fontSize={diagramFontSize} onDecrease={decreaseDiagramFontSize} onIncrease={increaseDiagramFontSize}
                                canDecrease={diagramFontSize > DIAGRAM_FONT_MIN} canIncrease={diagramFontSize < DIAGRAM_FONT_MAX} />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto p-4">
                      {isPygameRunActive ? (
                        <div className="mx-auto flex h-full w-full max-w-6xl flex-col">
                          <div className="flex-1 rounded-xl border border-slate-600 bg-slate-950/80 p-4">
                            <canvas id="canvas" ref={mainThreadCanvasRef}
                              className="mx-auto block max-h-full max-w-full rounded bg-slate-950"
                              style={{ imageRendering: 'pixelated', outline: 'none' }}
                              onPointerDown={() => mainThreadCanvasRef.current?.focus()} />
                          </div>
                        </div>
                      ) : (
                        <div className="mx-auto h-full min-h-[280px] min-w-[320px]">
                          {diagramView === 'uml' ? (
                            <UmlDiagram currentClass={currentClass} diagramModel={diagramModel} fontSize={diagramFontSize} />
                          ) : diagramView === 'outline' ? (
                            <OutlinePanel outlineModel={outlineModel} expandedIds={outlineExpandedIds}
                              setExpandedIds={setOutlineExpandedIds} onJumpToLine={jumpToSourceLine} currentLine={currentLine} />
                          ) : (
                            <HierarchyChart currentFunc={currentFunc} hierarchyModel={hierarchyModel} fontSize={diagramFontSize} />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Resize handle: Panel 3 ↔ Panel 4 */}
                {visiblePanels.diagram && visiblePanels.insight && (
                  <div className="resize-handle-col" onMouseDown={e => { e.preventDefault(); resizeDragRef.current = 'col-bottom'; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none' }}>
                    <div className="resize-bar" style={{ width: '3px', height: '48px' }} />
                  </div>
                )}

                {/* PANEL 4: Notes + Output */}
                {visiblePanels.insight && (
                  <div className="bg-slate-800 rounded-lg shadow border border-slate-700 flex flex-col overflow-hidden flex-1">
                    <div className="flex bg-slate-900 border-b border-slate-700">
                      {(isPygameRunActive || isConsolePresentationMode) ? (
                        <div className="w-full py-2 px-4 font-bold uppercase tracking-wider text-teal-400 text-xs">Console Output</div>
                      ) : (
                        <>
                          <div className="py-2 px-4 font-bold uppercase tracking-wider text-emerald-400 text-xs border-r border-slate-700 w-1/2">Documentation Notes</div>
                          <div className="py-2 px-4 font-bold uppercase tracking-wider text-teal-400 text-xs w-1/2">Console Output</div>
                        </>
                      )}
                    </div>

                    <div className="flex-1 flex overflow-hidden">
                      {/* Notes panel */}
                      {!isPygameRunActive && !isConsolePresentationMode && (
                        <div className="relative flex w-1/2 min-h-0 flex-col border-r border-slate-700 bg-slate-800/50 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-bold text-white mb-1">{activeInsightHeading}</h3>
                              <div className="text-[11px] uppercase tracking-wider text-slate-500">
                                {activeInsightKey ? (hasCustomInsightNote ? 'Custom Note' : 'Default Note') : 'Documentation Notes'}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {!isInsightEditing ? (
                                <IconButton title="Edit note" onClick={beginEditingInsightNote} disabled={!activeInsightKey}>
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M9 13l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 16.536A4 4 0 019.707 17.707L7 18l.293-2.707A4 4 0 018.464 12.536L14.696 6.304" />
                                  </svg>
                                </IconButton>
                              ) : (
                                <IconButton title="Save note" onClick={() => saveInsightNote(activeInsightKey, noteDraft, true)} disabled={!activeInsightKey}>
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                  </svg>
                                </IconButton>
                              )}
                              <IconButton title="Reset note to original" onClick={resetInsightNote} disabled={!activeInsightKey}>
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

                          <div className="mt-4 flex min-h-0 flex-1 flex-col">
                            {isInsightEditing ? (
                              <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
                                className="insight-note-editor min-h-0 flex-1"
                                placeholder="Write your revision note for this definition..." />
                            ) : (
                              <p className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap text-slate-300 leading-relaxed">
                                {activeInsightText || 'No note is available for this definition yet.'}
                              </p>
                            )}
                            <div className="mt-3 text-[11px] text-slate-500">
                              {isInsightEditing
                                ? 'Saves automatically if execution moves to another definition or the program stops.'
                                : activeInsightKey
                                  ? hasCustomInsightNote ? 'Your saved note is shown here.' : 'The built-in note is shown until you save your own version.'
                                  : 'Start tracing to attach documentation notes to live execution points.'}
                            </div>
                          </div>

                          {showExportDialog && (
                            <div className="export-modal-backdrop" onClick={() => setShowExportDialog(false)}>
                              <div className="export-modal-card" onClick={e => e.stopPropagation()}>
                                <div className="text-sm font-bold text-white">Export Notes</div>
                                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                                  Choose a plain text revision outline or an annotated Python file with your notes inserted as docstrings.
                                </p>
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
                      )}

                      {/* Console output */}
                      <div className={`${(isPygameRunActive || isConsolePresentationMode) ? 'w-full' : 'w-1/2'} flex flex-col overflow-hidden bg-slate-900/40 p-3`}>
                        <div ref={outputRef} className="flex-1 overflow-y-auto font-mono text-xs leading-relaxed text-slate-300 whitespace-pre-wrap break-words">
                          {outputLog || <span className="text-slate-500 italic">Console output will appear here.</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

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
