import type { WorkerRunMode } from './urlRunMode'

/**
 * The app's function-key shortcuts, decided from a key press and the state of
 * the runtime. Kept apart from App so the whole table can be tested.
 *
 *   F5              Debug             · Continue, while paused in the debugger
 *   Ctrl+F5         Run (no debugging)
 *   Ctrl+Shift+F5   Trace
 *   Shift+F5        Stop, while a program runs
 *   F10             Step Over, while paused
 *   F11             Full-screen editor on/off · Step Into, while paused
 *   Shift+F11       Step Out, while paused
 *
 * F5 and F11 are the browser's reload and full screen, and a student who
 * presses F5 expecting their program to run must not lose their unsaved code to
 * a reload. So every combination of these keys is claimed, even when it has
 * nothing to do right now (`swallow`).
 */
export type ShortcutAction =
  | { kind: 'start'; mode: WorkerRunMode }
  | { kind: 'step'; step: 'into' | 'over' | 'out' | 'continue' }
  | { kind: 'stop' }
  | { kind: 'toggle-editor-full-screen' }
  | { kind: 'swallow' }

export interface ShortcutKey {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export interface ShortcutState {
  /** A program is running, or its runtime is still starting. */
  isRunning: boolean
  /** Stopped on a line in the debugger with the step buttons on screen and not waiting for input. */
  isPaused: boolean
}

const SWALLOW: ShortcutAction = { kind: 'swallow' }

export function resolveShortcut(event: ShortcutKey, state: ShortcutState): ShortcutAction | null {
  if (event.altKey) return null
  const ctrl = event.ctrlKey || event.metaKey
  const shift = event.shiftKey

  if (event.key === 'F5') {
    if (!state.isRunning) {
      if (ctrl) return { kind: 'start', mode: shift ? 'trace' : 'run' }
      return shift ? SWALLOW : { kind: 'start', mode: 'debug' }
    }
    if (shift && !ctrl) return { kind: 'stop' }
    if (!shift && !ctrl && state.isPaused) return { kind: 'step', step: 'continue' }
    return SWALLOW
  }

  if (event.key === 'F10') {
    if (ctrl || shift) return null
    if (state.isPaused) return { kind: 'step', step: 'over' }
    return state.isRunning ? SWALLOW : null
  }

  if (event.key === 'F11') {
    if (ctrl) return null
    if (state.isPaused) return { kind: 'step', step: shift ? 'out' : 'into' }
    if (state.isRunning || shift) return SWALLOW
    return { kind: 'toggle-editor-full-screen' }
  }

  return null
}
