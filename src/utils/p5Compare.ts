// ── Marking a p5 sketch by what it draws ─────────────────────────────────────
//
// A `p5` test requirement names a solution file. The tester runs the student's
// sketch and the solution headlessly (src/python/p5 with no page: setup(),
// then draw() `frames` times, with the mouse where the test says), paints both
// last frames onto OffscreenCanvases with the very painter the page uses
// (utils/p5Draw.ts), and compares the pictures pixel by pixel. So two programs
// pass alike when they draw the same thing by different routes — square()
// or rect(), a loop or four lines, shapes that do not overlap in either order —
// which comparing the drawing commands could never allow.
//
// Two pictures of the same drawing still differ at the edges of shapes, where
// anti-aliasing blends a shape into what is behind it, and where equivalent
// strokes meet differently (three line()s with round caps, or a triangle()
// with mitred corners). So a pixel only counts as different when its colour
// cannot be found within a pixel of it in the other picture, and the result
// allows a little: see `p5PicturesMatch`.
//
// A browser without OffscreenCanvas (none current) falls back to comparing the
// drawing operations themselves, numbers within a rounding step.

import { P5ImageStore, P5Painter, type P5Capture } from './p5Draw'
import type { BookTestOutputReq, P5Comparison } from '../types'

export type { P5Comparison }

/** What a test says about how to run the sketch before comparing. */
export interface P5RunSettings {
  frames: number
  mouse: [number, number] | null
  pressed: boolean
}

const MAX_FRAMES = 600

export function p5RunSettings(req: BookTestOutputReq): P5RunSettings {
  const frames = Math.max(1, Math.min(MAX_FRAMES, Math.round(Number(req.frames ?? 1)) || 1))
  const m = req.mouse
  const mouse: [number, number] | null = Array.isArray(m) && m.length >= 2 && m.every(v => Number.isFinite(Number(v)))
    ? [Number(m[0]), Number(m[1])]
    : null
  return { frames, mouse, pressed: req.pressed === true || req.pressed === 'true' }
}

/** One comparison per solution file and way of running it: the key both the tester and the matcher use. */
export function p5ReqKey(req: BookTestOutputReq): string {
  const s = p5RunSettings(req)
  return JSON.stringify([req.filename ?? '', s.frames, s.mouse, s.pressed])
}

// ── Comparing two pictures ──────────────────────────────────────────────────

/** How far apart (0-255, in any of red, green and blue) two colours may be and still count as the same. */
const COLOUR_TOLERANCE = 24

function sameColour(a: Uint8ClampedArray, i: number, b: Uint8ClampedArray, j: number): boolean {
  return Math.abs(a[i] - b[j]) <= COLOUR_TOLERANCE
    && Math.abs(a[i + 1] - b[j + 1]) <= COLOUR_TOLERANCE
    && Math.abs(a[i + 2] - b[j + 2]) <= COLOUR_TOLERANCE
}

/** Is the colour of pixel (x, y) of `a` found in `b` at (x, y) or one of its neighbours? */
function foundNear(a: Uint8ClampedArray, b: Uint8ClampedArray, x: number, y: number, width: number, height: number): boolean {
  const i = (y * width + x) * 4
  for (let dy = -1; dy <= 1; dy++) {
    const yy = y + dy
    if (yy < 0 || yy >= height) continue
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx
      if (xx < 0 || xx >= width) continue
      if (sameColour(a, i, b, (yy * width + xx) * 4)) return true
    }
  }
  return false
}

export interface PixelDifference {
  /** 1 where the pictures really differ. */
  mask: Uint8Array
  mismatched: number
  /** Mismatched pixels whose eight neighbours all differ too: solid areas, not slivers along an edge. */
  core: number
}

/**
 * Where two same-sized RGBA pictures (already opaque: drawn over white)
 * differ, ignoring the edges anti-aliasing and stroke joins blur.
 */
export function comparePixels(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number): PixelDifference {
  const mask = new Uint8Array(width * height)
  let mismatched = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      if (sameColour(a, p * 4, b, p * 4)) continue
      if (foundNear(a, b, x, y, width, height) && foundNear(b, a, x, y, width, height)) continue
      mask[p] = 1
      mismatched++
    }
  }
  let core = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x
      if (!mask[p]) continue
      if (mask[p - 1] && mask[p + 1] && mask[p - width] && mask[p + width]
        && mask[p - width - 1] && mask[p - width + 1] && mask[p + width - 1] && mask[p + width + 1]) core++
    }
  }
  return { mask, mismatched, core }
}

/**
 * The verdict. Slivers along edges (where equivalent drawings legitimately
 * differ) are allowed up to about one pixel in two thousand; a solid patch of
 * difference — a shape missing, moved or the wrong colour — is not.
 */
export function p5PicturesMatch(diff: PixelDifference, width: number, height: number): boolean {
  const allowed = Math.max(50, Math.ceil((width * height) / 2000))
  return diff.core <= 8 && diff.mismatched <= allowed
}

// ── Painting a captured sketch ──────────────────────────────────────────────

export interface P5Raster {
  width: number
  height: number
  data: Uint8ClampedArray
  canvas: OffscreenCanvas
}

export function parseP5Capture(json: string): P5Capture | null {
  if (!json) return null
  try {
    const value = JSON.parse(json) as P5Capture
    if (!value || typeof value.w !== 'number' || typeof value.h !== 'number' || !Array.isArray(value.ops)) return null
    return value
  } catch {
    return null
  }
}

/** The sketch's last frame over white (as the page shows it), or null where there is no OffscreenCanvas. */
export async function rasterizeP5(capture: P5Capture): Promise<P5Raster | null> {
  if (typeof OffscreenCanvas === 'undefined') return null
  const width = Math.max(1, Math.round(capture.w))
  const height = Math.max(1, Math.round(capture.h))
  const sketch = new OffscreenCanvas(width, height)
  const ctx = sketch.getContext('2d')
  if (!ctx) return null
  const images = new P5ImageStore()
  for (const [id, [mime, b64]] of Object.entries(capture.images ?? {})) void images.define(id, mime, b64)
  await images.readyAll()
  new P5Painter(ctx, images, width, height).apply(capture.ops)
  const out = new OffscreenCanvas(width, height)
  const octx = out.getContext('2d')
  if (!octx) return null
  octx.fillStyle = '#ffffff'
  octx.fillRect(0, 0, width, height)
  octx.drawImage(sketch, 0, 0)
  return { width, height, data: octx.getImageData(0, 0, width, height).data, canvas: out }
}

export async function canvasToDataUrl(canvas: OffscreenCanvas): Promise<string> {
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:image/png;base64,${btoa(bin)}`
}

/** The expected picture, faded, with every pixel that differs in red. */
function diffCanvas(expected: P5Raster, mask: Uint8Array): OffscreenCanvas | null {
  const canvas = new OffscreenCanvas(expected.width, expected.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const img = ctx.createImageData(expected.width, expected.height)
  const src = expected.data
  for (let p = 0; p < mask.length; p++) {
    const i = p * 4
    if (mask[p]) {
      img.data[i] = 230; img.data[i + 1] = 0; img.data[i + 2] = 0
    } else {
      img.data[i] = 255 - (255 - src[i]) * 0.3
      img.data[i + 1] = 255 - (255 - src[i + 1]) * 0.3
      img.data[i + 2] = 255 - (255 - src[i + 2]) * 0.3
    }
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

const NUMBER = /-?\d+(?:\.\d+)?/g

/** Same operations, every number within a rounding step: the fallback with nothing to paint on. */
export function sameOperations(a: P5Capture, b: P5Capture): boolean {
  const ta = JSON.stringify([a.w, a.h, a.ops])
  const tb = JSON.stringify([b.w, b.h, b.ops])
  if (ta === tb) return true
  const partsA = ta.split(NUMBER)
  const partsB = tb.split(NUMBER)
  if (partsA.length !== partsB.length || partsA.some((part, i) => part !== partsB[i])) return false
  const na = ta.match(NUMBER) ?? []
  const nb = tb.match(NUMBER) ?? []
  return na.length === nb.length && na.every((n, i) => Math.abs(Number(n) - Number(nb[i])) <= 0.5)
}

/** The student's capture against the solution's: the verdict, and pictures of both when they differ. */
export async function compareP5Captures(actualJson: string, expectedJson: string): Promise<P5Comparison> {
  const expected = parseP5Capture(expectedJson)
  if (!expected?.started) {
    return { passed: false, method: 'pixels', message: 'The solution file did not draw a p5 sketch.' }
  }
  const actual = parseP5Capture(actualJson)
  const expectedRaster = await rasterizeP5(expected)
  const expectedUrl = expectedRaster ? await canvasToDataUrl(expectedRaster.canvas) : undefined
  if (!actual?.started) {
    return { passed: false, method: 'pixels', message: 'Your program did not draw a p5 sketch: does it call run(), or define setup() and draw()?', expected: expectedUrl }
  }
  if (!expectedRaster) {
    const passed = sameOperations(actual, expected)
    return { passed, method: 'operations', message: passed ? 'Your drawing matches.' : 'Your drawing is not the same as the expected one.' }
  }
  const actualRaster = await rasterizeP5(actual)
  if (!actualRaster) return { passed: false, method: 'pixels', message: 'Your drawing could not be painted to compare.' }
  const actualUrl = await canvasToDataUrl(actualRaster.canvas)
  if (actual.w !== expected.w || actual.h !== expected.h) {
    return {
      passed: false, method: 'pixels',
      message: `Your canvas is ${actual.w} × ${actual.h}; it should be ${expected.w} × ${expected.h}.`,
      expected: expectedUrl, actual: actualUrl,
    }
  }
  const diff = comparePixels(actualRaster.data, expectedRaster.data, expected.w, expected.h)
  const total = expected.w * expected.h
  const passed = p5PicturesMatch(diff, expected.w, expected.h)
  if (passed) return { passed, method: 'pixels', mismatched: diff.mismatched, total, message: 'Your drawing matches.' }
  const marked = diffCanvas(expectedRaster, diff.mask)
  const pct = (diff.mismatched / total) * 100
  return {
    passed, method: 'pixels', mismatched: diff.mismatched, total,
    message: `Your drawing differs from the expected one in ${diff.mismatched.toLocaleString()} pixel${diff.mismatched === 1 ? '' : 's'} (${pct < 0.1 ? pct.toFixed(2) : pct.toFixed(1)}% of the canvas), shown in red.`,
    expected: expectedUrl, actual: actualUrl, diff: marked ? await canvasToDataUrl(marked) : undefined,
  }
}
