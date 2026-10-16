import { describe, expect, it } from 'vitest'
import { comparePixels, p5PicturesMatch, p5ReqKey, p5RunSettings, parseP5Capture, sameOperations } from './p5Compare'
import { evaluateTestCase } from './testMatcher'

// The rules that decide whether a student's p5 drawing is the solution's.
// The pictures here are made by hand; the real ones come from the tester
// painting both sketches (e2e/p5.spec.ts marks every task of the book).

const W = 40
const H = 40

/** A white picture with filled rectangles on it: [x, y, w, h, [r, g, b]]. */
function picture(rects: Array<[number, number, number, number, number[]]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4).fill(255)
  for (const [x0, y0, w, h, rgb] of rects) {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const i = (y * W + x) * 4
        data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]
      }
    }
  }
  return data
}

const RED = [255, 0, 0]

describe('comparing two pictures', () => {
  it('finds nothing between identical pictures', () => {
    const a = picture([[5, 5, 10, 10, RED]])
    const diff = comparePixels(a, picture([[5, 5, 10, 10, RED]]), W, H)
    expect(diff).toMatchObject({ mismatched: 0, core: 0 })
    expect(p5PicturesMatch(diff, W, H)).toBe(true)
  })

  it('forgives an edge a pixel out, as anti-aliasing and stroke joins leave them', () => {
    const diff = comparePixels(picture([[5, 5, 10, 10, RED]]), picture([[6, 5, 10, 10, RED]]), W, H)
    expect(diff.mismatched).toBe(0)
  })

  it('forgives a colour a little off, but not a different one', () => {
    expect(comparePixels(picture([[5, 5, 10, 10, RED]]), picture([[5, 5, 10, 10, [240, 15, 10]]]), W, H).mismatched).toBe(0)
    const diff = comparePixels(picture([[5, 5, 10, 10, RED]]), picture([[5, 5, 10, 10, [255, 165, 0]]]), W, H)
    expect(diff.mismatched).toBe(100)
    expect(p5PicturesMatch(diff, W, H)).toBe(false)
  })

  it('does not forgive a shape that is missing, even a small one', () => {
    const diff = comparePixels(picture([[5, 5, 10, 10, RED], [30, 30, 6, 6, RED]]), picture([[5, 5, 10, 10, RED]]), W, H)
    expect(diff.mismatched).toBe(36)
    // Few enough pixels to pass on their own count; a solid patch is not an edge.
    expect(diff.core).toBeGreaterThan(8)
    expect(p5PicturesMatch(diff, W, H)).toBe(false)
  })

  it('does not forgive a shape moved further than a pixel', () => {
    const diff = comparePixels(picture([[5, 5, 20, 20, RED]]), picture([[9, 5, 20, 20, RED]]), W, H)
    expect(diff.mismatched).toBeGreaterThan(50)
    expect(p5PicturesMatch(diff, W, H)).toBe(false)
  })

  it('marks where they differ, for the picture the student sees', () => {
    const diff = comparePixels(picture([[0, 0, 2, 2, RED]]), picture([]), W, H)
    expect([...diff.mask.slice(0, 3)]).toEqual([1, 1, 0])
  })
})

describe('a p5 requirement', () => {
  it('reads how to run the sketch, with sensible limits', () => {
    expect(p5RunSettings({ typ: 'p5' })).toEqual({ frames: 1, mouse: null, pressed: false })
    expect(p5RunSettings({ typ: 'p5', frames: '30', mouse: [10, 20], pressed: true })).toEqual({ frames: 30, mouse: [10, 20], pressed: true })
    expect(p5RunSettings({ typ: 'p5', frames: 99999 }).frames).toBe(600)
  })

  it('is keyed by its solution file and how it runs, so the tester and the matcher agree', () => {
    expect(p5ReqKey({ typ: 'p5', filename: 'a.py' })).toBe(p5ReqKey({ typ: 'p5', filename: 'a.py', frames: 1 }))
    expect(p5ReqKey({ typ: 'p5', filename: 'a.py' })).not.toBe(p5ReqKey({ typ: 'p5', filename: 'a.py', mouse: [1, 2] }))
  })

  it('passes or fails on what the tester compared, and carries the pictures to the results', () => {
    const req = { typ: 'p5', filename: 'sol.py', frames: 5 }
    const comparison = { passed: false, method: 'pixels' as const, message: 'differs', expected: 'data:e', actual: 'data:a', diff: 'data:d' }
    const run = { output: '', error: null, statementResults: {}, fileContents: {}, p5Results: { [p5ReqKey(req)]: comparison } }
    const failed = evaluateTestCase(0, { in: [], out: [req] }, run, '')
    expect(failed.passed).toBe(false)
    expect(failed.reqResults[0].p5).toEqual(comparison)
    const passed = evaluateTestCase(0, { in: [], out: [req] }, { ...run, p5Results: { [p5ReqKey(req)]: { ...comparison, passed: true } } }, '')
    expect(passed.passed).toBe(true)
    // Nothing compared (no tester result) is a failure, never a pass.
    expect(evaluateTestCase(0, { in: [], out: [req] }, { ...run, p5Results: {} }, '').passed).toBe(false)
  })
})

describe('the fallback with nothing to paint on', () => {
  it('compares the drawing operations, numbers within rounding', () => {
    const a = parseP5Capture(JSON.stringify({ w: 100, h: 100, ops: [['r', 1, 2, 3, 4.2]], images: {} }))!
    const b = parseP5Capture(JSON.stringify({ w: 100, h: 100, ops: [['r', 1, 2, 3, 4]], images: {} }))!
    const c = parseP5Capture(JSON.stringify({ w: 100, h: 100, ops: [['e', 1, 2, 3, 4]], images: {} }))!
    expect(sameOperations(a, b)).toBe(true)
    expect(sameOperations(a, c)).toBe(false)
    expect(parseP5Capture('not json')).toBeNull()
  })
})
