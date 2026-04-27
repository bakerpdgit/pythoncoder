export const TRACE_CMD_STEP_INTO = 1
export const TRACE_CMD_STEP_OVER = 2
export const TRACE_CMD_STEP_OUT_BLOCK = 3
export const TRACE_CMD_CONTINUE = 4

export const THEME_STORAGE_KEY = 'aqa_prelim_site_theme'
export const NOTES_STORAGE_KEY = 'aqa_prelim_notes_coder'

export const PYODIDE_BASE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full'
export const DEFAULT_CODE_FILENAME = 'coder.py'

export const PYGAME_IMPORT_REGEX = /^\s*(?:import\s+pygame\b|from\s+pygame\b)/m
export const TURTLE_IMPORT_REGEX = /^\s*(?:import\s+turtle\b|from\s+turtle\b)/m
export const SETTINGS_STORAGE_KEY = 'coder_app_settings'

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
    key: 'filesystem',
    label: 'File System',
    description: 'Virtual file browser, multiple projects, Pyodide FS integration.',
  },
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
    description: 'Function hierarchy, UML view, or canvas output.',
  },
  {
    key: 'notes',
    label: 'Documentation Notes',
    description: 'Editable per-function notes attached to live execution.',
  },
  {
    key: 'output',
    label: 'Console Output',
    description: 'stdout, stderr and runtime messages.',
  },
] as const

export const FS_SIDEBAR_WIDTH = 240
