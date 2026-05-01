import { THEME_STORAGE_KEY, NOTES_STORAGE_KEY, SETTINGS_STORAGE_KEY } from '../constants'
import type { Theme, AppSettings, BookNavState, InputMode } from '../types'

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
    }
  } catch {
    return { turtleMode: 'pyo-js-turtle', inputMode: 'inline-console', useFixedInputs: false }
  }
}

export const persistSettings = (settings: AppSettings): void => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore storage errors
  }
}
