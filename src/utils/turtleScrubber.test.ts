import { describe, it, expect } from 'vitest'
import { turtleSvgHasDrawing, shouldShowTurtleScrubber } from './turtleScrubber'

const CURSOR = '<polygon points="10.0,20.0 3.0,25.0 3.0,15.0" fill="black" stroke="white" stroke-width="1" stroke-linejoin="round"/>'
const blank = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="white"/>${CURSOR}</svg>`
const drawn = (n: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="white"/>` +
  `<line x1="300.0" y1="300.0" x2="${300 + n}.0" y2="300.0" stroke="black" stroke-width="1"/>${CURSOR}</svg>`

describe('turtleSvgHasDrawing', () => {
  it('is false for an empty string', () => expect(turtleSvgHasDrawing('')).toBe(false))
  it('is false for a background and cursor only', () => expect(turtleSvgHasDrawing(blank)).toBe(false))
  it('is false when several turtles are on an empty canvas', () => {
    expect(turtleSvgHasDrawing(blank.replace(CURSOR, CURSOR + CURSOR))).toBe(false)
  })
  it('is true once something is drawn', () => expect(turtleSvgHasDrawing(drawn(50))).toBe(true))
  it('counts a filled shape as drawing', () => {
    const filled = blank.replace(CURSOR, `<polygon points="1,2 3,4 5,6" fill="red" stroke="none"/>${CURSOR}`)
    expect(turtleSvgHasDrawing(filled)).toBe(true)
  })
})

describe('shouldShowTurtleScrubber', () => {
  it('hides for no history', () => expect(shouldShowTurtleScrubber([])).toBe(false))
  it('hides for a run that only produced the finished drawing', () => {
    expect(shouldShowTurtleScrubber([drawn(100)])).toBe(false)
  })
  it('hides for blank straight to finished', () => {
    expect(shouldShowTurtleScrubber([blank, drawn(100)])).toBe(false)
  })
  it('shows once there are two drawing stages', () => {
    expect(shouldShowTurtleScrubber([blank, drawn(50), drawn(100)])).toBe(true)
  })
})
