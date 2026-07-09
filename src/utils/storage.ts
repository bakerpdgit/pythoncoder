import { THEME_STORAGE_KEY, NOTES_STORAGE_KEY, SETTINGS_STORAGE_KEY } from '../constants'
import type { Theme, AppSettings, BookNavState, InputMode, NamedLayout, LayoutPrefs, PanelVisibility, ViewMode } from '../types'

const EDITOR_FONT_SIZE_KEY = 'coder_editor_font_size'
const CONSOLE_FONT_SIZE_KEY = 'coder_console_font_size'

export const getStoredEditorFontSize = (): number => {
  try {
    const v = localStorage.getItem(EDITOR_FONT_SIZE_KEY)
    const n = v ? parseInt(v, 10) : 14
    return isNaN(n) ? 14 : Math.max(8, Math.min(40, n))
  } catch { return 14 }
}

export const persistEditorFontSize = (size: number): void => {
  try { localStorage.setItem(EDITOR_FONT_SIZE_KEY, String(size)) } catch { /* ignore */ }
}

export const getStoredConsoleFontSize = (): number => {
  try {
    const v = localStorage.getItem(CONSOLE_FONT_SIZE_KEY)
    const n = v ? parseInt(v, 10) : 13
    return isNaN(n) ? 13 : Math.max(8, Math.min(32, n))
  } catch { return 13 }
}

export const persistConsoleFontSize = (size: number): void => {
  try { localStorage.setItem(CONSOLE_FONT_SIZE_KEY, String(size)) } catch { /* ignore */ }
}

const FIXED_INPUTS_KEY_PREFIX = 'pythoncoder-fixed-inputs-'

export const getStoredFixedInputs = (fsId: string): string => {
  try {
    return localStorage.getItem(FIXED_INPUTS_KEY_PREFIX + fsId) ?? ''
  } catch {
    return ''
  }
}

export const persistFixedInputs = (fsId: string, text: string): void => {
  try {
    if (text) localStorage.setItem(FIXED_INPUTS_KEY_PREFIX + fsId, text)
    else localStorage.removeItem(FIXED_INPUTS_KEY_PREFIX + fsId)
  } catch { /* ignore */ }
}

const GITHUB_TOKEN_KEY = 'pythoncoder-github-token'

export const getStoredGitHubToken = (): string => {
  try {
    return localStorage.getItem(GITHUB_TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export const persistGitHubToken = (token: string): void => {
  try {
    if (token.trim()) localStorage.setItem(GITHUB_TOKEN_KEY, token.trim())
    else localStorage.removeItem(GITHUB_TOKEN_KEY)
  } catch { /* ignore */ }
}

const BOOK_NAV_KEY = 'pythoncoder-book-nav'

export const getStoredBookNavState = (): BookNavState | null => {
  try {
    const raw = localStorage.getItem(BOOK_NAV_KEY)
    return raw ? (JSON.parse(raw) as BookNavState) : null
  } catch {
    return null
  }
}

export const persistBookNavState = (state: BookNavState | null): void => {
  try {
    if (state) localStorage.setItem(BOOK_NAV_KEY, JSON.stringify(state))
    else localStorage.removeItem(BOOK_NAV_KEY)
  } catch {
    // ignore
  }
}

export const getStoredTheme = (): Theme => {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export const getStoredNoteOverrides = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export const persistNoteOverrides = (overrides: Record<string, string>): void => {
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    // ignore storage errors
  }
}

const VALID_INPUT_MODES: InputMode[] = ['inline-console', 'input-bar', 'popup-dialog']

export const getStoredSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return {
      turtleMode: parsed.turtleMode === 'basthon-svg' ? 'basthon-svg' : 'pyo-js-turtle',
      inputMode: VALID_INPUT_MODES.includes(parsed.inputMode) ? (parsed.inputMode as InputMode) : 'inline-console',
      useFixedInputs: parsed.useFixedInputs === true,
      inlineTraceValues: parsed.inlineTraceValues !== false,
    }
  } catch {
    return { turtleMode: 'pyo-js-turtle', inputMode: 'inline-console', useFixedInputs: false, inlineTraceValues: true }
  }
}

const WATCHES_KEY = 'pythoncoder-watches'
const NAMED_LAYOUTS_KEY = 'pythoncoder-named-layouts'

export const getStoredWatches = (): string[] => {
  try {
    const raw = localStorage.getItem(WATCHES_KEY)
    return Array.isArray(JSON.parse(raw ?? 'null')) ? JSON.parse(raw!) : []
  } catch { return [] }
}

export const persistWatches = (watches: string[]): void => {
  try { localStorage.setItem(WATCHES_KEY, JSON.stringify(watches)) } catch { /* ignore */ }
}

export const getStoredNamedLayouts = (): NamedLayout[] => {
  try {
    const raw = localStorage.getItem(NAMED_LAYOUTS_KEY)
    return Array.isArray(JSON.parse(raw ?? 'null')) ? JSON.parse(raw!) : []
  } catch { return [] }
}

export const persistNamedLayouts = (layouts: NamedLayout[]): void => {
  try { localStorage.setItem(NAMED_LAYOUTS_KEY, JSON.stringify(layouts)) } catch { /* ignore */ }
}

const BOOK_COMPLETIONS_KEY = 'pythoncoder-book-completions'

export const getStoredCompletions = (): Record<string, boolean> => {
  try {
    const raw = localStorage.getItem(BOOK_COMPLETIONS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return {} }
}

export const persistCompletion = (bookRootUrl: string, challengeId: string): void => {
  try {
    const completions = getStoredCompletions()
    completions[`${bookRootUrl}::${challengeId}`] = true
    localStorage.setItem(BOOK_COMPLETIONS_KEY, JSON.stringify(completions))
  } catch { /* ignore */ }
}

export const persistSettings = (settings: AppSettings): void => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore storage errors
  }
}

const LAYOUT_PREFS_KEY = 'pythoncoder-layout-prefs'

export const MINIMAL_VISIBLE_PANELS: PanelVisibility = {
  code: true, output: true, diagram: false, filesystem: true, visualizer: true, notes: true,
}

export const DEVELOPER_VISIBLE_PANELS: PanelVisibility = {
  code: true, output: true, diagram: true, filesystem: true, visualizer: true, notes: true,
}

export const defaultPanelsForView = (mode: ViewMode): PanelVisibility =>
  mode === 'minimal' ? { ...MINIMAL_VISIBLE_PANELS } : { ...DEVELOPER_VISIBLE_PANELS }

export const DEFAULT_LAYOUT_PREFS: LayoutPrefs = {
  viewMode: 'minimal',
  visiblePanels: { ...MINIMAL_VISIBLE_PANELS },
  leftSidebarCollapsed: true,
}

const sanitisePanels = (raw: unknown): PanelVisibility | null => {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.code !== 'boolean' || typeof r.output !== 'boolean') return null
  return {
    code: !!r.code,
    output: !!r.output,
    diagram: !!r.diagram,
    filesystem: !!r.filesystem,
    visualizer: !!r.visualizer,
    notes: r.notes === false ? false : true,
  }
}

export const getStoredLayoutPrefs = (): LayoutPrefs => {
  try {
    const raw = localStorage.getItem(LAYOUT_PREFS_KEY)
    if (!raw) return { ...DEFAULT_LAYOUT_PREFS, visiblePanels: { ...DEFAULT_LAYOUT_PREFS.visiblePanels } }
    const parsed = JSON.parse(raw)
    const viewMode: ViewMode = parsed?.viewMode === 'developer' ? 'developer' : 'minimal'
    const panels = sanitisePanels(parsed?.visiblePanels) ?? defaultPanelsForView(viewMode)
    const leftSidebarCollapsed = parsed?.leftSidebarCollapsed === true || (parsed?.leftSidebarCollapsed === undefined && viewMode === 'minimal')
    return { viewMode, visiblePanels: panels, leftSidebarCollapsed }
  } catch {
    return { ...DEFAULT_LAYOUT_PREFS, visiblePanels: { ...DEFAULT_LAYOUT_PREFS.visiblePanels } }
  }
}

export const persistLayoutPrefs = (prefs: LayoutPrefs): void => {
  try { localStorage.setItem(LAYOUT_PREFS_KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
}
