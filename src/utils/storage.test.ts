import { describe, expect, it } from 'vitest'
import { layoutPanelsToPersist, MINIMAL_VISIBLE_PANELS, storedTurtleMode } from './storage'
import type { PanelVisibility } from '../types'

describe('the stored turtle setting', () => {
  it('reads the three choices from turtleEngine', () => {
    expect(storedTurtleMode({ turtleEngine: 'cpython' })).toBe('cpython')
    expect(storedTurtleMode({ turtleEngine: 'pyo-js-turtle' })).toBe('pyo-js-turtle')
    expect(storedTurtleMode({ turtleEngine: 'basthon-svg', turtleMode: 'pyo-js-turtle' })).toBe('basthon-svg')
  })

  it('moves settings saved before there were three choices onto the new default, except SVG', () => {
    // The old default was saved along with every other setting, so it says
    // nothing about what the student wanted.
    expect(storedTurtleMode({ turtleMode: 'pyo-js-turtle' })).toBe('cpython')
    expect(storedTurtleMode({ turtleMode: 'basthon-svg' })).toBe('basthon-svg')
    expect(storedTurtleMode({})).toBe('cpython')
    expect(storedTurtleMode({ turtleEngine: 'nonsense' })).toBe('cpython')
  })
})

describe('the panels saved for the next visit', () => {
  // What enterRunPresentationMode puts on screen for a Run.
  const RUN_LAYOUT: PanelVisibility = {
    code: false, visualizer: false, diagram: false, notes: false, output: true, filesystem: false, teacherTools: false,
  }

  it('are the panels on screen when no run has taken the screen over', () => {
    const panels = { ...MINIMAL_VISIBLE_PANELS, diagram: true }
    expect(layoutPanelsToPersist(panels, null)).toBe(panels)
  })

  it('are the student\'s own while a run (or a held run view) has the screen, never the run\'s', () => {
    const before = { ...MINIMAL_VISIBLE_PANELS, filesystem: false, teacherTools: true }
    expect(layoutPanelsToPersist(RUN_LAYOUT, before)).toEqual(before)
  })

  it('keep the Console on, exactly as the end of a run gives the layout back', () => {
    // The Display pane lives in the Console panel, so a run's ending forces it on.
    const before = { ...MINIMAL_VISIBLE_PANELS, output: false }
    expect(layoutPanelsToPersist(RUN_LAYOUT, before)).toEqual({ ...before, output: true })
  })

  it('do not hand back the snapshot itself', () => {
    const before = { ...MINIMAL_VISIBLE_PANELS }
    const saved = layoutPanelsToPersist(RUN_LAYOUT, before)
    expect(saved).not.toBe(before)
    expect(before).toEqual(MINIMAL_VISIBLE_PANELS)
  })
})
