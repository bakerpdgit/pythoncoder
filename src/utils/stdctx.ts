// ── stdctx / stdaud: Python Sponge's canvas and audio libraries ───────────
//
// Ported from Python Sponge so that older funchallenge books (e.g. the
// "Fun tasks 4" clock face) that do `from sys import stdctx` keep working.
// `sys.stdaud` is the matching audio object: load() a clip, then play() it.
//
// The Python side mirrors the HTML5 Canvas 2D API: every draw call and every
// style assignment is turned into a small JSON command and shipped to the
// main thread, which replays it against a real <canvas>. Draw calls are sent
// immediately unless the program opts into double buffering by calling
// present(), in which case they are batched until the next present().

export const STDCTX_CANVAS_WIDTH = 500
export const STDCTX_CANVAS_HEIGHT = 400

export type StdctxCommand = Record<string, unknown> & { action?: string; clearCanvas?: boolean }

// ── Python bootstrap ───────────────────────────────────────────────────────
//
// Expects four callables in the enclosing globals:
//   js_stdctx_send(json_str)    — deliver a batch of draw commands
//   js_stdctx_check_key(code)   — is the Windows virtual key code held down?
//   js_stdctx_sleep(seconds)    — blocking sleep (worker only; no-op elsewhere)
//   js_stdaud_send(json_str)    — deliver one audio command

const STDCTX_CLASS = String.raw`
import json as _ctx_json
import sys as _ctx_sys


class _CoderStdCtx:
    """HTML canvas drawing context exposed to Python as sys.stdctx."""

    def __init__(self):
        self._width = 500
        self._height = 400
        self._fillStyle = "black"
        self._strokeStyle = "black"
        self._font = "10px sans-serif"
        self._lineWidth = 1.0
        self._textAlign = "start"
        self._textBaseline = "alphabetic"
        self._lineCap = "butt"
        self._lineJoin = "miter"
        self._miterLimit = 10
        self._lineDashOffset = 0.0
        self._direction = "inherit"
        self._shadowBlur = 0
        self._shadowColor = "fully-transparent black"
        self._shadowOffsetX = 0
        self._shadowOffsetY = 0
        self._filter = "none"
        self._commands = []
        # when double buffering is enabled, draw calls are batched
        # and only committed when calling present()
        self._double_buffering = False

    def _present(self):
        if not self._commands:
            return
        js_stdctx_send(_ctx_json.dumps(self._commands))
        self._commands = []

    def _add_command(self, cmd):
        self._commands.append(cmd)
        if not self._double_buffering:
            self._present()

    def present(self):
        self._present()
        # public call of this endpoint implies double buffering
        self._double_buffering = True

    def fillRect(self, x, y, width, height, clearCanvas=False):
        self._add_command({"action": "fillRect", "x": x, "y": y,
                           "width": width, "height": height, "clearCanvas": clearCanvas})

    def rect(self, x, y, width, height):
        self._add_command({"action": "rect", "x": x, "y": y,
                           "width": width, "height": height})

    def strokeRect(self, x, y, width, height, clearCanvas=False):
        self._add_command({"action": "strokeRect", "x": x, "y": y,
                           "width": width, "height": height, "clearCanvas": clearCanvas})

    def beginPath(self):
        self._add_command({"action": "beginPath"})

    def closePath(self):
        self._add_command({"action": "closePath"})

    def fill(self, fillRule="nonzero", clearCanvas=False):
        self._add_command({"action": "fill", "fillRule": fillRule,
                           "clearCanvas": clearCanvas})

    def stroke(self):
        self._add_command({"action": "stroke"})

    def clip(self):
        self._add_command({"action": "clip"})

    def save(self):
        self._add_command({"action": "save"})

    def restore(self):
        self._add_command({"action": "restore"})

    def arc(self, x, y, radius, startAngle, endAngle, counterclockwise=False):
        self._add_command({"action": "arc", "x": x, "y": y, "radius": radius,
                           "startAngle": startAngle, "endAngle": endAngle,
                           "counterclockwise": counterclockwise})

    def ellipse(self, x, y, radiusX, radiusY, rotation, startAngle, endAngle, counterclockwise=False):
        self._add_command({"action": "ellipse", "x": x, "y": y, "radiusX": radiusX,
                           "radiusY": radiusY, "rotation": rotation,
                           "startAngle": startAngle, "endAngle": endAngle,
                           "counterclockwise": counterclockwise})

    def arcTo(self, x1, y1, x2, y2, radius):
        self._add_command({"action": "arcTo", "x1": x1, "y1": y1,
                           "x2": x2, "y2": y2, "radius": radius})

    def bezierCurveTo(self, cp1x, cp1y, cp2x, cp2y, x, y):
        self._add_command({"action": "bezierCurveTo", "cp1x": cp1x, "cp1y": cp1y,
                           "cp2x": cp2x, "cp2y": cp2y, "x": x, "y": y})

    def quadraticCurveTo(self, cpx, cpy, x, y):
        self._add_command({"action": "quadraticCurveTo", "cpx": cpx,
                           "cpy": cpy, "x": x, "y": y})

    def moveTo(self, x, y):
        self._add_command({"action": "moveTo", "x": x, "y": y})

    def clearRect(self, x, y, width, height):
        self._add_command({"action": "clearRect", "x": x, "y": y,
                           "width": width, "height": height})

    def lineTo(self, x, y):
        self._add_command({"action": "lineTo", "x": x, "y": y})

    def setLineDash(self, value):
        self._add_command({"action": "setLineDash", "value": list(value)})

    def fillText(self, text, x, y, maxWidth="", clearCanvas=False):
        self._add_command({"action": "fillText", "text": str(text), "x": x,
                           "y": y, "maxWidth": maxWidth, "clearCanvas": clearCanvas})

    def strokeText(self, text, x, y, maxWidth="", clearCanvas=False):
        self._add_command({"action": "strokeText", "text": str(text), "x": x,
                           "y": y, "maxWidth": maxWidth, "clearCanvas": clearCanvas})

    def reset(self):
        self._commands = []
        self._double_buffering = False
        self._add_command({"action": "reset", "clearCanvas": True})

    def drawImage(self, imageURI, x, y, width, height):
        self._add_command({"action": "drawImage", "imageURI": imageURI, "dx": x,
                           "dy": y, "dwidth": width, "dheight": height})

    def check_key(self, key_code):
        return bool(js_stdctx_check_key(key_code))

    def resize(self, width, height):
        """Change the canvas size. Like the HTML canvas, this clears it."""
        self._width = int(width)
        self._height = int(height)
        self._add_command({"action": "resize", "width": self._width,
                           "height": self._height})

    @property
    def width(self):
        return self._width

    @width.setter
    def width(self, value):
        self.resize(value, self._height)

    @property
    def height(self):
        return self._height

    @height.setter
    def height(self, value):
        self.resize(self._width, value)

    @property
    def double_buffering(self):
        return self._double_buffering

    @double_buffering.setter
    def double_buffering(self, value):
        self._double_buffering = bool(value)

    @property
    def fillStyle(self):
        return self._fillStyle

    @fillStyle.setter
    def fillStyle(self, color):
        self._fillStyle = color
        self._add_command({"action": "fillStyle", "color": color})

    @property
    def strokeStyle(self):
        return self._strokeStyle

    @strokeStyle.setter
    def strokeStyle(self, color):
        self._strokeStyle = color
        self._add_command({"action": "strokeStyle", "color": color})

    @property
    def lineWidth(self):
        return self._lineWidth

    @lineWidth.setter
    def lineWidth(self, value):
        self._lineWidth = value
        self._add_command({"action": "lineWidth", "value": value})

    @property
    def font(self):
        return self._font

    @font.setter
    def font(self, value):
        self._font = value
        self._add_command({"action": "font", "value": value})

    @property
    def textAlign(self):
        return self._textAlign

    @textAlign.setter
    def textAlign(self, value):
        self._textAlign = value
        self._add_command({"action": "textAlign", "value": value})

    @property
    def textBaseline(self):
        return self._textBaseline

    @textBaseline.setter
    def textBaseline(self, value):
        self._textBaseline = value
        self._add_command({"action": "textBaseline", "value": value})

    @property
    def lineCap(self):
        return self._lineCap

    @lineCap.setter
    def lineCap(self, value):
        self._lineCap = value
        self._add_command({"action": "lineCap", "value": value})

    @property
    def lineJoin(self):
        return self._lineJoin

    @lineJoin.setter
    def lineJoin(self, value):
        self._lineJoin = value
        self._add_command({"action": "lineJoin", "value": value})

    @property
    def miterLimit(self):
        return self._miterLimit

    @miterLimit.setter
    def miterLimit(self, value):
        self._miterLimit = value
        self._add_command({"action": "miterLimit", "value": value})

    @property
    def lineDashOffset(self):
        return self._lineDashOffset

    @lineDashOffset.setter
    def lineDashOffset(self, value):
        self._lineDashOffset = value
        self._add_command({"action": "lineDashOffset", "value": value})

    @property
    def direction(self):
        return self._direction

    @direction.setter
    def direction(self, value):
        self._direction = value
        self._add_command({"action": "direction", "value": value})

    @property
    def shadowBlur(self):
        return self._shadowBlur

    @shadowBlur.setter
    def shadowBlur(self, value):
        self._shadowBlur = value
        self._add_command({"action": "shadowBlur", "value": value})

    @property
    def shadowColor(self):
        return self._shadowColor

    @shadowColor.setter
    def shadowColor(self, value):
        self._shadowColor = value
        self._add_command({"action": "shadowColor", "value": value})

    @property
    def shadowOffsetX(self):
        return self._shadowOffsetX

    @shadowOffsetX.setter
    def shadowOffsetX(self, value):
        self._shadowOffsetX = value
        self._add_command({"action": "shadowOffsetX", "value": value})

    @property
    def shadowOffsetY(self):
        return self._shadowOffsetY

    @shadowOffsetY.setter
    def shadowOffsetY(self, value):
        self._shadowOffsetY = value
        self._add_command({"action": "shadowOffsetY", "value": value})

    @property
    def filter(self):
        return self._filter

    @filter.setter
    def filter(self, value):
        self._filter = value
        self._add_command({"action": "filter", "value": value})


class _CoderStdAud:
    """Audio playback exposed to Python as sys.stdaud."""

    def load(self, source):
        js_stdaud_send(_ctx_json.dumps({"action": "load", "source": str(source)}))

    def play(self):
        js_stdaud_send(_ctx_json.dumps({"action": "play"}))


_coder_stdctx = _CoderStdCtx()
_ctx_sys.stdctx = _coder_stdctx
_coder_stdaud = _CoderStdAud()
_ctx_sys.stdaud = _coder_stdaud
_coder_stdctx.reset()
`

// Trace-worker flavour. Python's own time.sleep() does not reliably suspend a
// Pyodide worker, so it is swapped for a JS bridge that blocks on Atomics.wait
// — the same trick Python Sponge used with a synchronous XHR. Animated
// stdctx programs (sleep in a loop) therefore keep their pacing, and each
// queued draw batch reaches the canvas while the worker is parked.
export const STDCTX_WORKER_BOOTSTRAP = STDCTX_CLASS + String.raw`
import time as _ctx_time


def _coder_stdctx_sleep(seconds):
    js_stdctx_sleep(float(seconds))


_ctx_time.sleep = _coder_stdctx_sleep
`

// Main-thread flavour. Blocking there would freeze the browser, so the caller
// rewrites time.sleep(x) into await asyncio.sleep(x) instead (see
// STDCTX_MAIN_THREAD_BOOTSTRAP in mainThread.ts).
export const STDCTX_MAIN_THREAD_CLASS = STDCTX_CLASS

// Challenge-test flavour. Tests run headless in the tester worker, so draws go
// nowhere and sleeps are skipped entirely — the same shortcut Python Sponge's
// own test runner took, which keeps a canvas challenge's output assertions fast.
export const STDCTX_TEST_BOOTSTRAP = STDCTX_CLASS + String.raw`
import time as _ctx_time


def _coder_stdctx_test_sleep(seconds):
    return None


_ctx_time.sleep = _coder_stdctx_test_sleep
`

// ── Command renderer ───────────────────────────────────────────────────────

// All three maps are keyed on the URI the Python program passed, never on the
// resolved URL, so cache identity stays stable however the source resolved.
const imageCache = new Map<string, HTMLImageElement>()
// Images still loading. Without this, drawImage() inside an animation loop
// starts a fresh download every frame until the first one lands.
const pendingImages = new Map<string, HTMLImageElement>()
// URIs that failed to load, so a typo'd filename fails once instead of on
// every frame forever.
const failedImages = new Set<string>()

/** Forget every loaded image. Called when the canvas is reset for a new run. */
export const clearStdctxImageCache = (): void => {
  imageCache.clear()
  pendingImages.clear()
  failedImages.clear()
}

export const processCanvasCommand = (
  context: CanvasRenderingContext2D,
  cmd: StdctxCommand,
  /**
   * Turns the URI a program passed to drawImage() into something the browser
   * can fetch. Returning a string keeps the fast path synchronous; returning a
   * promise (for a virtual-filesystem lookup) defers only the `src` assignment,
   * which the onload handler below already copes with.
   */
  resolveImageUri?: (uri: string) => string | Promise<string>,
): void => {
  try {
    if (cmd.clearCanvas) {
      context.clearRect(0, 0, context.canvas.width, context.canvas.height)
    }
    switch (cmd.action) {
      case 'fill':
        context.fill(cmd.fillRule as CanvasFillRule)
        break
      case 'rect':
        context.rect(cmd.x as number, cmd.y as number, cmd.width as number, cmd.height as number)
        break
      case 'fillRect':
        context.fillRect(cmd.x as number, cmd.y as number, cmd.width as number, cmd.height as number)
        break
      case 'strokeRect':
        context.strokeRect(cmd.x as number, cmd.y as number, cmd.width as number, cmd.height as number)
        break
      case 'clearRect':
        context.clearRect(cmd.x as number, cmd.y as number, cmd.width as number, cmd.height as number)
        break
      case 'fillStyle':
        context.fillStyle = cmd.color as string
        break
      case 'strokeStyle':
        context.strokeStyle = cmd.color as string
        break
      case 'lineWidth':
        context.lineWidth = cmd.value as number
        break
      case 'lineCap':
        context.lineCap = cmd.value as CanvasLineCap
        break
      case 'lineJoin':
        context.lineJoin = cmd.value as CanvasLineJoin
        break
      case 'miterLimit':
        context.miterLimit = cmd.value as number
        break
      case 'setLineDash':
        context.setLineDash(cmd.value as number[])
        break
      case 'lineDashOffset':
        context.lineDashOffset = cmd.value as number
        break
      case 'font':
        context.font = cmd.value as string
        break
      case 'textAlign':
        context.textAlign = cmd.value as CanvasTextAlign
        break
      case 'textBaseline':
        context.textBaseline = cmd.value as CanvasTextBaseline
        break
      case 'direction':
        context.direction = cmd.value as CanvasDirection
        break
      case 'shadowBlur':
        context.shadowBlur = cmd.value as number
        break
      case 'shadowColor':
        context.shadowColor = cmd.value as string
        break
      case 'shadowOffsetX':
        context.shadowOffsetX = cmd.value as number
        break
      case 'shadowOffsetY':
        context.shadowOffsetY = cmd.value as number
        break
      case 'beginPath':
        context.beginPath()
        break
      case 'closePath':
        context.closePath()
        break
      case 'stroke':
        context.stroke()
        break
      case 'moveTo':
        context.moveTo(cmd.x as number, cmd.y as number)
        break
      case 'lineTo':
        context.lineTo(cmd.x as number, cmd.y as number)
        break
      case 'bezierCurveTo':
        context.bezierCurveTo(
          cmd.cp1x as number, cmd.cp1y as number,
          cmd.cp2x as number, cmd.cp2y as number,
          cmd.x as number, cmd.y as number,
        )
        break
      case 'quadraticCurveTo':
        context.quadraticCurveTo(cmd.cpx as number, cmd.cpy as number, cmd.x as number, cmd.y as number)
        break
      case 'arc':
        context.arc(
          cmd.x as number, cmd.y as number, cmd.radius as number,
          cmd.startAngle as number, cmd.endAngle as number,
          cmd.counterclockwise as boolean,
        )
        break
      case 'arcTo':
        context.arcTo(cmd.x1 as number, cmd.y1 as number, cmd.x2 as number, cmd.y2 as number, cmd.radius as number)
        break
      case 'ellipse':
        context.ellipse(
          cmd.x as number, cmd.y as number,
          cmd.radiusX as number, cmd.radiusY as number,
          cmd.rotation as number, cmd.startAngle as number, cmd.endAngle as number,
          cmd.counterclockwise as boolean,
        )
        break
      case 'filter':
        context.filter = cmd.value as string
        break
      case 'clip':
        context.clip()
        break
      case 'save':
        context.save()
        break
      case 'restore':
        context.restore()
        break
      case 'fillText':
        if (cmd.maxWidth === '') context.fillText(cmd.text as string, cmd.x as number, cmd.y as number)
        else context.fillText(cmd.text as string, cmd.x as number, cmd.y as number, cmd.maxWidth as number)
        break
      case 'strokeText':
        if (cmd.maxWidth === '') context.strokeText(cmd.text as string, cmd.x as number, cmd.y as number)
        else context.strokeText(cmd.text as string, cmd.x as number, cmd.y as number, cmd.maxWidth as number)
        break
      case 'drawImage': {
        const uri = String(cmd.imageURI ?? '')
        const cached = imageCache.get(uri)
        if (cached) {
          context.drawImage(cached, cmd.dx as number, cmd.dy as number, cmd.dwidth as number, cmd.dheight as number)
          break
        }
        // Already known bad, or already on its way — draw nothing this frame.
        // A pending image appears on the frame after it finishes loading.
        if (failedImages.has(uri) || pendingImages.has(uri)) break

        const img = new Image()
        pendingImages.set(uri, img)
        img.onload = () => {
          pendingImages.delete(uri)
          imageCache.set(uri, img)
          context.drawImage(img, cmd.dx as number, cmd.dy as number, cmd.dwidth as number, cmd.dheight as number)
        }
        img.onerror = () => {
          pendingImages.delete(uri)
          failedImages.add(uri)
          console.warn('stdctx.drawImage could not load:', uri)
        }
        const resolved = resolveImageUri ? resolveImageUri(uri) : uri
        if (typeof resolved === 'string') img.src = resolved
        else void resolved.then(src => { img.src = src }, () => img.onerror?.(new Event('error')))
        break
      }
      case 'resize': {
        // Assigning either dimension clears the canvas, exactly as the HTML
        // canvas does, and resets the context to its defaults.
        const width = Math.max(1, Math.round(Number(cmd.width)))
        const height = Math.max(1, Math.round(Number(cmd.height)))
        if (Number.isFinite(width) && Number.isFinite(height)) {
          context.canvas.width = width
          context.canvas.height = height
        }
        break
      }
      case 'reset': {
        context.clearRect(0, 0, context.canvas.width, context.canvas.height)
        // Reassigning the width resets every context setting to its default.
        const canvasWidth = context.canvas.width
        context.canvas.width = canvasWidth
        break
      }
      default:
        console.warn('unknown stdctx draw action:', cmd)
    }
  } catch (err) {
    console.warn('error processing stdctx draw action:', cmd, err)
  }
}

// ── Audio ──────────────────────────────────────────────────────────────────

export type StdaudCommand = { action?: string; source?: string }

/**
 * Apply one sys.stdaud command to an <audio> element. `resolveSource` turns the
 * string the program passed to load() into something the browser can fetch — a
 * blob URL for a virtual-filesystem file, or the string itself for a real URL.
 */
export const processAudioCommand = (
  audio: HTMLAudioElement,
  cmd: StdaudCommand,
  resolveSource: (source: string) => string,
): void => {
  try {
    if (cmd.action === 'load') {
      audio.src = resolveSource(String(cmd.source ?? ''))
      audio.load()
    } else if (cmd.action === 'play') {
      // Autoplay policy can reject this when nothing has been clicked yet;
      // that is the browser's call, not an error in the Python program.
      void audio.play().catch(() => { /* blocked by the browser */ })
    } else {
      console.warn('unknown stdaud action:', cmd)
    }
  } catch (err) {
    console.warn('error processing stdaud action:', cmd, err)
  }
}

// ── Keyboard ───────────────────────────────────────────────────────────────

const SPECIAL_KEY_CODES = new Map<string, number>([
  ['Backspace', 8],
  ['Tab', 9],
  ['Enter', 13],
  ['Shift', 16],
  ['Control', 17],
  ['Alt', 18],
  ['AltGraph', 18],
  ['Escape', 27],
  [' ', 32],
  ['PageUp', 33],
  ['PageDown', 34],
  ['End', 35],
  ['Home', 36],
  ['ArrowLeft', 37],
  ['Left', 37],
  ['ArrowUp', 38],
  ['Up', 38],
  ['ArrowRight', 39],
  ['Right', 39],
  ['ArrowDown', 40],
  ['Down', 40],
  ['Insert', 45],
  ['Delete', 46],
  ['Meta', 91],
])

/**
 * Map a JavaScript KeyboardEvent.key to the Windows virtual key code that
 * stdctx.check_key() expects. Letters map to their upper-case code point, so
 * `stdctx.check_key(ord("Q"))` works exactly as it did in Python Sponge.
 */
export const keyToVirtualKeyCode = (key: string): number | undefined => {
  const special = SPECIAL_KEY_CODES.get(key)
  if (special !== undefined) return special
  if (key.length === 1) return key.toUpperCase().charCodeAt(0)
  return undefined
}

export const STDCTX_KEY_BUFFER_SIZE = 256
