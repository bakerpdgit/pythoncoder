export const TRACE_CMD_STEP_INTO = 1
export const TRACE_CMD_STEP_OVER = 2
export const TRACE_CMD_STEP_OUT_BLOCK = 3
export const TRACE_CMD_CONTINUE = 4

export const THEME_STORAGE_KEY = 'aqa_prelim_site_theme'
export const NOTES_STORAGE_KEY = 'aqa_prelim_notes_coder'

export const PYODIDE_BASE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full'
export const DEFAULT_CODE_FILENAME = 'coder.py'

export const PYGAME_IMPORT_REGEX = /^\s*(?:import\s+pygame\b|from\s+pygame\b)/m

export const DIAGRAM_FONT_DEFAULT = 11
export const DIAGRAM_FONT_MIN = 8
export const DIAGRAM_FONT_MAX = 20

export const RUNTIME_LABELS: Record<string, string> = {
  'trace-worker': 'Trace Worker',
  'main-thread': 'Main Thread',
}

export const RUNTIME_OPTIONS = [
  {
    key: 'trace-worker',
    label: 'Trace Worker',
    description: 'Breakpoints, step controls, and live inspectors.',
  },
  {
    key: 'main-thread',
    label: 'Main Thread',
    description: 'Uses browser prompt pop-ups. Step tracing and live inspection are limited.',
  },
] as const

export const PANEL_OPTIONS = [
  {
    key: 'code',
    label: 'Code Trace',
    description: 'Editor, breakpoints, and line focus.',
  },
  {
    key: 'visualizer',
    label: 'Inspectors',
    description: 'Fixed globals and current-locals inspectors.',
  },
  {
    key: 'diagram',
    label: 'Structure / Canvas',
    description: 'Function hierarchy, UML view, or pygame canvas.',
  },
  {
    key: 'insight',
    label: 'Notes + Output',
    description: 'Documentation notes and console output.',
  },
] as const
