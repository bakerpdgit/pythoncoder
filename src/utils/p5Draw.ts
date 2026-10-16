/* eslint-disable @typescript-eslint/no-explicit-any */
// ── p5 sketches, painted ─────────────────────────────────────────────────────
//
// Coder's p5 (src/python/p5) works out everything a call means in Python —
// rect_mode, colour modes, push/pop, the transformation matrix — and sends the
// page a frame's drawing as a list of small operations, each in final form:
// a matrix, a colour, a rectangle in that matrix's coordinates. This replays
// them onto a 2D canvas context. The same code paints the student's sketch in
// the tkinter window (utils/tkinterRenderer.ts, the `canvas2d` widget) and, in
// the tester worker, paints the student's and the solution's last frames onto
// OffscreenCanvases so they can be compared pixel by pixel (utils/p5Compare.ts).
//
// The page keeps no frame of its own: like p5.js, a canvas keeps what was
// drawn on it until something draws over it, so each frame's operations are
// simply applied on top of the last.
//
// Operations (numbers are already rounded to 3 decimals by Python):
//   size w h               resize (and so clear) the canvas
//   tf a b c d e f         the transformation matrix for what follows
//   fs css|0  ss css|0     fill / stroke colour, 0 for none
//   lw n  cap c  join j    stroke weight, cap and join
//   font css  ta align baseline
//   bg css                 paint the whole canvas, whatever the matrix
//   clr                    make the whole canvas transparent
//   r x y w h [radii]      rectangle      e cx cy rx ry  ellipse
//   a cx cy rx ry a0 a1 mode               arc (mode open|chord|pie|default)
//   l x1 y1 x2 y2          line           pt x y         point
//   p [x0 y0 x1 y1 ...] close              polygon or polyline
//   sh [[M x y] [L x y] [C ...] [Q ...] [Z]] close        any path
//   t text x y stroke      text
//   imgdef id mime b64     an image, decoded once     img id x y w h   draw it
//   cur css                the mouse pointer over the canvas

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
export type P5Op = any[]

/** What the tester gets back from a headless run (p5._coder_capture). */
export interface P5Capture {
  w: number
  h: number
  ops: P5Op[]
  images: Record<string, [string, string]>
  started?: boolean
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

type ImageSource = ImageBitmap | HTMLImageElement

interface StoredImage { source: ImageSource | null; failed: boolean; ready: Promise<void> }

/** The sketch's pictures, decoded once each. Decoding is asynchronous, so drawing waits for it (P5Painter.apply). */
export class P5ImageStore {
  private images = new Map<string, StoredImage>()

  define(id: string, mime: string, b64: string): Promise<void> {
    const known = this.images.get(id)
    if (known) return known.ready
    const entry: StoredImage = { source: null, failed: false, ready: Promise.resolve() }
    entry.ready = decodeImage(mime, b64).then(
      source => { entry.source = source },
      () => { entry.failed = true },
    )
    this.images.set(id, entry)
    return entry.ready
  }

  /** Defined but not decoded yet: anything drawn after it has to wait. */
  isPending(id: string): boolean {
    const entry = this.images.get(id)
    return !!entry && !entry.source && !entry.failed
  }

  get(id: string): ImageSource | null {
    return this.images.get(id)?.source ?? null
  }

  ready(id: string): Promise<void> {
    return this.images.get(id)?.ready ?? Promise.resolve()
  }

  async readyAll(): Promise<void> {
    await Promise.all([...this.images.values()].map(entry => entry.ready))
  }
}

async function decodeImage(mime: string, b64: string): Promise<ImageSource> {
  const blob = new Blob([base64ToBytes(b64) as BlobPart], { type: mime || 'image/png' })
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob)
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image could not be decoded')) }
    img.src = url
  })
}

export interface P5PainterOptions {
  /** Canvas pixels per sketch pixel (the screen's devicePixelRatio on the page, 1 for marking). */
  scale?: number
  /** The sketch asked for a new size: the canvas has been resized, its box should follow. */
  onResize?: (width: number, height: number) => void
  onCursor?: (css: string) => void
}

const TWO_PI = Math.PI * 2

export class P5Painter {
  width: number
  height: number
  private fill: string | 0 = 'rgb(255,255,255)'
  private stroke: string | 0 = 'rgb(0,0,0)'
  private lineWidth = 1
  private cap: CanvasLineCap = 'round'
  private join: CanvasLineJoin = 'miter'
  private font = '12px sans-serif'
  private align: CanvasTextAlign = 'left'
  private baseline: CanvasTextBaseline = 'alphabetic'
  private tf: number[] = [1, 0, 0, 1, 0, 0]
  private readonly scale: number

  constructor(
    readonly ctx: Ctx2D,
    readonly images: P5ImageStore,
    width: number,
    height: number,
    private readonly options: P5PainterOptions = {},
  ) {
    this.scale = options.scale ?? 1
    this.width = width
    this.height = height
    this.applyTransform()
  }

  /** Resize the canvas; like p5's createCanvas, that leaves it blank. */
  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    this.width = w
    this.height = h
    const canvas = this.ctx.canvas as HTMLCanvasElement | OffscreenCanvas
    canvas.width = Math.round(w * this.scale)
    canvas.height = Math.round(h * this.scale)
    // Resizing resets every context setting.
    this.applyTransform()
    this.options.onResize?.(w, h)
  }

  /**
   * Paint `ops` from `start`. Returns where it stopped: everything after an
   * image that is still being decoded waits for it, so a frame is never drawn
   * with a hole where a picture belongs (P5ImageStore.ready says when).
   */
  apply(ops: P5Op[], start = 0): number {
    for (let i = start; i < ops.length; i++) {
      const op = ops[i]
      if (!Array.isArray(op)) continue
      if (op[0] === 'img' && this.images.isPending(String(op[1]))) return i
      try {
        this.one(op)
      } catch {
        // One operation the canvas refuses (a negative radius, say) costs that shape only.
      }
    }
    return ops.length
  }

  private applyTransform() {
    const s = this.scale
    const [a, b, c, d, e, f] = this.tf
    this.ctx.setTransform(a * s, b * s, c * s, d * s, e * s, f * s)
  }

  private paint() {
    const ctx = this.ctx
    if (this.fill) {
      ctx.fillStyle = this.fill
      ctx.fill()
    }
    this.strokeOnly()
  }

  private strokeOnly() {
    if (!this.stroke || this.lineWidth <= 0) return
    const ctx = this.ctx
    ctx.strokeStyle = this.stroke
    ctx.lineWidth = this.lineWidth
    ctx.lineCap = this.cap
    ctx.lineJoin = this.join
    ctx.stroke()
  }

  private one(op: P5Op) {
    const ctx = this.ctx
    switch (op[0]) {
      case 'size': this.resize(Number(op[1]), Number(op[2])); break
      case 'tf': this.tf = op.slice(1, 7).map(Number); this.applyTransform(); break
      case 'fs': this.fill = op[1] || 0; break
      case 'ss': this.stroke = op[1] || 0; break
      case 'lw': this.lineWidth = Number(op[1]); break
      case 'cap': this.cap = op[1] as CanvasLineCap; break
      case 'join': this.join = op[1] as CanvasLineJoin; break
      case 'font': this.font = String(op[1]); break
      case 'ta': this.align = op[1] as CanvasTextAlign; this.baseline = op[2] as CanvasTextBaseline; break
      case 'bg': {
        ctx.save()
        ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0)
        ctx.fillStyle = String(op[1])
        ctx.fillRect(0, 0, this.width, this.height)
        ctx.restore()
        break
      }
      case 'clr': {
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
        ctx.restore()
        break
      }
      case 'r': {
        const [, x, y, w, h, radii] = op
        ctx.beginPath()
        if (Array.isArray(radii)) roundRectPath(ctx, x, y, w, h, radii.map(Number))
        else ctx.rect(x, y, w, h)
        this.paint()
        break
      }
      case 'e': {
        const [, cx, cy, rx, ry] = op
        ctx.beginPath()
        ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, TWO_PI)
        this.paint()
        break
      }
      case 'a': {
        const [, cx, cy, rx, ry, a0, a1, mode] = op
        const rX = Math.abs(rx), rY = Math.abs(ry)
        // As p5.js: filled as a pie unless the mode says otherwise, outlined as the mode says.
        if (this.fill) {
          ctx.beginPath()
          ctx.ellipse(cx, cy, rX, rY, 0, a0, a1)
          if (mode === 'pie' || mode === 'default') ctx.lineTo(cx, cy)
          ctx.closePath()
          ctx.fillStyle = this.fill
          ctx.fill()
        }
        if (this.stroke) {
          ctx.beginPath()
          ctx.ellipse(cx, cy, rX, rY, 0, a0, a1)
          if (mode === 'pie') { ctx.lineTo(cx, cy); ctx.closePath() } else if (mode === 'chord') ctx.closePath()
          this.strokeOnly()
        }
        break
      }
      case 'l': {
        ctx.beginPath()
        ctx.moveTo(op[1], op[2])
        ctx.lineTo(op[3], op[4])
        this.strokeOnly()
        break
      }
      case 'pt': {
        if (!this.stroke) break
        const r = Math.max(this.lineWidth, 1) / 2
        ctx.fillStyle = this.stroke
        if (this.cap === 'round') {
          ctx.beginPath()
          ctx.arc(op[1], op[2], r, 0, TWO_PI)
          ctx.fill()
        } else {
          ctx.fillRect(op[1] - r, op[2] - r, r * 2, r * 2)
        }
        break
      }
      case 'p': {
        const pts: number[] = op[1] ?? []
        if (pts.length < 4) break
        ctx.beginPath()
        ctx.moveTo(pts[0], pts[1])
        for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
        if (op[2]) ctx.closePath()
        this.paint()
        break
      }
      case 'sh': {
        ctx.beginPath()
        for (const seg of (op[1] ?? []) as any[][]) {
          switch (seg[0]) {
            case 'M': ctx.moveTo(seg[1], seg[2]); break
            case 'L': ctx.lineTo(seg[1], seg[2]); break
            case 'C': ctx.bezierCurveTo(seg[1], seg[2], seg[3], seg[4], seg[5], seg[6]); break
            case 'Q': ctx.quadraticCurveTo(seg[1], seg[2], seg[3], seg[4]); break
            case 'Z': ctx.closePath(); break
          }
        }
        if (op[2]) ctx.closePath()
        this.paint()
        break
      }
      case 't': {
        ctx.font = this.font
        ctx.textAlign = this.align
        ctx.textBaseline = this.baseline
        const text = String(op[1])
        if (this.fill) {
          ctx.fillStyle = this.fill
          ctx.fillText(text, op[2], op[3])
        }
        if (op[4] && this.stroke && this.lineWidth > 0) {
          ctx.strokeStyle = this.stroke
          ctx.lineWidth = this.lineWidth
          ctx.lineJoin = this.join
          ctx.strokeText(text, op[2], op[3])
        }
        break
      }
      case 'imgdef': void this.images.define(String(op[1]), String(op[2]), String(op[3])); break
      case 'img': {
        const source = this.images.get(String(op[1]))
        if (source) ctx.drawImage(source, op[2], op[3], op[4], op[5])
        break
      }
      case 'cur': this.options.onCursor?.(String(op[1] ?? '')); break
      default: break
    }
  }
}

function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, radii: number[]) {
  const [tl, tr, br, bl] = [0, 1, 2, 3].map(i => Math.max(0, radii[i] ?? radii[0] ?? 0))
  ctx.moveTo(x + tl, y)
  ctx.lineTo(x + w - tr, y)
  ctx.arcTo(x + w, y, x + w, y + tr, tr)
  ctx.lineTo(x + w, y + h - br)
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br)
  ctx.lineTo(x + bl, y + h)
  ctx.arcTo(x, y + h, x, y + h - bl, bl)
  ctx.lineTo(x, y + tl)
  ctx.arcTo(x, y, x + tl, y, tl)
  ctx.closePath()
}
