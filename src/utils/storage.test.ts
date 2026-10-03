import { describe, expect, it } from 'vitest'
import { storedTurtleMode } from './storage'

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
