import { THEME_STORAGE_KEY, NOTES_STORAGE_KEY, SETTINGS_STORAGE_KEY } from '../constants'
import type { Theme, AppSettings, BookNavState } from '../types'

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

export const getStoredSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return {
      turtleMode: parsed.turtleMode === 'basthon-svg' ? 'basthon-svg' : 'pyo-js-turtle',
    }
  } catch {
    return { turtleMode: 'pyo-js-turtle' }
  }
}

export const persistSettings = (settings: AppSettings): void => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore storage errors
  }
}
