import { THEME_STORAGE_KEY, NOTES_STORAGE_KEY, SETTINGS_STORAGE_KEY } from '../constants'
import type { Theme, AppSettings, BookNavState, InputMode, NamedLayout } from '../types'

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

export const persistSettings = (settings: AppSettings): void => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore storage errors
  }
}
