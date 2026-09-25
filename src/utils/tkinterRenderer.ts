/* eslint-disable @typescript-eslint/no-explicit-any */
// ── tkinter, drawn in the page ────────────────────────────────────────────────
//
// The Python half (src/python/tkinter) owns every widget's state and sends
// batches of operations here as JSON; this turns them into DOM elements inside
// the Display pane and queues what the student does (clicks, typing, key
// presses) for Python to collect with poll().
//
// Geometry managers are emulated with CSS rather than re-implemented:
//   - grid  → CSS grid, weights as `fr` tracks, sticky as justify/align-self;
//   - pack  → nested flex boxes. Each run of slaves packed against the same
//             side shares one flex container, and whatever follows goes into a
//             "cavity" box that takes the rest of the space — which is exactly
//             how Tk's packer carves up its master;
//   - place → absolute positioning, relx/rely as percentages.
// Every packed slave sits in a "parcel" (the slice of the cavity Tk gives it),
// so expand (the parcel grows) and fill (the widget grows within its parcel)
// stay separate, as they are in Tk.
//
// Everything is styled to look like a Tk window on Windows, whatever the app's
// own theme: a tkinter program chooses its own colours, and they assume Tk's.

type Props = Record<string, any>
type Manager = 'pack' | 'grid' | 'place' | 'notebook' | 'canvas' | null

interface GridConf { weight: number; minsize: number; pad: number }

interface CanvasItem { id: number; type: string; coords: number[]; props: Props; el: SVGElement }

interface CanvasState {
  svg: SVGSVGElement
  bg: SVGRectElement
  items: Map<number, CanvasItem>
  current: number | null
}

interface Widget {
  id: number
  kind: string
  parent: number | null
  props: Props
  el: HTMLElement
  inner: HTMLElement | null
  manager: Manager
  master: number | null
  mopts: any
  slaves: Set<number>
  packOrder: number[]
  gridConf: { row: Map<number, GridConf>; column: Map<number, GridConf> }
  propagate: { pack: boolean; grid: boolean }
  gridAnchor: string
  stretch: { x: boolean; y: boolean }
  req: { width: string | null; height: string | null; minWidth: string | null }
  placeSize: { width: string | null; height: string | null }
  ipad: [number, number]
  // kind-specific parts
  field?: HTMLInputElement | HTMLTextAreaElement
  check?: HTMLInputElement
  content?: HTMLElement
  legend?: HTMLElement
  title?: HTMLElement
  titleText?: HTMLElement
  menubar?: HTMLElement
  canvas?: CanvasState
  list?: { items: string[]; styles: Record<string, any>; selection: Set<number>; anchor: number }
  range?: HTMLInputElement
  valueLabel?: HTMLElement
  scaleLabel?: HTMLElement
  select?: HTMLSelectElement
  bar?: HTMLElement
  tabstrip?: HTMLElement
  tabs?: { w: number; text: string; state: string; image: string | null }[]
  currentTab?: number | null
  tree?: any
  treeTable?: HTMLTableElement
}

interface Dialog { el: HTMLElement; resolve: (value: string) => void; cancel: () => void }

export interface TkRendererOptions {
  /** When true the renderer leaves keyboard focus alone (e.g. the console is asking for input()). */
  shouldYieldFocus?: () => boolean
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const STYLE_ID = 'tkx-style'

const FONT_DEFAULT = '9pt "Segoe UI", system-ui, sans-serif'

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  return el
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag)
}

/** A colour from Python: null = use the default, '' = no colour at all. */
function col(value: any, fallback: string): string {
  if (value === null || value === undefined) return fallback
  if (value === '') return 'transparent'
  return String(value)
}

function has(value: any): boolean {
  return value !== null && value !== undefined && value !== ''
}

const RELIEF: Record<string, string> = {
  raised: 'outset', sunken: 'inset', groove: 'groove', ridge: 'ridge', solid: 'solid', flat: 'solid',
}

function anchorFlex(anchor: string): { justify: string; align: string } {
  const a = anchor || 'center'
  return {
    justify: a.includes('w') ? 'flex-start' : a.includes('e') && a !== 'center' ? 'flex-end' : 'center',
    align: a.startsWith('n') ? 'flex-start' : a.startsWith('s') ? 'flex-end' : 'center',
  }
}

function anchorTranslate(anchor: string): string {
  const a = anchor || 'nw'
  const x = a.includes('w') ? '0' : a.includes('e') && a !== 'center' ? '-100%' : '-50%'
  const y = a.startsWith('n') ? '0' : a.startsWith('s') ? '-100%' : '-50%'
  return x === '0' && y === '0' ? '' : `translate(${x}, ${y})`
}

/**
 * Tk's 3-D borders as Windows draws them: a raised edge is light on the top
 * and left and dark on the bottom and right, in two rings when it is two
 * pixels wide. CSS `outset` shades from the background colour instead, which
 * all but disappears on Tk's pale grey.
 */
function drawRelief(el: HTMLElement, relief: string, bd: number, bg: string) {
  el.style.boxShadow = ''
  if (!bd) { el.style.border = '0'; return }
  if (relief === 'raised' || relief === 'sunken') {
    const [light, dark, midLight, midDark] = relief === 'raised'
      ? ['#ffffff', '#696969', '#e3e3e3', '#a0a0a0']
      : ['#a0a0a0', '#ffffff', '#696969', '#e3e3e3']
    el.style.borderWidth = `${bd >= 2 ? 1 : bd}px`
    el.style.borderStyle = 'solid'
    el.style.borderColor = `${light} ${dark} ${dark} ${light}`
    if (bd >= 2) {
      const inner = bd - 1
      el.style.boxShadow = `inset ${inner}px ${inner}px 0 0 ${midLight}, inset -${inner}px -${inner}px 0 0 ${midDark}`
    }
    return
  }
  el.style.borderWidth = `${bd}px`
  if (relief === 'groove' || relief === 'ridge') {
    el.style.borderStyle = relief
    el.style.borderColor = bd >= 2 ? '#d5d5d5' : '#a0a0a0'
    return
  }
  el.style.borderStyle = 'solid'
  el.style.borderColor = relief === 'solid' ? '#000' : (bg === 'transparent' ? 'transparent' : bg)
}

function sizeCss(spec: any): string | null {
  if (!spec) return null
  const [n, unit] = spec as [number, string]
  if (!n) return null
  const v = Math.abs(n)
  if (unit === 'px') return `${v}px`
  if (unit === 'lines') return `${(v * 1.2).toFixed(3)}em`
  return `${v}ch`
}

const TK_STYLES = String.raw`
.tkx-root { position: relative; min-width: 100%; min-height: 100%; font: ${FONT_DEFAULT}; color: #000; color-scheme: light; }
.tkx-root *, .tkx-root *::before, .tkx-root *::after { box-sizing: content-box; }
.tkx-root img { max-width: none; height: auto; display: inline-block; }
.tkx-windows { position: relative; display: flex; flex-direction: column; align-items: center; gap: 18px;
  padding: 18px; width: max-content; min-width: 100%; box-sizing: border-box !important; }
.tkx-ended .tkx-window { pointer-events: none; }
.tkx-ended .tkx-title { background: #f3f3f3; color: #888; }
.tkx-window { display: flex; flex-direction: column; background: #f0f0f0; border: 1px solid #8a8a8a;
  box-shadow: 0 6px 24px rgba(0,0,0,.35); position: relative; }
.tkx-window.tkx-grabbed-out { opacity: .6; pointer-events: none; }
.tkx-title { display: flex; align-items: center; height: 30px; padding-left: 10px; background: #fff; color: #000;
  font: 9pt "Segoe UI", system-ui, sans-serif; user-select: none; border-bottom: 1px solid #e1e1e1; gap: 8px; }
.tkx-titleicon { width: 16px; height: 16px; flex: none; border-radius: 3px;
  background: linear-gradient(135deg, #3b82f6, #10b981); }
.tkx-titletext { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tkx-close { width: 46px; height: 30px; border: 0; margin: 0; padding: 0; background: transparent; color: #000;
  font: 14px system-ui, sans-serif; cursor: pointer; }
.tkx-close:hover { background: #e81123; color: #fff; }
.tkx-menubar { display: flex; background: #fff; border-bottom: 1px solid #f0f0f0; font: 9pt "Segoe UI", system-ui, sans-serif; }
.tkx-menubar:empty { display: none; }
.tkx-mbitem { padding: 3px 8px; cursor: default; user-select: none; white-space: pre; }
.tkx-mbitem:hover, .tkx-mbitem.tkx-open { background: #e5f3ff; }
.tkx-body { position: relative; outline: none; background: #f0f0f0; }
.tkx-parcel, .tkx-cavity { display: flex; min-width: 0; min-height: 0; }
.tkx-w { margin: 0; }
.tkx-label, .tkx-button, .tkx-check, .tkx-mbutton { display: inline-flex; align-items: center; justify-content: center;
  white-space: pre; line-height: 1.2; background: #f0f0f0; user-select: none; cursor: default; font: inherit; color: #000; }
.tkx-label img, .tkx-button img, .tkx-check img { display: block; }
.tkx-content { display: inline-flex; align-items: center; gap: 2px; }
.tkx-button { cursor: default; outline: none; text-align: center; }
.tkx-button:disabled, .tkx-check.tkx-disabled, .tkx-mbutton:disabled { cursor: default; }
.tkx-check input { margin: 0 4px 0 0; accent-color: #0078d7; }
.tkx-check.tkx-noindicator input { display: none; }
.tkx-entry, .tkx-text { font: inherit; margin: 0; background: #fff; color: #000; outline: none; }
.tkx-entry:focus, .tkx-text:focus { outline: none; }
.tkx-text { resize: none; line-height: 1.2; overflow: auto; }
.tkx-listbox { background: #fff; overflow-y: auto; overflow-x: hidden; outline: none; cursor: default; user-select: none; line-height: 1.25; }
.tkx-lbitem { white-space: pre; padding: 0 2px; height: 1.25em; line-height: 1.25em; overflow: hidden; }
.tkx-lbitem.tkx-sel { background: var(--tk-selbg, #0078d7); color: var(--tk-selfg, #fff); }
.tkx-scale { display: inline-flex; align-items: center; background: #f0f0f0; user-select: none; }
.tkx-scale.tkx-horizontal { flex-direction: column; align-items: stretch; }
.tkx-scale input { margin: 2px; accent-color: #0078d7; }
.tkx-scale .tkx-scalevalue { text-align: center; min-width: 3ch; }
.tkx-scale.tkx-vertical input { writing-mode: vertical-lr; direction: ltr; }
.tkx-spin { display: inline-flex; align-items: stretch; background: #fff; }
.tkx-spin input { border: 0 !important; outline: none; min-width: 0; }
.tkx-spinbtns { display: flex; flex-direction: column; width: 16px; }
.tkx-spinbtns button { flex: 1; border: 1px outset #f0f0f0; background: #f0f0f0; font-size: 7px; line-height: 1; padding: 0; margin: 0; cursor: default; color: #000; }
.tkx-canvas { position: relative; overflow: hidden; display: block; }
.tkx-canvas svg { display: block; overflow: hidden; }
.tkx-overlay { position: absolute; inset: 0; pointer-events: none; }
.tkx-overlay > * { pointer-events: auto; }
.tkx-labelframe { position: relative; }
.tkx-legend { position: absolute; top: 0; transform: translateY(-50%); padding: 0 2px; white-space: pre; line-height: 1.2; background: inherit; }
.tkx-lfinner { position: relative; }
.tkx-select { font: inherit; margin: 0; color: #000; cursor: default; }
.tkx-progress { position: relative; overflow: hidden; background: #e6e6e6; border: 1px solid #bcbcbc; }
.tkx-progress > div { position: absolute; left: 0; top: 0; bottom: 0; background: #06b025; }
.tkx-progress.tkx-vertical > div { top: auto; right: 0; }
.tkx-progress.tkx-indeterminate > div { width: 25% !important; animation: tkx-indet 1.2s linear infinite; }
@keyframes tkx-indet { from { left: -25%; } to { left: 100%; } }
.tkx-separator { background: transparent; }
.tkx-notebook { display: flex; flex-direction: column; }
.tkx-tabstrip { display: flex; gap: 0; padding-left: 2px; position: relative; z-index: 1; margin-bottom: -1px; }
.tkx-tab { padding: 2px 10px; border: 1px solid #d9d9d9; border-bottom-color: #d9d9d9; background: #f0f0f0; margin-right: -1px;
  cursor: default; user-select: none; white-space: pre; position: relative; top: 2px; }
.tkx-tab:hover { background: #d8eaf9; }
.tkx-tab.tkx-sel { background: #fff; border-bottom-color: #fff; top: 0; padding-bottom: 4px; }
.tkx-tab.tkx-disabled { color: #a0a0a0; }
.tkx-nbbody { display: grid; border: 1px solid #d9d9d9; background: #fff; position: relative; }
.tkx-nbbody > * { grid-area: 1 / 1; }
.tkx-tree { background: #fff; border: 1px solid #828790; overflow: auto; outline: none; user-select: none; cursor: default; }
.tkx-tree table { border-collapse: collapse; table-layout: fixed; }
.tkx-tree th { position: sticky; top: 0; background: #fff; font-weight: normal; border-right: 1px solid #e5e5e5;
  border-bottom: 1px solid #e5e5e5; padding: 2px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; z-index: 1; }
.tkx-tree th.tkx-clickable:hover { background: #d9ebf9; }
.tkx-tree td { padding: 0 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; height: var(--tk-rowh, 20px); }
.tkx-tree tr.tkx-sel td { background: var(--tk-selbg, #0078d7); color: var(--tk-selfg, #fff); }
.tkx-toggle { display: inline-block; width: 14px; text-align: center; color: #555; }
.tkx-sizegrip { width: 14px; height: 14px; background:
  linear-gradient(135deg, transparent 55%, #a0a0a0 55%, #a0a0a0 62%, transparent 62%, transparent 72%, #a0a0a0 72%, #a0a0a0 79%, transparent 79%); }
.tkx-menu { position: absolute; z-index: 50; min-width: 140px; background: #f2f2f2; border: 1px solid #ccc;
  box-shadow: 2px 3px 8px rgba(0,0,0,.25); padding: 2px 0; font: 9pt "Segoe UI", system-ui, sans-serif; color: #000; user-select: none; }
.tkx-menuitem { display: flex; align-items: center; gap: 12px; padding: 3px 12px 3px 6px; white-space: pre; cursor: default; }
.tkx-menuitem .tkx-mark { width: 16px; text-align: center; }
.tkx-menuitem .tkx-mlabel { flex: 1; }
.tkx-menuitem .tkx-accel { color: #6d6d6d; }
.tkx-menuitem:not(.tkx-disabled):hover, .tkx-menuitem.tkx-open { background: var(--tk-mabg, #91c9f7); color: var(--tk-mafg, #000); }
.tkx-menuitem.tkx-disabled { color: #a0a0a0; }
.tkx-menusep { height: 1px; background: #d7d7d7; margin: 3px 2px 3px 28px; }
.tkx-tearoff { height: 6px; margin: 2px 4px; border-top: 1px dashed #909090; }
.tkx-dropdown { position: absolute; z-index: 50; background: #fff; border: 1px solid #7a7a7a; max-height: 220px; overflow-y: auto;
  font: inherit; user-select: none; box-shadow: 1px 2px 6px rgba(0,0,0,.25); }
.tkx-dropdown div { padding: 1px 4px; white-space: pre; cursor: default; }
.tkx-dropdown div:hover, .tkx-dropdown div.tkx-sel { background: #0078d7; color: #fff; }
.tkx-combo { display: inline-flex; align-items: stretch; background: #fff; position: relative; }
.tkx-combo input { border: 0 !important; outline: none; min-width: 0; background: transparent; }
.tkx-combo button { width: 17px; border: 0; margin: 0; padding: 0; background: transparent; font-size: 9px; color: #333; cursor: default; }
.tkx-combo button:hover { background: #e5f1fb; }
.tkx-ttk.tkx-button { background: #e1e1e1; border: 1px solid #adadad; padding: 2px 6px; }
.tkx-ttk.tkx-button:not(:disabled):hover { background: var(--tk-ttk-abg, #e5f1fb); border-color: #0078d7; color: var(--tk-ttk-afg, inherit); }
.tkx-ttk.tkx-button:not(:disabled):active { background: var(--tk-ttk-pbg, #cce4f7); border-color: #005499; border-style: solid !important; }
.tkx-ttk.tkx-button:disabled { background: #cccccc; border-color: #bfbfbf; color: #838383; }
.tkx-ttk.tkx-entry, .tkx-ttk.tkx-combo, .tkx-ttk.tkx-spin { border: 1px solid #7a7a7a; padding: 1px 2px; }
.tkx-ttk.tkx-entry:hover, .tkx-ttk.tkx-combo:hover, .tkx-ttk.tkx-spin:hover { border-color: #171717; }
.tkx-ttk.tkx-entry:focus, .tkx-ttk.tkx-combo:focus-within, .tkx-ttk.tkx-spin:focus-within { border-color: #0078d7; }
.tkx-ttk.tkx-entry:disabled, .tkx-ttk.tkx-combo.tkx-disabled { background: #f0f0f0; color: #6d6d6d; border-color: #cccccc; }
.tkx-ttk.tkx-mbutton, .tkx-ttk.tkx-select { background: #e1e1e1; border: 1px solid #adadad; padding: 2px 4px; }
.tkx-overlayer { position: absolute; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.18); pointer-events: auto; }
.tkx-dialog { background: #fff; border: 1px solid #8a8a8a; box-shadow: 0 8px 30px rgba(0,0,0,.4); min-width: 260px; max-width: min(460px, 92%);
  font: 9pt "Segoe UI", system-ui, sans-serif; color: #000; display: flex; flex-direction: column; }
.tkx-dialog .tkx-title { border-bottom: 0; }
.tkx-dmain { display: flex; gap: 12px; padding: 14px 18px 18px; align-items: flex-start; }
.tkx-dicon { width: 32px; height: 32px; flex: none; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  color: #fff; font: bold 18px system-ui, sans-serif; }
.tkx-dicon.info { background: #1f6fd1; } .tkx-dicon.warning { background: #f0b400; color: #000; border-radius: 4px; }
.tkx-dicon.error { background: #d32f2f; } .tkx-dicon.question { background: #1f6fd1; }
.tkx-dtext { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.35; padding-top: 6px; }
.tkx-ddetail { color: #444; margin-top: 8px; }
.tkx-dbuttons { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 12px; background: #f0f0f0; border-top: 1px solid #dfdfdf; }
.tkx-dbuttons button { min-width: 72px; padding: 3px 10px; background: #e1e1e1; border: 1px solid #adadad; font: inherit; color: #000; cursor: default; }
.tkx-dbuttons button:hover, .tkx-dbuttons button:focus { background: #e5f1fb; border-color: #0078d7; outline: none; }
.tkx-dfield { font: inherit; border: 1px solid #7a7a7a; padding: 3px 4px; width: calc(100% - 10px); margin-top: 6px; outline: none; }
.tkx-dfield:focus { border-color: #0078d7; }
.tkx-dfiles { border: 1px solid #7a7a7a; height: 150px; overflow-y: auto; margin-top: 6px; width: 100%; }
.tkx-dfiles div { padding: 1px 4px; white-space: pre; cursor: default; }
.tkx-dfiles div.tkx-sel { background: #0078d7; color: #fff; }
.tkx-dcol { display: flex; flex-direction: column; flex: 1; min-width: 0; }
`

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = TK_STYLES
  document.head.appendChild(style)
}

let measureCtx: CanvasRenderingContext2D | null = null
function measure(): CanvasRenderingContext2D | null {
  if (!measureCtx) {
    try { measureCtx = document.createElement('canvas').getContext('2d') } catch { measureCtx = null }
  }
  return measureCtx
}

function globToRegExp(glob: string): RegExp {
  const src = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${src}$`, 'i')
}

export class TkRenderer {
  private host: HTMLElement
  private root: HTMLElement
  private windows: HTMLElement
  private overlay: HTMLElement
  private widgets = new Map<number, Widget>()
  private images = new Map<string, { src: string | null; w: number; h: number }>()
  private events: any[] = []
  private want = new Set<string>()
  private layoutDirty = new Set<number>()
  private zoom = 1
  private fit = false
  private fitObserver: ResizeObserver | null = null
  private wakers: (() => void)[] = []
  private grab: number | null = null
  private ended = false
  private dialogs: Dialog[] = []
  private openMenus: HTMLElement[] = []
  private hoverChain: number[] = []
  private zCounter = 1
  private resizeObserver: ResizeObserver | null = null
  private lastSizes = new Map<number, string>()
  private options: TkRendererOptions
  private docListener: ((e: MouseEvent) => void) | null = null
  private theme = 'vista'

  constructor(host: HTMLElement, options: TkRendererOptions = {}) {
    ensureStyles()
    this.options = options
    this.host = host
    host.innerHTML = ''
    this.root = h('div', 'tkx-root')
    this.windows = h('div', 'tkx-windows')
    this.overlay = h('div')
    this.overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
    this.root.append(this.windows, this.overlay)
    host.appendChild(this.root)
    this.attachListeners()
  }

  // ── The four calls Python makes ─────────────────────────────────────────

  flush(json: string): void {
    let ops: any[]
    try { ops = JSON.parse(json) } catch { return }
    for (const op of ops) {
      try { this.apply(op) } catch (err) { console.warn('[tkinter] could not apply', op?.[0], err) }
    }
    this.relayoutDirty()
  }

  query(json: string): string {
    let q: any
    try { q = JSON.parse(json) } catch { return '' }
    try { return JSON.stringify(this.answer(q) ?? null) } catch { return 'null' }
  }

  poll(): string {
    if (!this.events.length) return ''
    const out = this.events
    this.events = []
    return JSON.stringify(out)
  }

  /** Resolves after `ms`, or sooner if the student does something. */
  sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        window.clearTimeout(timer)
        this.wakers = this.wakers.filter(w => w !== finish)
        resolve()
      }
      const timer = window.setTimeout(finish, Math.max(0, ms))
      if (ms > 0) this.wakers.push(finish)
    })
  }

  wake(): void {
    const wakers = this.wakers
    this.wakers = []
    for (const w of wakers) w()
  }

  /** A percentage as a fraction, or 'fit': shrink (never enlarge) so every window shows. */
  setZoom(zoom: number | 'fit'): void {
    this.fit = zoom === 'fit'
    if (this.fit) {
      this.watchFit()
      this.refit()
      return
    }
    this.fitObserver?.disconnect()
    this.fitObserver = null
    this.applyZoom(typeof zoom === 'number' && zoom > 0 ? zoom : 1)
  }

  private applyZoom(zoom: number) {
    this.zoom = zoom
    ;(this.windows.style as any).zoom = zoom === 1 ? '' : String(zoom)
  }

  private watchFit() {
    if (this.fitObserver || typeof ResizeObserver === 'undefined') return
    this.fitObserver = new ResizeObserver(() => this.refit())
    this.fitObserver.observe(this.windows)
    const pane = this.host.parentElement
    if (pane) this.fitObserver.observe(pane)
  }

  private refit() {
    if (!this.fit) return
    const pane = this.host.parentElement
    if (!pane || !pane.clientWidth || !pane.clientHeight) return
    // The container is at least as wide as the pane, so measure the widest
    // window rather than the container, or the fit could never grow back.
    const r = this.windows.getBoundingClientRect()
    let widest = 0
    for (const child of this.windows.children) {
      if ((child as HTMLElement).classList.contains('tkx-window')) widest = Math.max(widest, child.getBoundingClientRect().width)
    }
    const naturalW = widest / this.zoom + 36
    const naturalH = r.height / this.zoom
    if (!naturalW || !naturalH) return
    const next = Math.min(1, pane.clientWidth / naturalW, pane.clientHeight / naturalH)
    const rounded = Math.max(0.2, Math.floor(next * 100) / 100)
    if (Math.abs(rounded - this.zoom) > 0.005) this.applyZoom(rounded)
  }

  /** The program has ended: the windows stay on screen but do nothing. */
  end(): void {
    this.ended = true
    this.events = []
    this.closeMenus()
    for (const d of [...this.dialogs]) d.cancel()
    this.root.classList.add('tkx-ended')
    for (const w of this.widgets.values()) {
      if (w.kind === 'toplevel' && w.titleText) w.titleText.textContent = `${w.props.title ?? 'tk'} — not running`
    }
    this.wake()
  }

  /** Cancel an open message box or prompt (Stop while the program waits on one). */
  cancelDialogs(): void {
    for (const d of [...this.dialogs]) d.cancel()
  }

  hasWindows(): boolean {
    for (const w of this.widgets.values()) if (w.kind === 'toplevel') return true
    return false
  }

  dispose(): void {
    this.end()
    this.resizeObserver?.disconnect()
    this.fitObserver?.disconnect()
    if (this.docListener) document.removeEventListener('mousedown', this.docListener, true)
    this.root.remove()
    this.widgets.clear()
  }

  /** Move the windows into a new host (React remounted the Display pane). */
  attach(host: HTMLElement): void {
    if (host === this.host && this.root.parentElement === host) return
    this.host = host
    host.appendChild(this.root)
    if (this.fit) {
      this.fitObserver?.disconnect()
      this.fitObserver = null
      this.watchFit()
    }
  }

  // ── Operations ─────────────────────────────────────────────────────────

  private apply(op: any[]) {
    const [name] = op
    switch (name) {
      case 'create': this.create(op[1], op[2], op[3], op[4] ?? {}); break
      case 'config': this.configure(op[1], op[2] ?? {}); break
      case 'destroy': this.destroy(op[1]); break
      case 'manage': this.manage(op[1], op[2], op[3], op[4] ?? {}); break
      case 'unmanage': this.unmanage(op[1]); break
      case 'order': { const w = this.widgets.get(op[1]); if (w) { w.packOrder = op[2] ?? []; this.layoutDirty.add(w.id) } break }
      case 'gridconf': {
        const w = this.widgets.get(op[1])
        if (w) { (op[2] === 'row' ? w.gridConf.row : w.gridConf.column).set(op[3], op[4]); this.layoutDirty.add(w.id) }
        break
      }
      case 'gridanchor': { const w = this.widgets.get(op[1]); if (w) { w.gridAnchor = op[2]; this.layoutDirty.add(w.id) } break }
      case 'propagate': {
        const w = this.widgets.get(op[1])
        if (w) { (w.propagate as any)[op[2]] = !!op[3]; this.layoutDirty.add(w.id) }
        break
      }
      case 'want': this.want = new Set(op[1] ?? []); this.syncResizeObserver(); break
      case 'value': this.setValue(op[1], String(op[2] ?? '')); break
      case 'caret': this.setCaret(op[1], op[2]); break
      case 'select': this.setSelectionRange(op[1], op[2], op[3]); break
      case 'see': this.see(op[1], op[2]); break
      case 'focus': this.focusWidget(op[1]); break
      case 'autofocus': this.autofocus(op[1]); break
      case 'items': this.listItems(op[1], op[2] ?? [], op[3] ?? {}); break
      case 'selection': this.listSelection(op[1], op[2] ?? []); break
      case 'image': this.defineImage(op[1], op[2] ?? {}); break
      case 'cvitem': this.canvasItem(op[1], op[2], op[3], op[4] ?? [], op[5] ?? {}); break
      case 'cvcoords': this.canvasCoords(op[1], op[2], op[3] ?? []); break
      case 'cvdelete': this.canvasDelete(op[1], op[2] ?? []); break
      case 'cvorder': this.canvasOrder(op[1], op[2] ?? []); break
      case 'raise': this.raise(op[1]); break
      case 'lower': this.lower(op[1]); break
      case 'grab': this.setGrab(op[1] ?? null); break
      case 'popup': this.popupMenu(op[2], op[3], op[4]); break
      case 'unpopup': this.closeMenus(); break
      case 'tabs': this.setTabs(op[1], op[2] ?? [], op[3] ?? null); break
      case 'tree': this.setTree(op[1], op[2] ?? {}); break
      case 'comboopen': this.openCombo(op[1]); break
      case 'clipboard': try { void navigator.clipboard?.writeText(String(op[1] ?? '')) } catch { /* not allowed */ } break
      case 'ttktheme': this.theme = String(op[1] ?? 'vista'); break
      case 'bell': break
      default: break
    }
  }

  private newWidget(id: number, kind: string, parent: number | null, props: Props, el: HTMLElement, inner: HTMLElement | null): Widget {
    const w: Widget = {
      id, kind, parent, props, el, inner, manager: null, master: null, mopts: null, slaves: new Set(),
      packOrder: [], gridConf: { row: new Map(), column: new Map() }, propagate: { pack: true, grid: true },
      gridAnchor: 'nw', stretch: { x: false, y: false }, req: { width: null, height: null, minWidth: null },
      placeSize: { width: null, height: null }, ipad: [0, 0],
    }
    el.dataset.tkw = String(id)
    if (inner && inner !== el) inner.dataset.tkw = String(id)
    el.classList.add('tkx-w')
    this.widgets.set(id, w)
    return w
  }

  private create(id: number, kind: string, parent: number | null, props: Props) {
    if (this.widgets.has(id)) this.destroy(id)
    let w: Widget
    switch (kind) {
      case 'toplevel': w = this.createWindow(id, props); break
      case 'frame': { const el = h('div', 'tkx-frame'); w = this.newWidget(id, kind, parent, props, el, el); break }
      case 'labelframe': {
        const el = h('div', 'tkx-labelframe')
        const legend = h('span', 'tkx-legend')
        const inner = h('div', 'tkx-lfinner')
        el.append(legend, inner)
        w = this.newWidget(id, kind, parent, props, el, inner)
        w.legend = legend
        break
      }
      case 'label': { const el = h('div', 'tkx-label'); w = this.newWidget(id, kind, parent, props, el, null); break }
      case 'button': {
        const el = h('button', 'tkx-button tkx-nofocus')
        el.type = 'button'
        el.addEventListener('click', () => this.push({ t: 'cmd', w: id }))
        w = this.newWidget(id, kind, parent, props, el, null)
        break
      }
      case 'checkbutton':
      case 'radiobutton': {
        const el = h('label', 'tkx-check tkx-nofocus')
        const input = h('input')
        input.type = kind === 'checkbutton' ? 'checkbox' : 'radio'
        input.name = `tkx-${id}`
        input.tabIndex = -1
        const content = h('span', 'tkx-content')
        el.append(input, content)
        input.addEventListener('change', () => {
          if (kind === 'checkbutton') this.push({ t: 'check', w: id, v: input.checked })
          else this.push({ t: 'radio', w: id })
        })
        w = this.newWidget(id, kind, parent, props, el, null)
        w.check = input
        w.content = content
        break
      }
      case 'entry': {
        const el = h('input', 'tkx-entry')
        el.type = 'text'
        el.spellcheck = false
        el.autocomplete = 'off'
        el.addEventListener('input', () => this.push({ t: 'edit', w: id, v: el.value }))
        w = this.newWidget(id, kind, parent, props, el, null)
        w.field = el
        break
      }
      case 'text': {
        const el = h('textarea', 'tkx-text')
        el.spellcheck = false
        el.addEventListener('input', () => this.push({ t: 'edit', w: id, v: el.value }))
        w = this.newWidget(id, kind, parent, props, el, null)
        w.field = el
        break
      }
      case 'listbox': w = this.createListbox(id, parent, props); break
      case 'scale': w = this.createScale(id, parent, props); break
      case 'spinbox': w = this.createSpinbox(id, parent, props); break
      case 'canvas': w = this.createCanvas(id, parent, props); break
      case 'scrollbar': { const el = h('span'); el.style.display = 'none'; w = this.newWidget(id, kind, parent, props, el, null); break }
      case 'menubutton': {
        const el = h('button', 'tkx-mbutton tkx-nofocus')
        el.type = 'button'
        el.addEventListener('click', () => {
          const model = this.widgets.get(id)?.props.menu
          if (model) this.openMenuBelow(model, el)
        })
        w = this.newWidget(id, kind, parent, props, el, null)
        break
      }
      case 'optionmenu': {
        const el = h('select', 'tkx-select')
        el.addEventListener('change', () => {
          const ww = this.widgets.get(id)
          const idx = el.selectedIndex - (el.dataset.placeholder === '1' ? 1 : 0)
          const indices: number[] = ww?.props.indices ?? []
          if (idx >= 0 && idx < indices.length) this.push({ t: 'opt', w: id, i: indices[idx] })
        })
        w = this.newWidget(id, kind, parent, props, el, null)
        w.select = el
        break
      }
      case 'combobox': w = this.createCombobox(id, parent, props); break
      case 'progressbar': {
        const el = h('div', 'tkx-progress')
        const bar = h('div')
        el.appendChild(bar)
        w = this.newWidget(id, kind, parent, props, el, null)
        w.bar = bar
        break
      }
      case 'separator': { const el = h('div', 'tkx-separator'); w = this.newWidget(id, kind, parent, props, el, null); break }
      case 'sizegrip': { const el = h('div', 'tkx-sizegrip'); w = this.newWidget(id, kind, parent, props, el, null); break }
      case 'notebook': {
        const el = h('div', 'tkx-notebook')
        const strip = h('div', 'tkx-tabstrip')
        const body = h('div', 'tkx-nbbody')
        el.append(strip, body)
        w = this.newWidget(id, kind, parent, props, el, body)
        w.tabstrip = strip
        w.tabs = []
        w.currentTab = null
        break
      }
      case 'treeview': w = this.createTree(id, parent, props); break
      default: { const el = h('div'); w = this.newWidget(id, kind, parent, props, el, null); break }
    }
    this.configure(id, props)
  }

  private createWindow(id: number, props: Props): Widget {
    const win = h('div', 'tkx-window')
    const title = h('div', 'tkx-title')
    const icon = h('span', 'tkx-titleicon')
    const text = h('span', 'tkx-titletext')
    const close = h('button', 'tkx-close')
    close.type = 'button'
    close.textContent = '✕'
    close.title = 'Close'
    close.addEventListener('click', () => this.push({ t: 'close', w: id }))
    title.append(icon, text, close)
    const menubar = h('div', 'tkx-menubar')
    const body = h('div', 'tkx-body')
    body.tabIndex = 0
    win.append(title, menubar, body)
    this.windows.appendChild(win)
    const w = this.newWidget(id, 'toplevel', null, props, win, body)
    delete win.dataset.tkw
    w.title = title
    w.titleText = text
    w.menubar = menubar
    this.syncResizeObserver()
    return w
  }

  private createListbox(id: number, parent: number | null, props: Props): Widget {
    const el = h('div', 'tkx-listbox')
    el.tabIndex = 0
    const w = this.newWidget(id, 'listbox', parent, props, el, null)
    w.list = { items: [], styles: {}, selection: new Set(), anchor: 0 }
    el.addEventListener('mousedown', e => {
      const item = (e.target as HTMLElement).closest('.tkx-lbitem') as HTMLElement | null
      if (!item || w.props.state === 'disabled') return
      const i = Number(item.dataset.i)
      const list = w.list!
      const mode = String(w.props.selectmode ?? 'browse')
      let sel = new Set(list.selection)
      if (mode === 'multiple') {
        if (sel.has(i)) sel.delete(i); else sel.add(i)
      } else if (mode === 'extended' && (e.ctrlKey || e.metaKey)) {
        if (sel.has(i)) sel.delete(i); else sel.add(i)
        list.anchor = i
      } else if (mode === 'extended' && e.shiftKey) {
        sel = new Set()
        const [a, b] = [Math.min(list.anchor, i), Math.max(list.anchor, i)]
        for (let k = a; k <= b; k++) sel.add(k)
      } else {
        sel = new Set([i])
        list.anchor = i
      }
      this.applyListSelection(w, sel)
      this.push({ t: 'lbsel', w: id, sel: [...sel].sort((x, y) => x - y), a: i })
    })
    el.addEventListener('keydown', e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const list = w.list!
      const mode = String(w.props.selectmode ?? 'browse')
      if (mode !== 'browse' && mode !== 'single') return
      e.preventDefault()
      const cur = list.selection.size ? Math.min(...list.selection) : -1
      const next = Math.max(0, Math.min(list.items.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)))
      if (next === cur || list.items.length === 0) return
      this.applyListSelection(w, new Set([next]))
      el.children[next]?.scrollIntoView({ block: 'nearest' })
      this.push({ t: 'lbsel', w: id, sel: [next], a: next })
    })
    return w
  }

  private createScale(id: number, parent: number | null, props: Props): Widget {
    const el = h('div', 'tkx-scale')
    const label = h('div')
    const value = h('div', 'tkx-scalevalue')
    const range = h('input')
    range.type = 'range'
    el.append(label, value, range)
    const w = this.newWidget(id, 'scale', parent, props, el, null)
    w.range = range
    w.valueLabel = value
    w.scaleLabel = label
    range.addEventListener('input', () => this.push({ t: 'scale', w: id, v: Number(range.value) }))
    return w
  }

  private createSpinbox(id: number, parent: number | null, props: Props): Widget {
    const el = h('div', 'tkx-spin')
    const input = h('input')
    input.type = 'text'
    input.spellcheck = false
    input.autocomplete = 'off'
    const btns = h('div', 'tkx-spinbtns')
    const up = h('button')
    const down = h('button')
    up.type = 'button'
    down.type = 'button'
    up.textContent = '▲'
    down.textContent = '▼'
    up.tabIndex = -1
    down.tabIndex = -1
    btns.append(up, down)
    el.append(input, btns)
    const w = this.newWidget(id, 'spinbox', parent, props, el, null)
    w.field = input
    input.addEventListener('input', () => this.push({ t: 'edit', w: id, v: input.value }))
    const repeat = (button: HTMLButtonElement, d: number) => {
      let timer = 0
      const stop = () => { window.clearInterval(timer); timer = 0 }
      button.addEventListener('mousedown', e => {
        e.preventDefault()
        this.push({ t: 'spin', w: id, d })
        let wait = 0
        timer = window.setInterval(() => { if (++wait > 4) this.push({ t: 'spin', w: id, d }) }, 80)
      })
      button.addEventListener('mouseup', stop)
      button.addEventListener('mouseleave', stop)
    }
    repeat(up, 1)
    repeat(down, -1)
    return w
  }

  private createCombobox(id: number, parent: number | null, props: Props): Widget {
    const el = h('div', 'tkx-combo')
    const input = h('input')
    input.type = 'text'
    input.spellcheck = false
    input.autocomplete = 'off'
    const btn = h('button')
    btn.type = 'button'
    btn.tabIndex = -1
    btn.textContent = '▼'
    el.append(input, btn)
    const w = this.newWidget(id, 'combobox', parent, props, el, null)
    w.field = input
    input.addEventListener('input', () => this.push({ t: 'edit', w: id, v: input.value }))
    const open = (e: Event) => {
      e.preventDefault()
      if (w.props.state === 'disabled' || this.ended) return
      if (this.openMenus.length) { this.closeMenus(); return }
      if (w.props.post) this.push({ t: 'combopost', w: id })
      else this.openCombo(id)
    }
    btn.addEventListener('mousedown', open)
    input.addEventListener('mousedown', e => { if (w.props.state === 'readonly') open(e) })
    return w
  }

  private createCanvas(id: number, parent: number | null, props: Props): Widget {
    const el = h('div', 'tkx-canvas')
    const s = svg('svg')
    const bg = svg('rect')
    bg.setAttribute('x', '0')
    bg.setAttribute('y', '0')
    bg.setAttribute('width', '100%')
    bg.setAttribute('height', '100%')
    bg.setAttribute('fill', 'transparent')
    s.appendChild(bg)
    const overlay = h('div', 'tkx-overlay')
    el.append(s, overlay)
    const w = this.newWidget(id, 'canvas', parent, props, el, overlay)
    w.canvas = { svg: s, bg, items: new Map(), current: null }
    return w
  }

  private createTree(id: number, parent: number | null, props: Props): Widget {
    const el = h('div', 'tkx-tree')
    el.tabIndex = 0
    const table = h('table')
    el.appendChild(table)
    const w = this.newWidget(id, 'treeview', parent, props, el, null)
    w.treeTable = table
    w.tree = { rows: [], columns: [], selection: [], focus: '', show: ['tree', 'headings'], tags: {}, selectmode: 'extended', anchor: '' }
    el.addEventListener('mousedown', e => {
      const target = e.target as HTMLElement
      const th = target.closest('th') as HTMLElement | null
      if (th) { if (th.dataset.col) this.push({ t: 'tvhead', w: id, col: th.dataset.col }); return }
      const toggle = target.closest('.tkx-toggle') as HTMLElement | null
      const tr = target.closest('tr[data-iid]') as HTMLElement | null
      if (!tr) return
      const iid = tr.dataset.iid!
      if (toggle && toggle.textContent) {
        const open = toggle.textContent === '▸'
        this.push({ t: 'tvopen', w: id, iid, open })
        return
      }
      const tree = w.tree
      const mode = String(tree.selectmode)
      if (mode === 'none') return
      let sel: string[] = [...tree.selection]
      if (mode === 'extended' && (e.ctrlKey || e.metaKey)) {
        sel = sel.includes(iid) ? sel.filter(x => x !== iid) : [...sel, iid]
        tree.anchor = iid
      } else if (mode === 'extended' && e.shiftKey && tree.anchor) {
        const order = [...table.querySelectorAll('tr[data-iid]')].map(r => (r as HTMLElement).dataset.iid!)
        const a = order.indexOf(tree.anchor), b = order.indexOf(iid)
        sel = a >= 0 && b >= 0 ? order.slice(Math.min(a, b), Math.max(a, b) + 1) : [iid]
      } else {
        sel = [iid]
        tree.anchor = iid
      }
      tree.selection = sel
      tree.focus = iid
      this.paintTreeSelection(w)
      this.push({ t: 'tvsel', w: id, sel, f: iid })
    })
    el.addEventListener('dblclick', e => {
      const toggle = (e.target as HTMLElement).closest('.tkx-toggle')
      if (toggle) return
      const tr = (e.target as HTMLElement).closest('tr[data-iid]') as HTMLElement | null
      if (!tr) return
      const row = this.findTreeRow(w.tree.rows, tr.dataset.iid!)
      if (row && row.children?.length) this.push({ t: 'tvopen', w: id, iid: row.iid, open: !row.open })
    })
    return w
  }

  private configure(id: number, props: Props) {
    const w = this.widgets.get(id)
    if (!w) return
    w.props = props
    switch (w.kind) {
      case 'toplevel': this.styleWindow(w); break
      case 'frame': this.styleContainer(w); break
      case 'labelframe': this.styleLabelFrame(w); break
      case 'label': this.styleLabel(w, w.el); break
      case 'button': this.styleButton(w); break
      case 'checkbutton': case 'radiobutton': this.styleCheck(w); break
      case 'entry': this.styleEntry(w, w.el, w.field!); break
      case 'text': this.styleText(w); break
      case 'listbox': this.styleListbox(w); break
      case 'scale': this.styleScale(w); break
      case 'spinbox': this.styleEntry(w, w.el, w.field!); break
      case 'combobox': this.styleEntry(w, w.el, w.field!); w.el.classList.toggle('tkx-disabled', props.state === 'disabled'); break
      case 'canvas': this.styleCanvas(w); break
      case 'menubutton': this.styleMenubutton(w); break
      case 'optionmenu': this.styleOptionMenu(w); break
      case 'progressbar': this.styleProgress(w); break
      case 'separator': this.styleSeparator(w); break
      case 'notebook': this.styleNotebook(w); break
      case 'treeview': this.styleTreeBox(w); break
      default: break
    }
    this.applySize(w)
    if (w.inner) this.layoutDirty.add(w.id)
  }

  // ── Styling each kind of widget ─────────────────────────────────────────

  private box(w: Widget, el: HTMLElement, defaults: { bg: string; relief?: string; bd?: number; fieldBorder?: boolean }) {
    const p = w.props
    const bg = col(p.bg, defaults.bg)
    el.style.background = bg
    const relief = String(p.relief || defaults.relief || 'flat')
    const bd = typeof p.bd === 'number' ? p.bd : (defaults.bd ?? 0)
    if (defaults.fieldBorder && relief === 'sunken' && bd > 0 && bd <= 2) {
      el.style.border = `${bd === 2 ? 1 : bd}px solid #7a7a7a`
      el.style.boxShadow = ''
    } else {
      drawRelief(el, relief, bd, bg)
    }
    el.style.cursor = p.cursor || ''
    const hl = Number(p.hl || 0)
    if (hl > 0) {
      el.style.outline = `${hl}px solid ${col(p.hlbg, '#f0f0f0')}`
      el.style.outlineOffset = '0'
      el.style.setProperty('--tk-hlc', col(p.hlc, '#646464'))
      el.dataset.hl = String(hl)
    } else {
      el.style.outline = ''
      delete el.dataset.hl
    }
  }

  private font(el: HTMLElement, font: any) {
    if (Array.isArray(font)) {
      el.style.font = font[0]
      el.style.textDecoration = font[1] || ''
    }
  }

  private renderText(target: HTMLElement, text: string, underline: number) {
    target.textContent = ''
    if (underline >= 0 && underline < text.length) {
      target.append(text.slice(0, underline))
      const u = h('u')
      u.textContent = text[underline]
      target.append(u, text.slice(underline + 1))
    } else {
      target.textContent = text
    }
  }

  /** Text and/or image for label-like widgets, arranged by `compound`. */
  private renderContent(w: Widget, holder: HTMLElement) {
    const p = w.props
    holder.textContent = ''
    const image = p.image ? this.images.get(p.image) : null
    const compound = String(p.compound || 'none')
    const showText = !image || compound !== 'none'
    let imgEl: HTMLImageElement | null = null
    if (image) {
      imgEl = h('img')
      imgEl.draggable = false
      if (image.src) imgEl.src = image.src
      imgEl.style.width = `${image.w}px`
      imgEl.style.height = `${image.h}px`
    }
    let textEl: HTMLElement | null = null
    if (showText) {
      textEl = h('span')
      this.renderText(textEl, String(p.text ?? ''), Number(p.underline ?? -1))
      const wrap = Number(p.wrap || 0)
      textEl.style.whiteSpace = wrap > 0 ? 'pre-wrap' : 'pre'
      textEl.style.maxWidth = wrap > 0 ? `${wrap}px` : ''
      textEl.style.display = wrap > 0 ? 'inline-block' : ''
      textEl.style.textAlign = String(p.justify || 'center')
    }
    holder.style.flexDirection = { left: 'row', right: 'row-reverse', top: 'column', bottom: 'column-reverse' }[compound] ?? 'row'
    holder.style.display = 'inline-flex'
    holder.style.alignItems = 'center'
    holder.style.gap = imgEl && textEl ? '3px' : '0'
    if (compound === 'center' && imgEl && textEl) {
      holder.style.display = 'inline-grid'
      imgEl.style.gridArea = '1 / 1'
      textEl.style.gridArea = '1 / 1'
      textEl.style.alignSelf = 'center'
      textEl.style.justifySelf = 'center'
    }
    if (imgEl) holder.appendChild(imgEl)
    if (textEl) holder.appendChild(textEl)
  }

  private labelLike(w: Widget, el: HTMLElement, defaults: { bg: string; relief: string; bd: number }) {
    const p = w.props
    const ttk = !!p.ttk
    this.box(w, el, { bg: ttk ? (w.kind === 'button' ? '#e1e1e1' : '#f0f0f0') : defaults.bg, relief: ttk ? (p.relief || 'flat') : defaults.relief, bd: ttk ? 0 : defaults.bd })
    if (ttk && w.kind === 'button' && p.bg === null) el.style.background = ''
    if (ttk && w.kind === 'button' && !has(p.relief)) el.style.border = ''
    el.style.color = p.state === 'disabled' ? col(p.disabledfg ?? p.maps?.disabled?.foreground, '#6d6d6d') : col(p.fg, '#000')
    this.font(el, p.font)
    const pad = p.padding as number[] | null
    if (ttk && pad) {
      el.style.padding = `${pad[1]}px ${pad[2]}px ${pad[3]}px ${pad[0]}px`
    } else if (!ttk) {
      // Windows adds its own margin round a button's text, on top of padx/pady.
      const [extraX, extraY] = w.kind === 'button' ? [4, 2] : [0, 0]
      el.style.padding = `${(p.pady ?? 1) + extraY + w.ipad[1]}px ${(p.padx ?? 1) + extraX + w.ipad[0]}px`
    } else if (w.kind !== 'button') {
      el.style.padding = `${w.ipad[1]}px ${w.ipad[0]}px`
    }
    const { justify, align } = anchorFlex(String(p.anchor || 'center'))
    el.style.justifyContent = justify
    el.style.alignItems = align
    const width = p.width as [number, string] | null
    w.req.width = width && width[0] > 0 ? sizeCss(width) : null
    w.req.minWidth = width && width[0] < 0 ? sizeCss(width) : (ttk && w.kind === 'button' && !width ? '8ch' : null)
    w.req.height = sizeCss(p.height)
    el.classList.toggle('tkx-ttk', ttk)
    if (ttk && p.maps) {
      el.style.setProperty('--tk-ttk-abg', p.maps.active?.background ?? '')
      el.style.setProperty('--tk-ttk-afg', p.maps.active?.foreground ?? '')
      el.style.setProperty('--tk-ttk-pbg', p.maps.pressed?.background ?? '')
    }
  }

  private styleLabel(w: Widget, el: HTMLElement) {
    this.labelLike(w, el, { bg: '#f0f0f0', relief: 'flat', bd: 2 })
    this.renderContent(w, el)
    el.style.display = 'inline-flex'
    const { justify, align } = anchorFlex(String(w.props.anchor || 'center'))
    el.style.justifyContent = justify
    el.style.alignItems = align
  }

  private styleButton(w: Widget) {
    const el = w.el as HTMLButtonElement
    const p = w.props
    this.labelLike(w, el, { bg: '#f0f0f0', relief: 'raised', bd: 2 })
    const content = h('span', 'tkx-content')
    this.renderContent(w, content)
    el.textContent = ''
    el.appendChild(content)
    el.disabled = p.state === 'disabled'
    if (!p.ttk) {
      // Pressed: Tk sinks the button and shows activebackground.
      const abg = col(p.activebg, '#ececec')
      const bg = col(p.bg, '#f0f0f0')
      const relief = String(p.relief || 'raised')
      const bd = typeof p.bd === 'number' ? p.bd : 2
      el.onmouseenter = null
      el.onmousedown = () => {
        if (el.disabled) return
        el.style.background = abg
        if (relief === 'raised') drawRelief(el, 'sunken', bd, abg)
      }
      el.onmouseup = el.onmouseleave = () => {
        el.style.background = bg
        if (relief === 'raised') drawRelief(el, 'raised', bd, bg)
      }
    }
  }

  private styleCheck(w: Widget) {
    const el = w.el
    const p = w.props
    this.labelLike(w, el, { bg: '#f0f0f0', relief: 'flat', bd: 2 })
    this.renderContent(w, w.content!)
    w.check!.checked = !!p.checked
    w.check!.disabled = p.state === 'disabled'
    el.classList.toggle('tkx-disabled', p.state === 'disabled')
    const indicator = p.indicator !== false
    el.classList.toggle('tkx-noindicator', !indicator)
    if (!indicator) {
      el.style.borderWidth = '2px'
      el.style.borderStyle = p.checked ? 'inset' : 'outset'
      el.style.borderColor = col(p.bg, '#f0f0f0')
      if (p.checked && p.selectcolor) el.style.background = col(p.selectcolor, '#fff')
    }
  }

  private styleEntry(w: Widget, el: HTMLElement, field: HTMLInputElement | HTMLTextAreaElement) {
    const p = w.props
    const ttk = !!p.ttk
    const disabled = p.state === 'disabled'
    const readonly = p.state === 'readonly'
    const fieldBg = disabled ? col(p.disabledbg, '#f0f0f0') : readonly ? col(p.readonlybg, ttk ? '#fff' : '#f0f0f0') : col(p.bg ?? p.fieldbg, '#fff')
    if (ttk) {
      el.style.background = col(p.fieldbg ?? p.bg, '#fff')
      el.style.border = ''
      el.style.outline = ''
      el.classList.add('tkx-ttk')
    } else {
      this.box(w, el, { bg: '#fff', relief: 'sunken', bd: 1, fieldBorder: true })
      el.style.background = fieldBg
    }
    if (el !== field) {
      field.style.background = 'transparent'
      field.style.border = '0'
    }
    field.style.color = disabled ? col(p.disabledfg, '#6d6d6d') : col(p.fg, '#000')
    this.font(el, p.font)
    field.style.font = 'inherit'
    field.style.textAlign = p.justify === 'center' ? 'center' : p.justify === 'right' ? 'right' : 'left'
    field.style.caretColor = col(p.caret, '#000')
    if (field instanceof HTMLInputElement && w.kind === 'entry') field.type = p.show ? 'password' : 'text'
    field.disabled = disabled
    field.readOnly = readonly
    if (w.kind === 'combobox') field.style.cursor = readonly ? 'default' : ''
    if (!ttk || w.kind === 'entry') el.style.padding = ttk ? '' : '1px 2px'
    const width = p.width as [number, string] | null
    // width= counts characters of text; a spinbox's or combobox's arrows come on top.
    const base = sizeCss(width)
    w.req.width = base && el !== field ? `calc(${base} + ${w.kind === 'combobox' ? 17 : 16}px)` : base
    w.req.height = null
    if (el !== field) {
      field.style.width = '100%'
      field.style.padding = '0'
    }
    el.style.setProperty('--tk-selbg', col(p.selectbg, '#0078d7'))
  }

  private styleText(w: Widget) {
    const el = w.field as HTMLTextAreaElement
    const p = w.props
    this.box(w, el, { bg: '#fff', relief: 'sunken', bd: 1, fieldBorder: true })
    el.style.color = col(p.fg, '#000')
    this.font(el, p.font)
    el.style.padding = `${(p.pady ?? 1) + w.ipad[1]}px ${(p.padx ?? 1) + w.ipad[0]}px`
    el.style.caretColor = col(p.caret, '#000')
    el.readOnly = p.state === 'disabled'
    const wrap = String(p.wrap || 'char')
    el.wrap = wrap === 'none' ? 'off' : 'soft'
    el.style.whiteSpace = wrap === 'none' ? 'pre' : 'pre-wrap'
    el.style.wordBreak = wrap === 'char' ? 'break-all' : 'normal'
    el.style.overflowWrap = wrap === 'char' ? 'anywhere' : 'break-word'
    w.req.width = sizeCss(p.width)
    w.req.height = sizeCss(p.height)
  }

  private styleListbox(w: Widget) {
    const el = w.el
    const p = w.props
    this.box(w, el, { bg: '#fff', relief: 'sunken', bd: 1, fieldBorder: true })
    el.style.color = p.state === 'disabled' ? col(p.disabledfg, '#6d6d6d') : col(p.fg, '#000')
    this.font(el, p.font)
    el.style.setProperty('--tk-selbg', col(p.selectbg, '#0078d7'))
    el.style.setProperty('--tk-selfg', col(p.selectfg, '#fff'))
    el.style.textAlign = p.justify === 'center' ? 'center' : p.justify === 'right' ? 'right' : 'left'
    w.req.width = sizeCss(p.width)
    const lines = p.height ? Math.abs(p.height[0]) : 0
    w.req.height = lines ? `${(lines * 1.25).toFixed(3)}em` : null
  }

  private styleScale(w: Widget) {
    const el = w.el
    const p = w.props
    const ttk = !!p.ttk
    this.box(w, el, { bg: '#f0f0f0', relief: 'flat', bd: ttk ? 0 : 1 })
    el.style.color = col(p.fg, '#000')
    this.font(el, p.font)
    const vertical = p.orient === 'vertical'
    el.classList.toggle('tkx-vertical', vertical)
    el.classList.toggle('tkx-horizontal', !vertical)
    const range = w.range!
    const from = Number(p.from ?? 0), to = Number(p.to ?? 100)
    const lo = Math.min(from, to), hi = Math.max(from, to)
    range.min = String(lo)
    range.max = String(hi)
    range.step = p.res > 0 ? String(p.res) : 'any'
    range.disabled = p.state === 'disabled'
    // A reversed scale (from > to) runs the other way.
    range.style.direction = from > to ? 'rtl' : 'ltr'
    if (document.activeElement !== range || String(range.value) !== String(p.value)) range.value = String(p.value ?? lo)
    const length = Number(p.length || 100)
    const thick = Math.max(12, Number(p.thickness || 15))
    if (vertical) {
      range.style.height = `${length}px`
      range.style.width = `${thick}px`
      el.style.flexDirection = 'row'
    } else {
      range.style.width = `${length}px`
      range.style.height = `${thick}px`
      el.style.flexDirection = 'column'
    }
    range.style.accentColor = p.trough && p.trough !== '#c8c8c8' ? p.trough : ''
    w.valueLabel!.textContent = p.showvalue ? String(p.text ?? '') : ''
    w.valueLabel!.style.display = p.showvalue ? '' : 'none'
    w.scaleLabel!.textContent = String(p.label ?? '')
    w.scaleLabel!.style.display = p.label ? '' : 'none'
    w.req.width = null
    w.req.height = null
  }

  private styleCanvas(w: Widget) {
    const p = w.props
    const el = w.el
    this.box(w, el, { bg: '#f0f0f0', relief: 'flat', bd: 0 })
    const width = Math.max(1, Number(p.width || 378))
    const height = Math.max(1, Number(p.height || 265))
    w.canvas!.svg.setAttribute('width', String(width))
    w.canvas!.svg.setAttribute('height', String(height))
    w.req.width = `${width}px`
    w.req.height = `${height}px`
  }

  private styleMenubutton(w: Widget) {
    const el = w.el as HTMLButtonElement
    const p = w.props
    this.labelLike(w, el, { bg: '#f0f0f0', relief: 'flat', bd: 2 })
    const content = h('span', 'tkx-content')
    this.renderContent(w, content)
    el.textContent = ''
    el.appendChild(content)
    if (p.indicator) {
      const arrow = h('span')
      arrow.textContent = ' ▾'
      el.appendChild(arrow)
    }
    el.disabled = p.state === 'disabled'
  }

  private styleOptionMenu(w: Widget) {
    const el = w.select!
    const p = w.props
    this.labelLike(w, el, { bg: '#f0f0f0', relief: 'raised', bd: 2 })
    el.style.display = 'inline-block'
    el.disabled = p.state === 'disabled'
    const options: string[] = p.options ?? []
    const text = String(p.text ?? '')
    el.textContent = ''
    const idx = options.indexOf(text)
    if (idx < 0) {
      const ph = h('option')
      ph.textContent = text
      ph.disabled = true
      ph.hidden = true
      el.appendChild(ph)
      el.dataset.placeholder = '1'
    } else {
      delete el.dataset.placeholder
    }
    for (const o of options) {
      const opt = h('option')
      opt.textContent = o
      el.appendChild(opt)
    }
    el.selectedIndex = idx < 0 ? 0 : idx
    el.classList.toggle('tkx-ttk', !!p.ttk)
  }

  private styleProgress(w: Widget) {
    const p = w.props
    const el = w.el
    const vertical = p.orient === 'vertical'
    el.classList.toggle('tkx-vertical', vertical)
    el.classList.toggle('tkx-indeterminate', p.mode === 'indeterminate')
    const length = Number(p.length || 100)
    w.req.width = vertical ? '14px' : `${length}px`
    w.req.height = vertical ? `${length}px` : '14px'
    const frac = Math.max(0, Math.min(1, Number(p.value || 0) / (Number(p.maximum) || 100)))
    const bar = w.bar!
    if (vertical) { bar.style.height = `${frac * 100}%`; bar.style.width = '' } else { bar.style.width = `${frac * 100}%`; bar.style.height = '' }
    if (p.bg) bar.style.background = p.bg
    if (p.trough) el.style.background = p.trough
  }

  private styleSeparator(w: Widget) {
    const el = w.el
    const vertical = w.props.orient === 'vertical'
    el.style.borderTop = vertical ? '0' : '1px solid #a0a0a0'
    el.style.borderBottom = vertical ? '0' : '1px solid #fff'
    el.style.borderLeft = vertical ? '1px solid #a0a0a0' : '0'
    el.style.borderRight = vertical ? '1px solid #fff' : '0'
    w.req.width = vertical ? '0px' : null
    w.req.height = vertical ? null : '0px'
  }

  private styleContainer(w: Widget) {
    const p = w.props
    const el = w.el
    if (p.ttk) {
      el.style.background = col(p.bg, '#f0f0f0')
      const relief = p.relief ? String(p.relief) : 'flat'
      const bd = relief === 'flat' ? 0 : Number(p.bd ?? 1)
      el.style.border = bd ? `${bd}px ${RELIEF[relief] ?? 'solid'} ${relief === 'solid' ? '#000' : '#d9d9d9'}` : '0'
      const pad = p.padding as number[] | null
      el.style.padding = pad ? `${pad[1]}px ${pad[2]}px ${pad[3]}px ${pad[0]}px` : '0'
      el.style.cursor = p.cursor || ''
    } else {
      this.box(w, el, { bg: '#f0f0f0', relief: 'flat', bd: 0 })
      el.style.padding = `${p.pady || 0}px ${p.padx || 0}px`
    }
  }

  private styleLabelFrame(w: Widget) {
    const p = w.props
    const el = w.el
    this.styleContainer(w)
    if (!p.ttk) {
      const bd = Number(p.bd ?? 2)
      drawRelief(el, String(p.relief || 'groove'), bd, col(p.bg, '#f0f0f0'))
    }
    const legend = w.legend!
    legend.textContent = String(p.text ?? '')
    legend.style.display = p.text ? '' : 'none'
    legend.style.color = col(p.fg, '#000')
    legend.style.background = el.style.background || '#f0f0f0'
    this.font(legend, p.font)
    const la = String(p.labelanchor || 'nw')
    legend.style.left = la.endsWith('w') || la === 'nw' ? '8px' : ''
    legend.style.right = la.endsWith('e') ? '8px' : ''
    if (la === 'n') { legend.style.left = '50%'; legend.style.transform = 'translate(-50%, -50%)' } else legend.style.transform = 'translateY(-50%)'
    this.font(w.inner!, null)
    el.style.paddingTop = p.text ? '0.8em' : '0'
    el.style.marginTop = p.text ? '0.6em' : '0'
  }

  private styleNotebook(w: Widget) {
    const p = w.props
    w.el.style.background = 'transparent'
    const body = w.inner!
    body.style.minWidth = p.width ? `${p.width}px` : ''
    body.style.minHeight = p.height ? `${p.height}px` : ''
    if (p.padding) body.style.padding = `${p.padding[1]}px ${p.padding[2]}px ${p.padding[3]}px ${p.padding[0]}px`
    this.renderTabs(w)
  }

  private styleTreeBox(w: Widget) {
    const p = w.props
    const el = w.el
    el.style.background = col(p.fieldbg ?? p.bg, '#fff')
    el.style.color = col(p.fg, '#000')
    this.font(el, p.font)
    const rowh = Number(p.rowheight || 20)
    el.style.setProperty('--tk-rowh', `${rowh}px`)
    el.style.setProperty('--tk-selbg', col(p.sel?.background, '#0078d7'))
    el.style.setProperty('--tk-selfg', col(p.sel?.foreground, '#fff'))
    const rows = Number(p.height || 10)
    const headings = (w.tree?.show ?? ['tree', 'headings']).includes('headings')
    w.req.height = `${rows * rowh + (headings ? 24 : 0)}px`
    this.renderTree(w)
  }

  private styleWindow(w: Widget) {
    const p = w.props
    const win = w.el
    const body = w.inner!
    w.titleText!.textContent = this.ended ? `${p.title ?? 'tk'} — not running` : String(p.title ?? 'tk')
    w.title!.style.display = p.override ? 'none' : ''
    const bg = col(p.bg, '#f0f0f0')
    body.style.background = bg
    win.style.background = bg
    const bd = Number(p.bd || 0)
    body.style.border = bd ? `${bd}px ${RELIEF[String(p.relief || 'flat')] ?? 'solid'} ${bg}` : '0'
    body.style.padding = `${p.pady || 0}px ${p.padx || 0}px`
    body.style.cursor = p.cursor || ''
    win.style.display = p.wstate === 'withdrawn' ? 'none' : ''
    body.style.display = p.wstate === 'iconic' ? 'none' : ''
    w.menubar!.style.display = p.wstate === 'iconic' ? 'none' : ''
    win.style.opacity = p.alpha !== undefined && p.alpha < 1 ? String(Math.max(0.05, p.alpha)) : ''
    const min = p.minsize as number[] | undefined
    body.style.minWidth = min && min[0] > 1 ? `${min[0]}px` : ''
    body.style.minHeight = min && min[1] > 1 ? `${min[1]}px` : ''
    this.renderMenubar(w, p.menu)
  }

  // ── Geometry ───────────────────────────────────────────────────────────

  private manage(id: number, manager: Manager, masterId: number, opts: any) {
    const w = this.widgets.get(id)
    const master = this.widgets.get(masterId)
    if (!w || !master) return
    if (w.master !== null && w.master !== masterId) {
      const old = this.widgets.get(w.master)
      if (old) { old.slaves.delete(id); this.layoutDirty.add(old.id) }
    }
    w.manager = manager
    w.master = masterId
    w.mopts = opts
    w.ipad = [Number(opts.ipadx || 0), Number(opts.ipady || 0)]
    master.slaves.add(id)
    this.layoutDirty.add(masterId)
    if (w.ipad[0] || w.ipad[1]) this.configure(id, w.props)
  }

  private unmanage(id: number) {
    const w = this.widgets.get(id)
    if (!w) return
    if (w.master !== null) {
      const master = this.widgets.get(w.master)
      if (master) { master.slaves.delete(id); this.layoutDirty.add(master.id) }
    }
    w.manager = null
    w.master = null
    w.mopts = null
    w.el.remove()
  }

  private destroy(id: number) {
    const w = this.widgets.get(id)
    if (!w) return
    const kids = [...this.widgets.values()].filter(k => k.parent === id)
    for (const k of kids) this.destroy(k.id)
    if (w.master !== null) {
      const master = this.widgets.get(w.master)
      if (master) { master.slaves.delete(id); this.layoutDirty.add(master.id) }
    }
    for (const sid of w.slaves) {
      const s = this.widgets.get(sid)
      if (s) { s.master = null; s.manager = null; s.el.remove() }
    }
    w.el.remove()
    this.widgets.delete(id)
    if (this.grab === id) this.setGrab(null)
    this.layoutDirty.delete(id)
  }

  private relayoutDirty() {
    const dirty = [...this.layoutDirty]
    this.layoutDirty.clear()
    for (const id of dirty) {
      const w = this.widgets.get(id)
      if (w) this.relayout(w)
    }
  }

  private relayout(c: Widget) {
    const inner = c.inner
    if (!inner) return
    // Take down the previous arrangement: parcels, cavities and managed slaves.
    for (const node of [...inner.children]) {
      const el = node as HTMLElement
      if (el.classList.contains('tkx-parcel') || el.classList.contains('tkx-cavity')) el.remove()
    }
    const slaves = [...c.slaves].map(id => this.widgets.get(id)).filter((s): s is Widget => !!s)
    for (const s of slaves) if (s.manager !== 'notebook' && s.manager !== 'canvas') s.el.remove()
    const packs = c.packOrder.map(id => this.widgets.get(id)).filter((s): s is Widget => !!s && s.manager === 'pack' && s.master === c.id)
    const grids = slaves.filter(s => s.manager === 'grid')
    const places = slaves.filter(s => s.manager === 'place')

    inner.style.display = ''
    inner.style.flexDirection = ''
    inner.style.alignItems = ''
    inner.style.gridTemplateColumns = ''
    inner.style.gridTemplateRows = ''
    inner.style.justifyContent = ''
    inner.style.alignContent = ''
    if (c.kind !== 'canvas') inner.style.position = 'relative'

    if (grids.length) this.layoutGrid(c, inner, grids)
    else if (packs.length) this.layoutPack(inner, packs)
    else if (c.kind !== 'canvas' && c.kind !== 'notebook') inner.style.display = 'block'
    for (const s of places) this.layoutPlace(inner, s)

    this.sizeContainer(c, packs.length > 0, grids.length > 0)
    for (const s of slaves) this.applySize(s)
  }

  /** A container's own size: requested width/height, or shrink-wrapped to its slaves. */
  private sizeContainer(c: Widget, hasPack: boolean, hasGrid: boolean) {
    const target = c.kind === 'toplevel' ? c.inner! : c.el
    const p = c.props
    const propagate = hasGrid ? c.propagate.grid : hasPack ? c.propagate.pack : false
    let width: string | null = null
    let height: string | null = null
    if (c.kind === 'toplevel') {
      const geom = p.geom as number[] | null
      if (geom) { width = `${geom[0]}px`; height = `${geom[1]}px` } else if (!propagate) {
        const reqW = Number(p.width || 0), reqH = Number(p.height || 0)
        const empty = !hasPack && !hasGrid
        width = reqW ? `${reqW}px` : empty ? '200px' : null
        height = reqH ? `${reqH}px` : empty ? '200px' : null
      }
      target.style.boxSizing = 'border-box'
      target.style.width = width ?? ''
      target.style.height = height ?? ''
      target.style.overflow = geom || !propagate ? 'hidden' : ''
      return
    }
    if (c.kind === 'frame' || c.kind === 'labelframe') {
      if (!propagate) {
        const reqW = Number(p.width || 0), reqH = Number(p.height || 0)
        width = reqW ? `${reqW}px` : (hasPack || hasGrid ? null : '0px')
        height = reqH ? `${reqH}px` : (hasPack || hasGrid ? null : '0px')
        if (!hasPack && !hasGrid && !reqW && !reqH && c.slaves.size) { width = null; height = null }
      }
      target.style.boxSizing = 'border-box'
      target.style.overflow = !propagate && (hasPack || hasGrid) ? 'hidden' : ''
      c.req.width = width
      c.req.height = height
    }
  }

  private layoutGrid(c: Widget, inner: HTMLElement, grids: Widget[]) {
    inner.style.display = 'grid'
    let cols = 0, rows = 0
    for (const s of grids) {
      cols = Math.max(cols, s.mopts.column + s.mopts.columnspan)
      rows = Math.max(rows, s.mopts.row + s.mopts.rowspan)
    }
    for (const k of c.gridConf.column.keys()) cols = Math.max(cols, k + 1)
    for (const k of c.gridConf.row.keys()) rows = Math.max(rows, k + 1)
    const track = (conf: GridConf | undefined) => {
      const min = conf?.minsize ? `${conf.minsize}px` : '0px'
      return conf && conf.weight > 0 ? `minmax(${min}, ${conf.weight}fr)` : `minmax(${min}, auto)`
    }
    inner.style.gridTemplateColumns = Array.from({ length: cols }, (_, i) => track(c.gridConf.column.get(i))).join(' ')
    inner.style.gridTemplateRows = Array.from({ length: rows }, (_, i) => track(c.gridConf.row.get(i))).join(' ')
    const a = c.gridAnchor || 'nw'
    inner.style.justifyContent = a.includes('w') ? 'start' : a.includes('e') && a !== 'center' ? 'end' : 'center'
    inner.style.alignContent = a.startsWith('n') ? 'start' : a.startsWith('s') ? 'end' : 'center'
    const ordered = [...grids].sort((x, y) => Number(x.el.style.zIndex || 0) - Number(y.el.style.zIndex || 0))
    for (const s of ordered) {
      const o = s.mopts
      const el = s.el
      el.style.gridColumn = `${o.column + 1} / span ${o.columnspan}`
      el.style.gridRow = `${o.row + 1} / span ${o.rowspan}`
      const sticky = String(o.sticky || '')
      const ew = sticky.includes('e') && sticky.includes('w')
      const ns = sticky.includes('n') && sticky.includes('s')
      el.style.justifySelf = ew ? 'stretch' : sticky.includes('w') ? 'start' : sticky.includes('e') ? 'end' : 'center'
      el.style.alignSelf = ns ? 'stretch' : sticky.includes('n') ? 'start' : sticky.includes('s') ? 'end' : 'center'
      el.style.margin = `${o.pady[0]}px ${o.padx[1]}px ${o.pady[1]}px ${o.padx[0]}px`
      el.style.position = el.style.zIndex ? 'relative' : ''
      el.style.flex = ''
      s.stretch = { x: ew, y: ns }
      this.clearPlace(el)
      inner.appendChild(el)
    }
  }

  private layoutPack(host: HTMLElement, items: Widget[]) {
    const dirFor: Record<string, string> = { top: 'column', bottom: 'column-reverse', left: 'row', right: 'row-reverse' }
    const expands = (list: Widget[]) => list.some(s => s.mopts.expand)
    let cur = host
    let i = 0
    while (i < items.length) {
      const side = String(items[i].mopts.side || 'top')
      cur.style.display = 'flex'
      cur.style.flexDirection = dirFor[side] ?? 'column'
      cur.style.alignItems = 'stretch'
      const run: Widget[] = []
      while (i < items.length && String(items[i].mopts.side || 'top') === side) run.push(items[i++])
      for (const s of run) cur.appendChild(this.parcel(s))
      if (i < items.length) {
        const cavity = h('div', 'tkx-cavity')
        const rest = items.slice(i)
        // The leftover space goes to whoever expands; with nobody expanding it
        // stays empty at the far end, which the cavity quietly occupies.
        const grow = expands(rest) || !expands(run)
        cavity.style.flex = grow ? '1 1 auto' : '0 1 auto'
        cavity.style.alignSelf = 'stretch'
        cur.appendChild(cavity)
        cur = cavity
      }
    }
  }

  private parcel(s: Widget): HTMLElement {
    const o = s.mopts
    const parcel = h('div', 'tkx-parcel')
    parcel.style.flex = o.expand ? '1 1 auto' : '0 0 auto'
    const fill = String(o.fill || 'none')
    const fillX = fill === 'x' || fill === 'both'
    const fillY = fill === 'y' || fill === 'both'
    const { justify, align } = anchorFlex(String(o.anchor || 'center'))
    parcel.style.flexDirection = 'row'
    parcel.style.justifyContent = fillX ? 'stretch' : justify
    parcel.style.alignItems = fillY ? 'stretch' : align
    const el = s.el
    el.style.margin = `${o.pady[0]}px ${o.padx[1]}px ${o.pady[1]}px ${o.padx[0]}px`
    el.style.flex = fillX ? '1 1 auto' : '0 0 auto'
    el.style.gridColumn = ''
    el.style.gridRow = ''
    el.style.justifySelf = ''
    el.style.alignSelf = ''
    el.style.minWidth = ''
    this.clearPlace(el)
    s.stretch = { x: fillX, y: fillY }
    parcel.appendChild(el)
    return parcel
  }

  private clearPlace(el: HTMLElement) {
    el.style.position = el.style.zIndex ? 'relative' : ''
    el.style.left = ''
    el.style.top = ''
    el.style.transform = ''
  }

  private layoutPlace(inner: HTMLElement, s: Widget) {
    const o = s.mopts
    const el = s.el
    el.style.position = 'absolute'
    el.style.margin = '0'
    el.style.flex = ''
    el.style.gridColumn = ''
    el.style.gridRow = ''
    el.style.left = o.relx ? `calc(${o.relx * 100}% + ${o.x}px)` : `${o.x}px`
    el.style.top = o.rely ? `calc(${o.rely * 100}% + ${o.y}px)` : `${o.y}px`
    el.style.transform = anchorTranslate(String(o.anchor || 'nw'))
    const dim = (abs: number | null, rel: number | null) => {
      if (rel !== null && rel !== undefined) return abs ? `calc(${rel * 100}% + ${abs}px)` : `${rel * 100}%`
      return abs !== null && abs !== undefined ? `${abs}px` : null
    }
    s.placeSize = { width: dim(o.width, o.relwidth), height: dim(o.height, o.relheight) }
    s.stretch = { x: false, y: false }
    if (!el.style.zIndex) el.style.zIndex = String(++this.zCounter)
    inner.appendChild(el)
  }

  private applySize(w: Widget) {
    const el = w.el
    if (w.kind === 'toplevel') return
    const place = w.manager === 'place' ? w.placeSize : { width: null, height: null }
    const border = w.kind === 'frame' || w.kind === 'labelframe' || place.width || place.height
    if (border) el.style.boxSizing = 'border-box'
    if (place.width) { el.style.width = place.width; el.style.minWidth = '' } else if (w.stretch.x) {
      el.style.width = ''
      el.style.minWidth = w.req.width ?? w.req.minWidth ?? ''
      if (w.kind === 'entry' || w.kind === 'spinbox' || w.kind === 'combobox') el.style.minWidth = '0'
    } else {
      el.style.width = w.req.width ?? ''
      el.style.minWidth = w.req.minWidth ?? ''
    }
    if (place.height) { el.style.height = place.height; el.style.minHeight = '' } else if (w.stretch.y) {
      el.style.height = ''
      el.style.minHeight = w.req.height ?? ''
    } else {
      el.style.height = w.req.height ?? ''
      el.style.minHeight = ''
    }
    if (w.kind === 'scale' && w.range && w.props.orient !== 'vertical') {
      w.range.style.width = w.stretch.x || place.width ? 'auto' : `${Number(w.props.length || 100)}px`
      w.range.style.alignSelf = w.stretch.x || place.width ? 'stretch' : ''
    }
    if (w.kind === 'canvas' && w.canvas) {
      // The drawing area follows the widget when fill/expand or place stretches it.
      const s = w.canvas.svg
      if (w.stretch.x || w.stretch.y || place.width || place.height) {
        s.style.width = w.stretch.x || place.width ? '100%' : ''
        s.style.height = w.stretch.y || place.height ? '100%' : ''
      } else {
        s.style.width = ''
        s.style.height = ''
      }
    }
  }

  private raise(id: number) {
    const w = this.widgets.get(id)
    if (!w) return
    if (w.kind === 'toplevel') { this.windows.appendChild(w.el); return }
    w.el.style.zIndex = String(++this.zCounter)
    if (!w.el.style.position) w.el.style.position = 'relative'
  }

  private lower(id: number) {
    const w = this.widgets.get(id)
    if (!w) return
    if (w.kind === 'toplevel') { this.windows.prepend(w.el); return }
    w.el.style.zIndex = String(-(++this.zCounter))
    if (!w.el.style.position) w.el.style.position = 'relative'
  }

  private setGrab(id: number | null) {
    this.grab = id
    for (const w of this.widgets.values()) {
      if (w.kind !== 'toplevel') continue
      w.el.classList.toggle('tkx-grabbed-out', id !== null && w.id !== id)
    }
  }

  // ── Values, carets, selections ─────────────────────────────────────────

  private setValue(id: number, value: string) {
    const w = this.widgets.get(id)
    const field = w?.field
    if (!field) return
    if (field.value === value) return
    const focused = document.activeElement === field
    const caret = focused ? field.selectionStart : null
    field.value = value
    if (focused && caret !== null) {
      const pos = Math.min(value.length, caret)
      try { field.setSelectionRange(pos, pos) } catch { /* not all inputs */ }
    }
  }

  private setCaret(id: number, pos: number) {
    const field = this.widgets.get(id)?.field
    if (!field) return
    try { field.setSelectionRange(pos, pos) } catch { /* ignore */ }
  }

  private setSelectionRange(id: number, a: number, b: number) {
    const field = this.widgets.get(id)?.field
    if (!field) return
    try { field.setSelectionRange(a, b) } catch { /* ignore */ }
  }

  private see(id: number, index: any) {
    const w = this.widgets.get(id)
    if (!w) return
    if (w.kind === 'text' && w.field) {
      const ta = w.field as HTMLTextAreaElement
      const offset = Number(index)
      if (offset >= ta.value.length - 1) ta.scrollTop = ta.scrollHeight
      else {
        const line = ta.value.slice(0, offset).split('\n').length - 1
        const lh = parseFloat(getComputedStyle(ta).lineHeight) || 16
        const top = line * lh
        if (top < ta.scrollTop || top > ta.scrollTop + ta.clientHeight - lh) ta.scrollTop = Math.max(0, top - ta.clientHeight / 2)
      }
    } else if (w.kind === 'listbox') {
      (w.el.children[Number(index)] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
    } else if (w.kind === 'treeview' && w.treeTable) {
      (w.treeTable.querySelector(`tr[data-iid="${CSS.escape(String(index))}"]`) as HTMLElement | null)?.scrollIntoView({ block: 'nearest' })
    }
  }

  private focusTarget(w: Widget): HTMLElement {
    if (w.field) return w.field
    if (w.kind === 'toplevel') return w.inner!
    if (w.kind === 'canvas' || w.kind === 'frame' || w.kind === 'label' || w.kind === 'labelframe') {
      if (w.el.tabIndex < 0 && !w.el.hasAttribute('tabindex')) w.el.tabIndex = -1
      w.el.style.outline = w.el.style.outline || 'none'
    }
    return w.el
  }

  private focusWidget(id: number) {
    const w = this.widgets.get(id)
    if (!w || this.ended || this.options.shouldYieldFocus?.()) return
    const target = this.focusTarget(w)
    try { target.focus({ preventScroll: true }) } catch { target.focus() }
  }

  private autofocus(id: number) {
    const w = this.widgets.get(id)
    if (!w || this.ended || this.options.shouldYieldFocus?.()) return
    const active = document.activeElement as HTMLElement | null
    if (active && this.windows.contains(active)) return
    if (active && active !== document.body && !this.host.contains(active) && active.closest('input, textarea, [contenteditable="true"]')) return
    requestAnimationFrame(() => {
      if (this.options.shouldYieldFocus?.()) return
      const now = document.activeElement as HTMLElement | null
      if (now && this.windows.contains(now)) return
      try { w.inner?.focus({ preventScroll: true }) } catch { /* ignore */ }
    })
  }

  // ── Listbox ────────────────────────────────────────────────────────────

  private listItems(id: number, items: string[], styles: Record<string, any>) {
    const w = this.widgets.get(id)
    if (!w?.list) return
    w.list.items = items
    w.list.styles = styles
    const el = w.el
    el.textContent = ''
    items.forEach((text, i) => {
      const row = h('div', 'tkx-lbitem')
      row.dataset.i = String(i)
      row.textContent = text
      const st = styles[String(i)]
      if (st?.bg) row.style.background = st.bg
      if (st?.fg) row.style.color = st.fg
      if (st?.selectbg) row.style.setProperty('--tk-selbg', st.selectbg)
      if (st?.selectfg) row.style.setProperty('--tk-selfg', st.selectfg)
      el.appendChild(row)
    })
    this.applyListSelection(w, w.list.selection)
  }

  private listSelection(id: number, sel: number[]) {
    const w = this.widgets.get(id)
    if (!w?.list) return
    this.applyListSelection(w, new Set(sel))
  }

  private applyListSelection(w: Widget, sel: Set<number>) {
    w.list!.selection = sel
    const kids = w.el.children
    for (let i = 0; i < kids.length; i++) kids[i].classList.toggle('tkx-sel', sel.has(i))
  }

  // ── Images ─────────────────────────────────────────────────────────────

  private defineImage(name: string, spec: any) {
    this.images.set(name, { src: spec.src ?? null, w: Number(spec.w || 0), h: Number(spec.h || 0) })
    for (const w of this.widgets.values()) {
      if (w.props?.image === name) this.configure(w.id, w.props)
      if (w.canvas) {
        for (const item of w.canvas.items.values()) {
          if (item.type === 'image' && item.props.image === name) this.drawItem(w, item)
        }
      }
    }
  }

  // ── Canvas ─────────────────────────────────────────────────────────────

  private canvasItem(cid: number, iid: number, type: string, coords: number[], props: Props) {
    const w = this.widgets.get(cid)
    if (!w?.canvas) return
    const existing = w.canvas.items.get(iid)
    if (existing && existing.type === type) {
      existing.coords = coords
      existing.props = props
      this.drawItem(w, existing)
      return
    }
    const el = svg('g') as SVGElement
    el.dataset.tki = String(iid)
    const item: CanvasItem = { id: iid, type, coords, props, el }
    if (existing) existing.el.replaceWith(el)
    else w.canvas.svg.appendChild(el)
    w.canvas.items.set(iid, item)
    this.drawItem(w, item)
  }

  private canvasCoords(cid: number, iid: number, coords: number[]) {
    const w = this.widgets.get(cid)
    const item = w?.canvas?.items.get(iid)
    if (!w || !item) return
    item.coords = coords
    this.drawItem(w, item)
  }

  private canvasDelete(cid: number, ids: number[]) {
    const w = this.widgets.get(cid)
    if (!w?.canvas) return
    for (const iid of ids) {
      const item = w.canvas.items.get(iid)
      if (!item) continue
      if (item.type === 'window' && item.props.win) {
        const win = this.widgets.get(item.props.win)
        if (win) { win.el.remove(); win.manager = null; w.slaves.delete(win.id) }
      }
      item.el.remove()
      w.canvas.items.delete(iid)
    }
  }

  private canvasOrder(cid: number, order: number[]) {
    const w = this.widgets.get(cid)
    if (!w?.canvas) return
    for (const iid of order) {
      const item = w.canvas.items.get(iid)
      if (item) w.canvas.svg.appendChild(item.el)
    }
  }

  private drawItem(w: Widget, item: CanvasItem) {
    const g = item.el
    const p = item.props
    const c = item.coords
    g.textContent = ''
    g.style.display = p.state === 'hidden' ? 'none' : ''
    const stroke = (el: SVGElement, color: string | null | undefined, width: number) => {
      if (has(color)) {
        el.style.stroke = String(color)
        el.style.strokeWidth = String(width)
      } else {
        el.style.stroke = 'none'
      }
      if (Array.isArray(p.dash) && p.dash.length) el.style.strokeDasharray = p.dash.join(' ')
    }
    const fill = (el: SVGElement, color: string | null | undefined) => {
      el.style.fill = has(color) ? String(color) : 'none'
    }
    const hover = (el: SVGElement, prop: 'fill' | 'stroke', active: string | null | undefined) => {
      if (!active) return
      const normal = el.style[prop]
      el.addEventListener('mouseenter', () => { el.style[prop] = active })
      el.addEventListener('mouseleave', () => { el.style[prop] = normal })
    }
    switch (item.type) {
      case 'rectangle':
      case 'oval': {
        const [x1, y1, x2, y2] = c
        const x = Math.min(x1, x2), y = Math.min(y1, y2), wd = Math.abs(x2 - x1), ht = Math.abs(y2 - y1)
        let el: SVGElement
        if (item.type === 'rectangle') {
          el = svg('rect')
          el.setAttribute('x', String(x)); el.setAttribute('y', String(y))
          el.setAttribute('width', String(wd)); el.setAttribute('height', String(ht))
        } else {
          el = svg('ellipse')
          el.setAttribute('cx', String(x + wd / 2)); el.setAttribute('cy', String(y + ht / 2))
          el.setAttribute('rx', String(wd / 2)); el.setAttribute('ry', String(ht / 2))
        }
        fill(el, p.fill)
        stroke(el, p.outline, Number(p.width ?? 1))
        hover(el, 'fill', p.activefill)
        hover(el, 'stroke', p.activeoutline)
        g.appendChild(el)
        break
      }
      case 'arc': {
        const [x1, y1, x2, y2] = c
        const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2
        const start = Number(p.start ?? 0), extent = Number(p.extent ?? 90)
        const style = String(p.style ?? 'pieslice')
        let el: SVGElement
        if (Math.abs(extent) >= 360) {
          el = svg('ellipse')
          el.setAttribute('cx', String(cx)); el.setAttribute('cy', String(cy))
          el.setAttribute('rx', String(rx)); el.setAttribute('ry', String(ry))
        } else {
          const pt = (deg: number) => [cx + rx * Math.cos(deg * Math.PI / 180), cy - ry * Math.sin(deg * Math.PI / 180)]
          const [sx, sy] = pt(start)
          const [ex, ey] = pt(start + extent)
          const large = Math.abs(extent) > 180 ? 1 : 0
          const sweep = extent > 0 ? 0 : 1
          let d = `M ${sx} ${sy} A ${rx} ${ry} 0 ${large} ${sweep} ${ex} ${ey}`
          if (style === 'pieslice') d = `M ${cx} ${cy} L ${sx} ${sy} A ${rx} ${ry} 0 ${large} ${sweep} ${ex} ${ey} Z`
          else if (style === 'chord') d += ' Z'
          el = svg('path')
          el.setAttribute('d', d)
        }
        fill(el, style === 'arc' ? null : p.fill)
        stroke(el, p.outline, Number(p.width ?? 1))
        g.appendChild(el)
        break
      }
      case 'line': {
        const width = Number(p.width ?? 1)
        const pts = [...c]
        const arrow = String(p.arrow ?? 'none')
        const shape = (p.arrowshape as number[] | undefined) ?? [8, 10, 3]
        const heads: number[][] = []
        const head = (tipIdx: number, prevIdx: number) => {
          const tx = pts[tipIdx], ty = pts[tipIdx + 1], px = pts[prevIdx], py = pts[prevIdx + 1]
          const len = Math.hypot(tx - px, ty - py) || 1
          const ux = (tx - px) / len, uy = (ty - py) / len
          const [a, b, cc] = shape
          const half = cc + width / 2
          const neck = [tx - ux * a, ty - uy * a]
          const back = [tx - ux * b, ty - uy * b]
          heads.push([tx, ty, back[0] - uy * half, back[1] + ux * half, neck[0], neck[1], back[0] + uy * half, back[1] - ux * half])
          return neck
        }
        if (pts.length >= 4 && (arrow === 'last' || arrow === 'both')) {
          const n = pts.length
          const neck = head(n - 2, n - 4)
          pts[n - 2] = neck[0]; pts[n - 1] = neck[1]
        }
        if (pts.length >= 4 && (arrow === 'first' || arrow === 'both')) {
          const neck = head(0, 2)
          pts[0] = neck[0]; pts[1] = neck[1]
        }
        let el: SVGElement
        if (p.smooth && pts.length >= 6) {
          el = svg('path')
          el.setAttribute('d', smoothPath(pts, false))
        } else {
          el = svg('polyline')
          el.setAttribute('points', pointsAttr(pts))
        }
        el.style.fill = 'none'
        stroke(el, p.fill, width)
        el.style.strokeLinecap = p.capstyle === 'projecting' ? 'square' : String(p.capstyle ?? 'butt')
        el.style.strokeLinejoin = String(p.joinstyle ?? 'round')
        hover(el, 'stroke', p.activefill)
        g.appendChild(el)
        for (const hd of heads) {
          const poly = svg('polygon')
          poly.setAttribute('points', pointsAttr(hd))
          poly.style.fill = has(p.fill) ? String(p.fill) : 'none'
          g.appendChild(poly)
        }
        break
      }
      case 'polygon': {
        let el: SVGElement
        if (p.smooth && c.length >= 6) {
          el = svg('path')
          el.setAttribute('d', smoothPath(c, true))
        } else {
          el = svg('polygon')
          el.setAttribute('points', pointsAttr(c))
        }
        fill(el, p.fill)
        stroke(el, p.outline, Number(p.width ?? 1))
        el.style.strokeLinejoin = String(p.joinstyle ?? 'round')
        hover(el, 'fill', p.activefill)
        g.appendChild(el)
        break
      }
      case 'text': {
        const el = svg('text')
        const [x, y] = c
        const font = Array.isArray(p.font) ? p.font : [FONT_DEFAULT, '']
        el.style.font = font[0]
        if (font[1]) el.style.textDecoration = font[1]
        el.style.fill = has(p.fill) ? String(p.fill) : 'none'
        el.style.whiteSpace = 'pre'
        const anchor = String(p.anchor ?? 'center')
        const textAnchor = anchor.includes('w') ? 'start' : anchor.includes('e') && anchor !== 'center' ? 'end' : 'middle'
        el.setAttribute('text-anchor', textAnchor)
        let lines = String(p.text ?? '').split('\n')
        const wrap = Number(p.width || 0)
        if (wrap > 0) lines = wrapLines(lines, font[0], wrap)
        const lineHeight = 1.2
        const count = lines.length
        const shift = anchor.startsWith('n') ? 0 : anchor.startsWith('s') ? -(count * lineHeight) : -(count * lineHeight) / 2
        lines.forEach((line, i) => {
          const span = svg('tspan')
          span.setAttribute('x', String(x))
          span.setAttribute('dy', i === 0 ? `${shift + 0.9}em` : `${lineHeight}em`)
          span.textContent = line || ' '
          el.appendChild(span)
        })
        el.setAttribute('y', String(y))
        const angle = Number(p.angle || 0)
        if (angle) el.setAttribute('transform', `rotate(${-angle} ${x} ${y})`)
        hover(el, 'fill', p.activefill)
        g.appendChild(el)
        break
      }
      case 'image': {
        const img = p.image ? this.images.get(p.image) : null
        if (!img || !img.src) break
        const el = svg('image')
        const iw = img.w, ih = img.h
        const anchor = String(p.anchor ?? 'center')
        const [x, y] = c
        const x0 = anchor.includes('w') ? x : anchor.includes('e') && anchor !== 'center' ? x - iw : x - iw / 2
        const y0 = anchor.startsWith('n') ? y : anchor.startsWith('s') ? y - ih : y - ih / 2
        el.setAttribute('href', img.src)
        el.setAttribute('x', String(x0)); el.setAttribute('y', String(y0))
        el.setAttribute('width', String(iw)); el.setAttribute('height', String(ih))
        el.setAttribute('preserveAspectRatio', 'none')
        g.appendChild(el)
        break
      }
      case 'window': {
        const win = p.win ? this.widgets.get(p.win) : null
        if (!win) break
        const el = win.el
        const [x, y] = c
        win.manager = 'canvas'
        win.master = w.id
        w.slaves.add(win.id)
        el.style.position = 'absolute'
        el.style.left = `${x}px`
        el.style.top = `${y}px`
        el.style.margin = '0'
        el.style.transform = anchorTranslate(String(p.anchor ?? 'center'))
        win.placeSize = { width: p.width ? `${p.width}px` : null, height: p.height ? `${p.height}px` : null }
        win.manager = 'place'
        w.inner!.appendChild(el)
        this.applySize(win)
        win.manager = 'canvas'
        break
      }
      default: break
    }
  }

  // ── Notebook ───────────────────────────────────────────────────────────

  private setTabs(id: number, tabs: any[], current: number | null) {
    const w = this.widgets.get(id)
    if (!w) return
    w.tabs = tabs
    w.currentTab = current
    const body = w.inner!
    for (const t of tabs) {
      const page = this.widgets.get(t.w)
      if (!page) continue
      page.manager = 'notebook'
      page.master = id
      w.slaves.add(page.id)
      page.el.style.margin = '0'
      page.el.style.position = ''
      page.el.style.gridArea = '1 / 1'
      page.el.style.visibility = t.w === current ? '' : 'hidden'
      page.el.style.zIndex = t.w === current ? '1' : '0'
      page.el.style.display = t.state === 'hidden' ? 'none' : ''
      page.stretch = { x: true, y: true }
      if (page.el.parentElement !== body) body.appendChild(page.el)
      this.applySize(page)
    }
    this.renderTabs(w)
  }

  private renderTabs(w: Widget) {
    const strip = w.tabstrip
    if (!strip || !w.tabs) return
    const p = w.props
    strip.textContent = ''
    w.tabs.forEach((t, i) => {
      if (t.state === 'hidden') return
      const tab = h('div', 'tkx-tab')
      tab.textContent = t.text
      tab.classList.toggle('tkx-sel', t.w === w.currentTab)
      tab.classList.toggle('tkx-disabled', t.state === 'disabled')
      if (p.tabbg) tab.style.background = p.tabbg
      if (p.tabfg) tab.style.color = p.tabfg
      if (p.tabfont) this.font(tab, p.tabfont)
      if (p.tabpadding) tab.style.padding = `${p.tabpadding[1]}px ${p.tabpadding[2]}px ${p.tabpadding[3]}px ${p.tabpadding[0]}px`
      if (t.w === w.currentTab && p.tabsel) {
        if (p.tabsel.background) tab.style.background = p.tabsel.background
        if (p.tabsel.foreground) tab.style.color = p.tabsel.foreground
      }
      tab.addEventListener('mousedown', e => { e.preventDefault(); this.push({ t: 'nbtab', w: w.id, i }) })
      strip.appendChild(tab)
    })
  }

  // ── Treeview ───────────────────────────────────────────────────────────

  private setTree(id: number, model: any) {
    const w = this.widgets.get(id)
    if (!w) return
    w.tree = { ...w.tree, ...model }
    this.styleTreeBox(w)
  }

  private findTreeRow(rows: any[], iid: string): any {
    for (const r of rows) {
      if (r.iid === iid) return r
      const found = this.findTreeRow(r.children ?? [], iid)
      if (found) return found
    }
    return null
  }

  private renderTree(w: Widget) {
    const table = w.treeTable
    const tree = w.tree
    if (!table || !tree) return
    table.textContent = ''
    const show: string[] = tree.show ?? ['tree', 'headings']
    const showTree = show.includes('tree')
    const showHead = show.includes('headings')
    const columns: any[] = (tree.columns ?? []).filter((c: any) => c.id !== '#0' || showTree)
    const colgroup = h('colgroup')
    let total = 0
    for (const c of columns) {
      const colEl = h('col')
      colEl.style.width = `${c.width}px`
      total += c.width
      colgroup.appendChild(colEl)
    }
    table.appendChild(colgroup)
    table.style.width = `${total}px`
    w.req.width = `${total + 2}px`
    const p = w.props
    if (showHead) {
      const thead = h('thead')
      const tr = h('tr')
      for (const c of columns) {
        const th = h('th')
        th.textContent = c.text
        th.style.textAlign = c.hanchor.includes('w') ? 'left' : c.hanchor.includes('e') && c.hanchor !== 'center' ? 'right' : 'center'
        th.dataset.col = c.id
        if (c.command) th.classList.add('tkx-clickable')
        if (p.headbg) th.style.background = p.headbg
        if (p.headfg) th.style.color = p.headfg
        if (p.headfont) this.font(th, p.headfont)
        tr.appendChild(th)
      }
      thead.appendChild(tr)
      table.appendChild(thead)
    }
    const tbody = h('tbody')
    const tags = tree.tags ?? {}
    const addRows = (rows: any[], depth: number) => {
      for (const r of rows) {
        const tr = h('tr')
        tr.dataset.iid = r.iid
        for (const tag of r.tags ?? []) {
          const st = tags[tag]
          if (st?.bg) tr.style.background = st.bg
          if (st?.fg) tr.style.color = st.fg
          if (st?.font) this.font(tr, st.font)
        }
        for (const c of columns) {
          const td = h('td')
          if (c.id === '#0') {
            td.style.paddingLeft = `${4 + depth * 18}px`
            const toggle = h('span', 'tkx-toggle')
            toggle.textContent = r.children?.length ? (r.open ? '▾' : '▸') : ''
            td.appendChild(toggle)
            if (r.image) {
              const img = this.images.get(r.image)
              if (img?.src) {
                const im = h('img')
                im.src = img.src
                im.style.cssText = `width:${img.w}px;height:${img.h}px;vertical-align:middle;margin-right:3px`
                td.appendChild(im)
              }
            }
            td.append(r.text)
          } else {
            const idx = (tree.columns as any[]).filter((cc: any) => cc.id !== '#0').indexOf(c)
            td.textContent = r.values?.[idx] ?? ''
            td.style.textAlign = c.anchor.includes('w') ? 'left' : c.anchor.includes('e') && c.anchor !== 'center' ? 'right' : 'center'
          }
          tr.appendChild(td)
        }
        tbody.appendChild(tr)
        if (r.open && r.children?.length) addRows(r.children, depth + 1)
      }
    }
    addRows(tree.rows ?? [], 0)
    table.appendChild(tbody)
    this.paintTreeSelection(w)
  }

  private paintTreeSelection(w: Widget) {
    const sel = new Set<string>(w.tree?.selection ?? [])
    for (const tr of w.treeTable?.querySelectorAll('tr[data-iid]') ?? []) {
      tr.classList.toggle('tkx-sel', sel.has((tr as HTMLElement).dataset.iid!))
    }
  }

  // ── Combobox ───────────────────────────────────────────────────────────

  private openCombo(id: number) {
    const w = this.widgets.get(id)
    if (!w || this.ended) return
    this.closeMenus()
    const values: string[] = w.props.values ?? []
    const list = h('div', 'tkx-dropdown')
    const current = w.field?.value ?? ''
    for (const v of values) {
      const row = h('div')
      row.textContent = v || ' '
      if (v === current) row.classList.add('tkx-sel')
      row.addEventListener('mousedown', e => {
        e.preventDefault()
        if (w.field) w.field.value = v
        this.push({ t: 'combo', w: id, v })
        this.closeMenus()
      })
      list.appendChild(row)
    }
    if (!values.length) { const row = h('div'); row.textContent = ' '; list.appendChild(row) }
    const pos = this.localRect(w.el)
    list.style.left = `${pos.left}px`
    list.style.top = `${pos.bottom}px`
    list.style.minWidth = `${pos.width}px`
    list.style.maxHeight = `${Math.max(3, Number(w.props.rows || 10)) * 1.25 + 0.4}em`
    this.font(list, w.props.font)
    this.windows.appendChild(list)
    this.trackMenu(list)
    list.querySelector('.tkx-sel')?.scrollIntoView({ block: 'nearest' })
  }

  // ── Menus ──────────────────────────────────────────────────────────────

  private renderMenubar(w: Widget, model: any) {
    const bar = w.menubar!
    bar.textContent = ''
    if (!model) return
    if (model.bg) bar.style.background = model.bg
    for (const item of model.items ?? []) {
      if (item.type === 'separator' || item.type === 'tearoff') continue
      const el = h('div', 'tkx-mbitem')
      this.renderText(el, String(item.label ?? ''), Number(item.underline ?? -1))
      if (item.state === 'disabled') el.style.color = '#a0a0a0'
      if (model.fg) el.style.color = model.fg
      if (model.font) this.font(el, model.font)
      el.addEventListener('mousedown', e => {
        e.preventDefault()
        if (item.state === 'disabled' || this.ended) return
        if (item.type === 'cascade') {
          const wasOpen = el.classList.contains('tkx-open')
          this.closeMenus()
          if (!wasOpen) {
            el.classList.add('tkx-open')
            const menu = this.openMenuBelow(item.menu, el)
            if (menu) (menu as any)._tkxOwner = el
          }
        } else {
          this.closeMenus()
          this.push({ t: 'menu', m: model.id, i: item.i })
        }
      })
      el.addEventListener('mouseenter', () => {
        const open = bar.querySelector('.tkx-open')
        if (open && open !== el && item.type === 'cascade') {
          this.closeMenus()
          el.classList.add('tkx-open')
          this.openMenuBelow(item.menu, el)
        }
      })
      bar.appendChild(el)
    }
  }

  private localRect(el: HTMLElement) {
    const r = el.getBoundingClientRect()
    const base = this.windows.getBoundingClientRect()
    const z = this.zoom
    return { left: (r.left - base.left) / z, top: (r.top - base.top) / z, right: (r.right - base.left) / z, bottom: (r.bottom - base.top) / z, width: r.width / z, height: r.height / z }
  }

  private openMenuBelow(model: any, anchor: HTMLElement): HTMLElement | null {
    if (!model) return null
    const r = this.localRect(anchor)
    return this.openMenu(model, r.left, r.bottom, 0)
  }

  private popupMenu(model: any, x: number, y: number) {
    this.closeMenus()
    this.openMenu(model, Number(x), Number(y), 0)
  }

  private openMenu(model: any, x: number, y: number, level: number): HTMLElement {
    // Close anything deeper than this level first (switching submenus).
    while (this.openMenus.length > level) {
      const m = this.openMenus.pop()!
      m.remove()
    }
    const menu = h('div', 'tkx-menu')
    menu.style.left = `${x}px`
    menu.style.top = `${y}px`
    if (model.bg) menu.style.background = model.bg
    if (model.fg) menu.style.color = model.fg
    if (model.font) this.font(menu, model.font)
    if (model.activebg) menu.style.setProperty('--tk-mabg', model.activebg)
    if (model.activefg) menu.style.setProperty('--tk-mafg', model.activefg)
    for (const item of model.items ?? []) {
      if (item.type === 'separator') { menu.appendChild(h('div', 'tkx-menusep')); continue }
      if (item.type === 'tearoff') { menu.appendChild(h('div', 'tkx-tearoff')); continue }
      const row = h('div', 'tkx-menuitem')
      const mark = h('span', 'tkx-mark')
      mark.textContent = item.type === 'checkbutton' ? (item.on ? '✓' : '') : item.type === 'radiobutton' ? (item.on ? '•' : '') : ''
      const label = h('span', 'tkx-mlabel')
      this.renderText(label, String(item.label ?? ''), Number(item.underline ?? -1))
      const accel = h('span', 'tkx-accel')
      accel.textContent = item.type === 'cascade' ? '›' : String(item.accel ?? '')
      row.append(mark, label, accel)
      if (item.fg) row.style.color = item.fg
      if (item.bg) row.style.background = item.bg
      if (item.font) this.font(row, item.font)
      const disabled = item.state === 'disabled'
      row.classList.toggle('tkx-disabled', disabled)
      if (item.type === 'cascade') {
        row.addEventListener('mouseenter', () => {
          if (disabled) return
          for (const r of menu.querySelectorAll('.tkx-open')) r.classList.remove('tkx-open')
          row.classList.add('tkx-open')
          const rr = this.localRect(row)
          this.openMenu(item.menu, rr.right - 2, rr.top - 3, level + 1)
        })
      } else {
        row.addEventListener('mouseenter', () => {
          while (this.openMenus.length > level + 1) this.openMenus.pop()!.remove()
          for (const r of menu.querySelectorAll('.tkx-open')) r.classList.remove('tkx-open')
        })
        row.addEventListener('mouseup', e => {
          e.preventDefault()
          if (disabled) return
          this.closeMenus()
          this.push({ t: 'menu', m: model.id, i: item.i })
        })
      }
      menu.appendChild(row)
    }
    menu.addEventListener('mousedown', e => e.preventDefault())
    this.windows.appendChild(menu)
    this.trackMenu(menu)
    return menu
  }

  private trackMenu(menu: HTMLElement) {
    this.openMenus.push(menu)
    if (!this.docListener) {
      this.docListener = (e: MouseEvent) => {
        const t = e.target as HTMLElement
        if (this.openMenus.some(m => m.contains(t))) return
        if (t.closest?.('.tkx-mbitem') || t.closest?.('.tkx-combo button') || t.closest?.('.tkx-mbutton')) return
        this.closeMenus()
      }
      document.addEventListener('mousedown', this.docListener, true)
    }
  }

  private closeMenus() {
    for (const m of this.openMenus) m.remove()
    this.openMenus = []
    for (const el of this.windows.querySelectorAll('.tkx-mbitem.tkx-open')) el.classList.remove('tkx-open')
    if (this.docListener) {
      document.removeEventListener('mousedown', this.docListener, true)
      this.docListener = null
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────

  private answer(q: any): any {
    switch (q.q) {
      case 'geom': {
        const w = this.widgets.get(q.w)
        if (!w) return null
        const el = w.kind === 'toplevel' ? w.inner! : w.el
        const r = el.getBoundingClientRect()
        const base = this.windows.getBoundingClientRect()
        const parentEl = w.master !== null ? this.widgets.get(w.master)?.inner : null
        const pr = parentEl ? parentEl.getBoundingClientRect() : (w.kind === 'toplevel' ? w.el.getBoundingClientRect() : r)
        const z = this.zoom
        const mapped = el.isConnected && r.width > 0 && getComputedStyle(el).visibility !== 'hidden'
        return {
          w: Math.round(r.width / z), h: Math.round(r.height / z),
          x: Math.round((r.left - pr.left) / z), y: Math.round((r.top - pr.top) / z),
          rx: Math.round((r.left - base.left) / z), ry: Math.round((r.top - base.top) / z),
          m: mapped ? 1 : 0, rw: Math.round(r.width / z), rh: Math.round(r.height / z),
        }
      }
      case 'caret': {
        const f = this.widgets.get(q.w)?.field
        return f ? f.selectionStart ?? f.value.length : null
      }
      case 'selection': {
        const f = this.widgets.get(q.w)?.field
        return f ? [f.selectionStart ?? 0, f.selectionEnd ?? 0] : null
      }
      case 'focus': {
        const active = document.activeElement as HTMLElement | null
        const el = active?.closest?.('[data-tkw]') as HTMLElement | null
        return el && this.windows.contains(el) ? Number(el.dataset.tkw) : null
      }
      case 'textbbox': {
        const w = this.widgets.get(q.w)
        const item = w?.canvas?.items.get(q.i)
        if (!item) return null
        try {
          const b = (item.el as SVGGraphicsElement).getBBox()
          if (!b.width && !b.height) return null
          return [Math.floor(b.x), Math.floor(b.y), Math.ceil(b.x + b.width), Math.ceil(b.y + b.height)]
        } catch { return null }
      }
      case 'lbnearest': {
        const w = this.widgets.get(q.w)
        if (!w?.list) return 0
        const kids = w.el.children
        const y = Number(q.y) + w.el.scrollTop
        for (let i = 0; i < kids.length; i++) {
          const k = kids[i] as HTMLElement
          if (y < k.offsetTop + k.offsetHeight) return i
        }
        return Math.max(0, kids.length - 1)
      }
      case 'tvrow': {
        const w = this.widgets.get(q.w)
        if (!w?.treeTable) return ''
        const base = w.el.getBoundingClientRect()
        const y = base.top + Number(q.y) * this.zoom
        for (const tr of w.treeTable.querySelectorAll('tr[data-iid]')) {
          const r = tr.getBoundingClientRect()
          if (y >= r.top && y < r.bottom) return (tr as HTMLElement).dataset.iid
        }
        return ''
      }
      case 'tvcol': {
        const w = this.widgets.get(q.w)
        if (!w?.treeTable) return ''
        const base = w.el.getBoundingClientRect()
        const x = base.left + Number(q.x) * this.zoom
        const cols = [...w.treeTable.querySelectorAll('col')]
        let left = w.treeTable.getBoundingClientRect().left
        const show: string[] = w.tree?.show ?? []
        const offset = show.includes('tree') ? 0 : 1
        for (let i = 0; i < cols.length; i++) {
          const width = cols[i].getBoundingClientRect().width || parseFloat(cols[i].style.width) * this.zoom
          if (x >= left && x < left + width) return `#${i + offset}`
          left += width
        }
        return ''
      }
      case 'tvregion': {
        const w = this.widgets.get(q.w)
        if (!w?.treeTable) return 'nothing'
        const base = w.el.getBoundingClientRect()
        const x = base.left + Number(q.x) * this.zoom
        const y = base.top + Number(q.y) * this.zoom
        const head = w.treeTable.querySelector('thead')?.getBoundingClientRect()
        if (head && y >= head.top && y < head.bottom) return 'heading'
        for (const tr of w.treeTable.querySelectorAll('tr[data-iid]')) {
          const r = tr.getBoundingClientRect()
          if (y >= r.top && y < r.bottom) {
            const first = tr.firstElementChild?.getBoundingClientRect()
            return (w.tree?.show ?? []).includes('tree') && first && x < first.right ? 'tree' : 'cell'
          }
        }
        return 'nothing'
      }
      case 'screen': return { w: window.screen?.width || 1366, h: window.screen?.height || 768 }
      case 'rgb': {
        const ctx = measure()
        if (!ctx) return null
        ctx.fillStyle = '#010203'
        ctx.fillStyle = String(q.c)
        const v = String(ctx.fillStyle)
        if (v === '#010203' && String(q.c).toLowerCase() !== '#010203') return 'bad'
        if (v.startsWith('#')) return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)]
        const m = v.match(/(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/)
        return m ? [Math.round(Number(m[1])), Math.round(Number(m[2])), Math.round(Number(m[3]))] : [0, 0, 0]
      }
      case 'measure': {
        const ctx = measure()
        if (!ctx) return null
        ctx.font = String(q.font)
        return Math.round(ctx.measureText(String(q.text)).width)
      }
      case 'metrics': {
        const ctx = measure()
        if (!ctx) return null
        ctx.font = String(q.font)
        const m = ctx.measureText('Mg')
        const ascent = Math.round((m as any).fontBoundingBoxAscent ?? m.actualBoundingBoxAscent ?? 10)
        const descent = Math.round((m as any).fontBoundingBoxDescent ?? m.actualBoundingBoxDescent ?? 3)
        return { ascent, descent, linespace: ascent + descent }
      }
      default: return null
    }
  }

  // ── Events from the student ────────────────────────────────────────────

  private push(ev: any) {
    if (this.ended) return
    const last = this.events[this.events.length - 1]
    if (ev.t === 'mouse' && ev.k === 'motion' && last && last.t === 'mouse' && last.k === 'motion' && last.w === ev.w) {
      this.events[this.events.length - 1] = ev
    } else {
      this.events.push(ev)
    }
    this.wake()
  }

  private widgetAt(target: EventTarget | null): { w: Widget; el: HTMLElement } | null {
    const t = target as HTMLElement | null
    if (!t || !t.closest) return null
    const el = t.closest('[data-tkw]') as HTMLElement | null
    if (!el || !this.windows.contains(el)) return null
    const w = this.widgets.get(Number(el.dataset.tkw))
    return w ? { w, el: w.kind === 'toplevel' ? w.inner! : w.el } : null
  }

  private chainFor(w: Widget | null): number[] {
    const chain: number[] = []
    let cur = w
    while (cur) {
      chain.unshift(cur.id)
      cur = cur.parent !== null ? this.widgets.get(cur.parent) ?? null : null
    }
    return chain
  }

  private mods(e: MouseEvent | KeyboardEvent): number {
    let state = 0
    if (e.shiftKey) state |= 0x1
    if (e.getModifierState?.('CapsLock')) state |= 0x2
    if (e.ctrlKey) state |= 0x4
    if (e.altKey) state |= 0x8
    if (e.metaKey) state |= 0x10
    if ('buttons' in e) {
      const b = (e as MouseEvent).buttons
      if (b & 1) state |= 0x100
      if (b & 4) state |= 0x200
      if (b & 2) state |= 0x400
    }
    return state
  }

  private mouseEvent(kind: string, e: MouseEvent, hit: { w: Widget; el: HTMLElement }, extra: Props = {}) {
    const r = hit.el.getBoundingClientRect()
    const base = this.windows.getBoundingClientRect()
    const z = this.zoom
    const ev: any = {
      t: 'mouse', k: kind, w: hit.w.id,
      x: Math.round((e.clientX - r.left) / z), y: Math.round((e.clientY - r.top) / z),
      X: Math.round((e.clientX - base.left) / z), Y: Math.round((e.clientY - base.top) / z),
      m: this.mods(e), ...extra,
    }
    const t = e.target as HTMLElement
    if (hit.w.kind === 'canvas') {
      const itemEl = t.closest?.('[data-tki]') as HTMLElement | null
      ev.i = itemEl ? Number(itemEl.dataset.tki) : null
    } else if (hit.w.kind === 'treeview') {
      const tr = t.closest?.('tr[data-iid]') as HTMLElement | null
      ev.i = tr ? tr.dataset.iid : null
    }
    return ev
  }

  private updateHover(target: EventTarget | null, e: MouseEvent) {
    const hit = this.widgetAt(target)
    const chain = hit ? this.chainFor(hit.w) : []
    const old = this.hoverChain
    if (chain.length === old.length && chain.every((id, i) => id === old[i])) return
    this.hoverChain = chain
    if (!this.want.has('cross')) return
    for (const id of [...old].reverse()) {
      if (chain.includes(id)) continue
      const w = this.widgets.get(id)
      if (w) this.push(this.mouseEvent('leave', e, { w, el: w.kind === 'toplevel' ? w.inner! : w.el }))
    }
    for (const id of chain) {
      if (old.includes(id)) continue
      const w = this.widgets.get(id)
      if (w) this.push(this.mouseEvent('enter', e, { w, el: w.kind === 'toplevel' ? w.inner! : w.el }))
    }
  }

  private trackCanvasItem(e: MouseEvent, hit: { w: Widget; el: HTMLElement } | null) {
    if (!hit || hit.w.kind !== 'canvas' || !hit.w.canvas) return
    const itemEl = (e.target as HTMLElement).closest?.('[data-tki]') as HTMLElement | null
    const item = itemEl ? Number(itemEl.dataset.tki) : null
    if (item === hit.w.canvas.current) return
    hit.w.canvas.current = item
    const r = hit.el.getBoundingClientRect()
    const base = this.windows.getBoundingClientRect()
    this.push({
      t: 'citem', w: hit.w.id, i: item,
      x: Math.round((e.clientX - r.left) / this.zoom), y: Math.round((e.clientY - r.top) / this.zoom),
      X: Math.round((e.clientX - base.left) / this.zoom), Y: Math.round((e.clientY - base.top) / this.zoom),
    })
  }

  private attachListeners() {
    const area = this.windows
    area.addEventListener('mousedown', e => {
      const hit = this.widgetAt(e.target)
      const t = e.target as HTMLElement
      if (hit) {
        // Clicking into a window gives it the keyboard, as a window manager
        // would — unless a widget inside it already has it (a canvas that
        // called focus_set() keeps its key bindings working).
        const top = this.toplevelOf(hit.w)
        const active = document.activeElement as HTMLElement | null
        const focusInWindow = !!(top && active && top.el.contains(active))
        const focusable = t.closest('input, textarea, select, .tkx-listbox, .tkx-tree')
        if (t.closest('.tkx-nofocus')) e.preventDefault()
        if (!focusable && !focusInWindow && top?.inner && !this.options.shouldYieldFocus?.()) {
          if (!t.closest('.tkx-nofocus')) e.preventDefault()
          try { top.inner.focus({ preventScroll: true }) } catch { /* ignore */ }
        }
        if (this.want.has('press')) this.push(this.mouseEvent('press', e, hit, { b: e.button === 1 ? 2 : e.button === 2 ? 3 : 1, n: e.detail || 1 }))
      }
    })
    area.addEventListener('mouseup', e => {
      if (!this.want.has('release')) return
      const hit = this.widgetAt(e.target)
      if (hit) this.push(this.mouseEvent('release', e, hit, { b: e.button === 1 ? 2 : e.button === 2 ? 3 : 1 }))
    })
    area.addEventListener('mousemove', e => {
      const hit = this.widgetAt(e.target)
      this.updateHover(e.target, e)
      this.trackCanvasItem(e, hit)
      if (hit && this.want.has('motion')) this.push(this.mouseEvent('motion', e, hit))
    })
    area.addEventListener('mouseleave', e => this.updateHover(null, e))
    area.addEventListener('wheel', e => {
      if (!this.want.has('wheel')) return
      const hit = this.widgetAt(e.target)
      if (!hit) return
      e.preventDefault()
      this.push(this.mouseEvent('wheel', e, hit, { d: e.deltaY < 0 ? 120 : -120 }))
    }, { passive: false })
    area.addEventListener('contextmenu', e => {
      if (this.want.has('press3') && this.widgetAt(e.target)) e.preventDefault()
    })
    const key = (kind: 'press' | 'release') => (e: KeyboardEvent) => {
      const hit = this.widgetAt(e.target)
      if (!hit) return
      const wanted = kind === 'press' ? this.want.has('key') : this.want.has('keyup')
      const t = e.target as HTMLElement
      const editing = !!t.closest('input, textarea, select')
      // Arrow keys and space would scroll the page under a game.
      if (wanted && !editing && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) e.preventDefault()
      if (!wanted) return
      this.push({ t: 'key', k: kind, w: hit.w.id, key: e.key, code: e.code, kc: e.keyCode, m: this.mods(e) })
    }
    area.addEventListener('keydown', key('press'))
    area.addEventListener('keyup', key('release'))
    area.addEventListener('focusin', e => {
      if (!this.want.has('focus')) return
      const hit = this.widgetAt(e.target)
      if (hit) this.push({ t: 'focus', k: 'in', w: hit.w.id })
    })
    area.addEventListener('focusout', e => {
      if (!this.want.has('focus')) return
      const hit = this.widgetAt(e.target)
      if (hit) this.push({ t: 'focus', k: 'out', w: hit.w.id })
    })
  }

  private toplevelOf(w: Widget): Widget | null {
    let cur: Widget | null = w
    while (cur && cur.kind !== 'toplevel') cur = cur.parent !== null ? this.widgets.get(cur.parent) ?? null : null
    return cur
  }

  private syncResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return
    if (!this.want.has('configure')) {
      this.resizeObserver?.disconnect()
      this.resizeObserver = null
      return
    }
    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          const id = Number((entry.target as HTMLElement).dataset.tkw)
          const r = (entry.target as HTMLElement).getBoundingClientRect()
          const size = `${Math.round(r.width / this.zoom)}x${Math.round(r.height / this.zoom)}`
          if (this.lastSizes.get(id) === size) continue
          this.lastSizes.set(id, size)
          this.push({ t: 'configure', w: id, width: Math.round(r.width / this.zoom), height: Math.round(r.height / this.zoom) })
        }
      })
    }
    for (const w of this.widgets.values()) {
      if (w.kind === 'toplevel' || w.kind === 'canvas' || w.kind === 'frame') this.resizeObserver.observe(w.kind === 'toplevel' ? w.inner! : w.el)
    }
  }

  // ── Dialogs ────────────────────────────────────────────────────────────

  dialog(json: string): Promise<string> {
    let spec: any
    try { spec = JSON.parse(json) } catch { return Promise.resolve('null') }
    if (this.ended) return Promise.resolve('null')
    return new Promise(resolve => {
      const layer = h('div', 'tkx-overlayer')
      const box = h('div', 'tkx-dialog')
      const title = h('div', 'tkx-title')
      const tt = h('span', 'tkx-titletext')
      tt.textContent = spec.title || 'tk'
      const close = h('button', 'tkx-close')
      close.type = 'button'
      close.textContent = '✕'
      title.append(tt, close)
      box.appendChild(title)
      layer.appendChild(box)
      let settled = false
      const finish = (value: any) => {
        if (settled) return
        settled = true
        layer.remove()
        this.dialogs = this.dialogs.filter(d => d.el !== layer)
        resolve(JSON.stringify(value ?? null))
      }
      const cancelValue = this.buildDialog(spec, box, finish)
      close.addEventListener('click', () => finish(cancelValue))
      layer.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); finish(cancelValue) } })
      this.dialogs.push({ el: layer, resolve: v => finish(v), cancel: () => finish(cancelValue) })
      this.overlay.appendChild(layer)
      requestAnimationFrame(() => {
        const target = (box.querySelector('[data-autofocus]') ?? box.querySelector('button.tkx-default') ?? box.querySelector('button')) as HTMLElement | null
        target?.focus({ preventScroll: true })
      })
    })
  }

  /** Builds the dialog body; returns what closing it (✕ / Escape) answers. */
  private buildDialog(spec: any, box: HTMLElement, finish: (value: any) => void): any {
    const main = h('div', 'tkx-dmain')
    const buttons = h('div', 'tkx-dbuttons')
    const addButton = (label: string, value: () => any, isDefault = false) => {
      const b = h('button')
      b.type = 'button'
      b.textContent = label
      if (isDefault) b.classList.add('tkx-default')
      b.addEventListener('click', () => finish(value()))
      buttons.appendChild(b)
      return b
    }
    const text = (s: string, cls = 'tkx-dtext') => { const d = h('div', cls); d.textContent = s; return d }
    const labelFor: Record<string, string> = { ok: 'OK', cancel: 'Cancel', yes: 'Yes', no: 'No', retry: 'Retry', abort: 'Abort', ignore: 'Ignore' }
    if (spec.kind === 'message') {
      const icon = h('div', `tkx-dicon ${spec.icon || 'info'}`)
      icon.textContent = { info: 'i', warning: '!', error: '✕', question: '?' }[String(spec.icon)] ?? 'i'
      const col = h('div', 'tkx-dcol')
      col.appendChild(text(String(spec.message ?? '')))
      if (spec.detail) col.appendChild(text(String(spec.detail), 'tkx-dtext tkx-ddetail'))
      main.append(icon, col)
      const list: string[] = spec.buttons ?? ['ok']
      for (const name of list) addButton(labelFor[name] ?? name, () => name, name === spec.default)
      box.append(main, buttons)
      return list.includes('cancel') ? 'cancel' : list.includes('no') ? 'no' : list[list.length - 1]
    }
    if (spec.kind === 'string') {
      const col = h('div', 'tkx-dcol')
      col.appendChild(text(String(spec.prompt ?? '')))
      const input = h('input', 'tkx-dfield')
      input.type = spec.show ? 'password' : 'text'
      input.value = String(spec.initial ?? '')
      input.dataset.autofocus = '1'
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(input.value) } })
      col.appendChild(input)
      main.appendChild(col)
      addButton('OK', () => input.value, true)
      addButton('Cancel', () => null)
      box.append(main, buttons)
      requestAnimationFrame(() => input.select())
      return null
    }
    if (spec.kind === 'color') {
      const col = h('div', 'tkx-dcol')
      col.appendChild(text('Choose a colour:'))
      const input = h('input')
      input.type = 'color'
      input.value = /^#[0-9a-f]{6}$/i.test(String(spec.initial)) ? String(spec.initial) : '#000000'
      input.style.cssText = 'width:100%;height:40px;margin-top:6px;border:1px solid #7a7a7a;padding:0;background:#fff'
      input.dataset.autofocus = '1'
      col.appendChild(input)
      main.appendChild(col)
      addButton('OK', () => input.value, true)
      addButton('Cancel', () => null)
      box.append(main, buttons)
      return null
    }
    if (spec.kind === 'file') {
      const col = h('div', 'tkx-dcol')
      const mode = String(spec.mode)
      col.appendChild(text(mode === 'save' ? 'Save as:' : mode === 'dir' ? 'Choose a folder:' : 'Open a file from this program\'s files:'))
      const types: [string, string[]][] = spec.filetypes ?? []
      let filter: RegExp[] | null = null
      const select = h('select', 'tkx-dfield')
      if (types.length) {
        for (const [label, pats] of types) {
          const o = h('option')
          o.textContent = `${label} (${pats.join(' ')})`
          select.appendChild(o)
        }
        const setFilter = () => {
          const pats = types[select.selectedIndex]?.[1] ?? ['*']
          filter = pats.map(globToRegExp)
          render()
        }
        select.addEventListener('change', setFilter)
      }
      const listEl = h('div', 'tkx-dfiles')
      const files: string[] = spec.files ?? []
      const chosen = new Set<string>()
      const name = h('input', 'tkx-dfield')
      name.type = 'text'
      name.value = String(spec.initial ?? '')
      const render = () => {
        listEl.textContent = ''
        const visible = files.filter(f => !filter || mode === 'dir' || filter.some(re => re.test(f.split('/').pop() ?? f)))
        if (!visible.length) { const d = h('div'); d.textContent = mode === 'dir' ? '(no folders)' : '(no files)'; d.style.color = '#888'; listEl.appendChild(d) }
        for (const f of visible) {
          const row = h('div')
          row.textContent = f
          row.classList.toggle('tkx-sel', chosen.has(f))
          row.addEventListener('mousedown', e => {
            e.preventDefault()
            if (spec.multiple && (e.ctrlKey || e.metaKey)) { if (chosen.has(f)) chosen.delete(f); else chosen.add(f) } else { chosen.clear(); chosen.add(f) }
            name.value = [...chosen].join(', ')
            render()
          })
          row.addEventListener('dblclick', () => finish(spec.multiple ? [f] : f))
          listEl.appendChild(row)
        }
      }
      if (types.length) {
        filter = (types[0][1] ?? ['*']).map(globToRegExp)
        col.appendChild(select)
      }
      col.appendChild(listEl)
      if (mode === 'save') { name.dataset.autofocus = '1'; col.appendChild(name) }
      render()
      main.appendChild(col)
      const value = () => {
        if (mode === 'save') return name.value.trim() || null
        if (!chosen.size) return null
        return spec.multiple ? [...chosen] : [...chosen][0]
      }
      addButton(mode === 'save' ? 'Save' : mode === 'dir' ? 'Select folder' : 'Open', value, true)
      addButton('Cancel', () => null)
      name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(value()) } })
      box.append(main, buttons)
      return null
    }
    box.append(main, buttons)
    addButton('OK', () => null, true)
    return null
  }

  /**
   * The same dialogs for a browser without JSPI. Python is blocked on the
   * answer and the page cannot run until it has one, so these have to be the
   * browser's own synchronous alert/confirm/prompt — the same deliberate
   * exception to "no native dialogs" as input() on the main thread.
   */
  dialogSync(json: string): string {
    let spec: any
    try { spec = JSON.parse(json) } catch { return 'null' }
    if (this.ended) return 'null'
    const title = spec.title ? `${spec.title}\n\n` : ''
    if (spec.kind === 'message') {
      const list: string[] = spec.buttons ?? ['ok']
      const message = `${title}${spec.message ?? ''}${spec.detail ? `\n\n${spec.detail}` : ''}`
      if (list.length === 1) { window.alert(message); return JSON.stringify(list[0]) }
      const yes = window.confirm(message)
      if (list.includes('yes')) return JSON.stringify(yes ? 'yes' : 'no')
      if (list.includes('retry')) return JSON.stringify(yes ? 'retry' : list.includes('cancel') ? 'cancel' : 'abort')
      return JSON.stringify(yes ? list[0] : list[list.length - 1])
    }
    if (spec.kind === 'string') return JSON.stringify(window.prompt(`${title}${spec.prompt ?? ''}`, String(spec.initial ?? '')))
    if (spec.kind === 'color') return JSON.stringify(window.prompt(`${title}Colour (#rrggbb):`, String(spec.initial ?? '#000000')))
    if (spec.kind === 'file') {
      const files: string[] = spec.files ?? []
      const shown = files.slice(0, 30).join('\n')
      return JSON.stringify(window.prompt(`${title}${spec.mode === 'save' ? 'Save as' : 'File name'}:\n${shown}`, String(spec.initial ?? '')))
    }
    return 'null'
  }
}

function pointsAttr(c: number[]): string {
  const out: string[] = []
  for (let i = 0; i + 1 < c.length; i += 2) out.push(`${c[i]},${c[i + 1]}`)
  return out.join(' ')
}

/** Tk's smoothed line: a quadratic B-spline through the midpoints of each segment. */
function smoothPath(c: number[], closed: boolean): string {
  const pts: [number, number][] = []
  for (let i = 0; i + 1 < c.length; i += 2) pts.push([c[i], c[i + 1]])
  if (closed) pts.push(pts[0], pts[1])
  const mid = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  let d = ''
  if (closed) {
    const m0 = mid(pts[0], pts[1])
    d = `M ${m0[0]} ${m0[1]}`
    for (let i = 1; i < pts.length - 1; i++) {
      const m = mid(pts[i], pts[i + 1])
      d += ` Q ${pts[i][0]} ${pts[i][1]} ${m[0]} ${m[1]}`
    }
    return d + ' Z'
  }
  d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const m = i === pts.length - 2 ? pts[i + 1] : mid(pts[i], pts[i + 1])
    d += ` Q ${pts[i][0]} ${pts[i][1]} ${m[0]} ${m[1]}`
  }
  return d
}

function wrapLines(lines: string[], font: string, width: number): string[] {
  const ctx = measure()
  if (!ctx) return lines
  ctx.font = font
  const out: string[] = []
  for (const line of lines) {
    const words = line.split(/(\s+)/)
    let cur = ''
    for (const word of words) {
      const next = cur + word
      if (cur && ctx.measureText(next).width > width) {
        out.push(cur.trimEnd())
        cur = word.trimStart()
      } else {
        cur = next
      }
    }
    out.push(cur)
  }
  return out
}
