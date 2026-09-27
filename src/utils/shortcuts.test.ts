import { describe, expect, it } from 'vitest'
import { resolveShortcut, type ShortcutKey, type ShortcutState } from './shortcuts'

const key = (name: string, mods: Partial<Omit<ShortcutKey, 'key'>> = {}): ShortcutKey => ({
  key: name, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods,
})
const idle: ShortcutState = { isRunning: false, isPaused: false }
const running: ShortcutState = { isRunning: true, isPaused: false }
const paused: ShortcutState = { isRunning: true, isPaused: true }

describe('function-key shortcuts', () => {
  it('starts each run mode from F5 when nothing is running', () => {
    expect(resolveShortcut(key('F5'), idle)).toEqual({ kind: 'start', mode: 'debug' })
    expect(resolveShortcut(key('F5', { ctrlKey: true }), idle)).toEqual({ kind: 'start', mode: 'run' })
    expect(resolveShortcut(key('F5', { ctrlKey: true, shiftKey: true }), idle)).toEqual({ kind: 'start', mode: 'trace' })
  })

  it('accepts Cmd for Ctrl, as a Mac student will press it', () => {
    expect(resolveShortcut(key('F5', { metaKey: true }), idle)).toEqual({ kind: 'start', mode: 'run' })
  })

  it('steps and stops with the debugger conventions while paused', () => {
    expect(resolveShortcut(key('F5'), paused)).toEqual({ kind: 'step', step: 'continue' })
    expect(resolveShortcut(key('F10'), paused)).toEqual({ kind: 'step', step: 'over' })
    expect(resolveShortcut(key('F11'), paused)).toEqual({ kind: 'step', step: 'into' })
    expect(resolveShortcut(key('F11', { shiftKey: true }), paused)).toEqual({ kind: 'step', step: 'out' })
    expect(resolveShortcut(key('F5', { shiftKey: true }), paused)).toEqual({ kind: 'stop' })
  })

  it('stops a running program with Shift+F5 but never steps one that is not paused', () => {
    expect(resolveShortcut(key('F5', { shiftKey: true }), running)).toEqual({ kind: 'stop' })
    expect(resolveShortcut(key('F5'), running)).toEqual({ kind: 'swallow' })
    expect(resolveShortcut(key('F10'), running)).toEqual({ kind: 'swallow' })
    expect(resolveShortcut(key('F11'), running)).toEqual({ kind: 'swallow' })
  })

  it('does not start a second run over the first', () => {
    expect(resolveShortcut(key('F5', { ctrlKey: true }), running)).toEqual({ kind: 'swallow' })
    expect(resolveShortcut(key('F5', { ctrlKey: true, shiftKey: true }), paused)).toEqual({ kind: 'swallow' })
  })

  it('toggles the full-screen editor with F11 only when no program is running', () => {
    expect(resolveShortcut(key('F11'), idle)).toEqual({ kind: 'toggle-editor-full-screen' })
  })

  it('claims every F5 combination so the browser never reloads the page', () => {
    for (const state of [idle, running, paused]) {
      for (const mods of [{}, { shiftKey: true }, { ctrlKey: true }, { ctrlKey: true, shiftKey: true }]) {
        expect(resolveShortcut(key('F5', mods), state)).not.toBeNull()
      }
    }
  })

  it('leaves other keys, and Alt combinations, alone', () => {
    expect(resolveShortcut(key('F10'), idle)).toBeNull()
    expect(resolveShortcut(key('F12'), idle)).toBeNull()
    expect(resolveShortcut(key('a', { ctrlKey: true }), idle)).toBeNull()
    expect(resolveShortcut(key('F5', { altKey: true }), idle)).toBeNull()
  })
})
