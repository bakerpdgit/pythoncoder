import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TkRenderer } from './tkinterRenderer'

// What the page does with the operations the browser tkinter sends it. jsdom
// has no layout, so these check the structure the geometry managers build
// (flex parcels, grid tracks, absolute places) and the events queued for
// Python — how it finally looks is the e2e suite's job.

let host: HTMLElement
let r: TkRenderer

const label = { text: 'x', font: ['9pt Arial', ''], anchor: 'center', padx: 1, pady: 1 }

function send(...ops: unknown[][]) {
  r.flush(JSON.stringify(ops))
}

function events() {
  const raw = r.poll()
  return raw ? JSON.parse(raw) : []
}

const packed = (...ids: number[]) => [
  ...ids.map(id => ['manage', id, 'pack', 1, { side: 'top', fill: 'none', expand: false, anchor: 'center', padx: [0, 0], pady: [0, 0] }]),
  ['order', 1, ids],
]

const el = (id: number) => host.querySelector(`[data-tkw="${id}"]`) as HTMLElement

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  r = new TkRenderer(host)
  send(['create', 1, 'toplevel', null, { title: 'Demo', geom: null }])
})

afterEach(() => {
  r.dispose()
  host.remove()
})

describe('TkRenderer', () => {
  it('draws a window with its title, and closing it asks Python', () => {
    expect(host.querySelector('.tkx-titletext')?.textContent).toBe('Demo')
    ;(host.querySelector('.tkx-close') as HTMLButtonElement).click()
    expect(events()).toEqual([{ t: 'close', w: 1 }])
  })

  it('packs a run of same-side slaves into one flex box and the rest into a cavity', () => {
    send(
      ['create', 2, 'label', 1, label], ['create', 3, 'label', 1, label], ['create', 4, 'label', 1, label],
      ['manage', 2, 'pack', 1, { side: 'left', fill: 'none', expand: false, anchor: 'center', padx: [0, 0], pady: [0, 0] }],
      ['manage', 3, 'pack', 1, { side: 'left', fill: 'y', expand: true, anchor: 'center', padx: [5, 5], pady: [0, 0] }],
      ['manage', 4, 'pack', 1, { side: 'top', fill: 'x', expand: false, anchor: 'center', padx: [0, 0], pady: [0, 0] }],
      ['order', 1, [2, 3, 4]],
    )
    const body = host.querySelector('.tkx-body') as HTMLElement
    expect(body.style.display).toBe('flex')
    expect(body.style.flexDirection).toBe('row')
    const parcels = [...body.children].filter(c => c.classList.contains('tkx-parcel')) as HTMLElement[]
    expect(parcels.map(p => p.firstElementChild)).toEqual([el(2), el(3)])
    // expand grows the parcel; fill y stretches the widget within it
    expect(parcels[1].style.flex).toBe('1 1 auto')
    expect(parcels[1].style.alignItems).toBe('stretch')
    expect(el(3).style.margin).toBe('0px 5px')
    const cavity = body.querySelector(':scope > .tkx-cavity') as HTMLElement
    expect(cavity.style.flexDirection).toBe('column')
    expect(cavity.querySelector('.tkx-parcel')?.firstElementChild).toBe(el(4))
  })

  it('grids with weights as fr tracks and sticky as self-alignment', () => {
    send(
      ['create', 2, 'label', 1, label], ['create', 3, 'entry', 1, { width: [20, 'ch'] }],
      ['manage', 2, 'grid', 1, { row: 0, column: 0, rowspan: 1, columnspan: 1, sticky: 'e', padx: [0, 0], pady: [0, 0] }],
      ['manage', 3, 'grid', 1, { row: 0, column: 1, rowspan: 1, columnspan: 1, sticky: 'ew', padx: [0, 0], pady: [2, 2] }],
      ['gridconf', 1, 'column', 1, { weight: 1, minsize: 0, pad: 0 }],
    )
    const body = host.querySelector('.tkx-body') as HTMLElement
    expect(body.style.display).toBe('grid')
    expect(body.style.gridTemplateColumns).toBe('minmax(0px, auto) minmax(0px, 1fr)')
    expect(el(2).style.justifySelf).toBe('end')
    expect(el(3).style.justifySelf).toBe('stretch')
    expect(el(3).style.gridColumn).toBe('2 / span 1')
  })

  it('places slaves absolutely, relative positions as percentages', () => {
    send(
      ['create', 2, 'label', 1, label],
      ['manage', 2, 'place', 1, { x: 10, y: 0, relx: 0.5, rely: 0.25, anchor: 'center', width: null, height: null, relwidth: 0.5, relheight: null }],
    )
    const e = el(2)
    expect(e.style.position).toBe('absolute')
    expect(e.style.left).toBe('calc(50% + 10px)')
    expect(e.style.top).toBe('calc(25% + 0px)')
    expect(e.style.transform).toBe('translate(-50%, -50%)')
    expect(e.style.width).toBe('50%')
  })

  it('queues button clicks, typing and list selections for Python', () => {
    send(
      ['create', 2, 'button', 1, { ...label, text: 'Go' }],
      ['create', 3, 'entry', 1, {}],
      ['create', 4, 'listbox', 1, { selectmode: 'browse' }],
      ['items', 4, ['a', 'b', 'c'], {}],
      ...packed(2, 3, 4),
    )
    ;(el(2) as HTMLButtonElement).click()
    const input = el(3) as HTMLInputElement
    input.value = 'hi'
    input.dispatchEvent(new Event('input'))
    const row = el(4).children[1] as HTMLElement
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(events()).toEqual([
      { t: 'cmd', w: 2 },
      { t: 'edit', w: 3, v: 'hi' },
      { t: 'lbsel', w: 4, sel: [1], a: 1 },
    ])
    expect(el(4).children[1].classList.contains('tkx-sel')).toBe(true)
    send(['value', 3, 'set by Python'])
    expect(input.value).toBe('set by Python')
  })

  it('draws canvas items as SVG and keeps their stacking order', () => {
    send(
      ['create', 2, 'canvas', 1, { width: 100, height: 80 }],
      ...packed(2),
      ['cvitem', 2, 1, 'rectangle', [10, 20, 30, 50], { fill: 'red', outline: 'black', width: 1 }],
      ['cvitem', 2, 2, 'oval', [0, 0, 10, 10], { fill: '', outline: 'blue', width: 2 }],
    )
    const svg = el(2).querySelector('svg')!
    const rect = svg.querySelector('[data-tki="1"] rect') as SVGRectElement
    expect([rect.getAttribute('x'), rect.getAttribute('y'), rect.getAttribute('width'), rect.getAttribute('height')]).toEqual(['10', '20', '20', '30'])
    expect(rect.style.fill).toBe('red')
    expect((svg.querySelector('[data-tki="2"] ellipse') as SVGElement).style.fill).toBe('none')
    send(['cvcoords', 2, 1, [50, 20, 70, 50]], ['cvorder', 2, [2, 1]])
    expect(svg.querySelector('[data-tki="1"] rect')?.getAttribute('x')).toBe('50')
    const items = [...svg.querySelectorAll('[data-tki]')].map(g => g.getAttribute('data-tki'))
    expect(items).toEqual(['2', '1'])
    send(['cvdelete', 2, [1]])
    expect(svg.querySelector('[data-tki="1"]')).toBeNull()
  })

  it('keeps a canvas step per mark, and rebuilds any of them from whole states and changes', () => {
    const frames: number[] = []
    r.dispose()
    host.remove()
    host = document.createElement('div')
    document.body.appendChild(host)
    r = new TkRenderer(host, { onHistoryFrame: (_cid, count) => frames.push(count) })
    send(['create', 1, 'toplevel', null, { title: 't' }], ['create', 2, 'canvas', 1, { width: 100, height: 80 }], ...packed(2))
    const drawing = (layer: Element) => [...layer.children].map(g => g.firstElementChild?.getAttribute('points') ?? '').join('|')
    const liveLayer = () => el(2).querySelector('svg > g')!
    // 120 steps: more than two whole-state blocks, so rebuilding crosses them.
    const live: string[] = []
    for (let i = 0; i < 120; i++) {
      if (i % 7 === 0) send(['cvitem', 2, 1000 + i, 'line', [i, 0, i, 10], { fill: 'black', width: 1 }])
      send(['cvcoords', 2, 1000 + 7 * Math.floor(i / 7), [i, 0, i, 20]])
      if (i % 11 === 5) send(['cvraise', 2, [1000], null])
      if (i % 13 === 12) send(['cvdelete', 2, [1000 + 7 * Math.floor(i / 7)]])
      send(['mark', 2])
      live.push(drawing(liveLayer()))
    }
    expect(frames.at(-1)).toBe(120)
    expect(r.historyLength(2)).toBe(120)
    for (const step of [0, 1, 49, 50, 51, 77, 119]) {
      r.showCanvasFrame(2, step)
      expect((liveLayer() as SVGElement).style.display, `step ${step}`).toBe('none')
      const shown = [...el(2).querySelectorAll('svg > g')].at(-1)!
      expect(drawing(shown), `step ${step}`).toBe(live[step])
    }
    r.showCanvasFrame(2, null)
    expect((liveLayer() as SVGElement).style.display).toBe('')
    expect(el(2).querySelectorAll('svg > g')).toHaveLength(1)
  })

  it('moves only the items Python raised or lowered, and scrolls the view', () => {
    send(
      ['create', 2, 'canvas', 1, { width: 100, height: 80, bd: 2, relief: 'sunken' }],
      ...packed(2),
      ...[1, 2, 3, 4].map(i => ['cvitem', 2, i, 'rectangle', [0, 0, i, i], { fill: 'red', outline: '', width: 1 }]),
    )
    const order = () => [...el(2).querySelectorAll('[data-tki]')].map(g => Number(g.getAttribute('data-tki')))
    send(['cvraise', 2, [1], 4])
    expect(order()).toEqual([2, 3, 4, 1])
    send(['cvraise', 2, [3], null])
    expect(order()).toEqual([3, 2, 4, 1])
    send(['cvlower', 2, [1], 2])
    expect(order()).toEqual([3, 1, 2, 4])
    send(['cvlower', 2, [3], null])
    expect(order()).toEqual([1, 2, 4, 3])
    // Canvas point (x, y) shows at window pixel (x - x0, y - y0), the window
    // measured from the outside of its (here 1px CSS) border, as in Tk.
    send(['cvview', 2, -50, -40])
    const layer = el(2).querySelector('svg > g')!
    expect(layer.getAttribute('transform')).toBe('translate(49 39)')
  })

  it('keeps only the latest mouse motion for a widget, and wakes a sleeping loop', async () => {
    send(['want', ['motion']], ['create', 2, 'label', 1, label], ['manage', 2, 'pack', 1, { side: 'top', fill: 'none', expand: false, anchor: 'center', padx: [0, 0], pady: [0, 0] }], ['order', 1, [2]])
    const sleeping = r.sleep(10_000)
    el(2).dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 1, clientY: 1 }))
    el(2).dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 6 }))
    await sleeping
    const queued = events()
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ t: 'mouse', k: 'motion', w: 2, x: 5, y: 6 })
  })

  it('answers a message box with the button pressed', async () => {
    const answer = r.dialog(JSON.stringify({ kind: 'message', title: 'Q', message: 'Sure?', icon: 'question', buttons: ['yes', 'no'], default: 'yes' }))
    const yes = [...host.querySelectorAll('.tkx-dbuttons button')].find(b => b.textContent === 'Yes') as HTMLButtonElement
    yes.click()
    expect(JSON.parse(await answer)).toBe('yes')
    expect(host.querySelector('.tkx-dialog')).toBeNull()
  })

  it('cancels an open prompt when the program ends', async () => {
    const answer = r.dialog(JSON.stringify({ kind: 'string', title: 'Name', prompt: 'Who?', initial: '' }))
    r.end()
    expect(JSON.parse(await answer)).toBeNull()
    expect(host.querySelector('.tkx-titletext')?.textContent).toContain('not running')
    ;(host.querySelector('.tkx-close') as HTMLButtonElement).click()
    expect(events()).toEqual([])
  })

  it('shows a menu bar whose commands report their entry index', () => {
    send(['config', 1, { title: 'Demo', menu: { id: 9, items: [
      { type: 'tearoff', i: 0 },
      { type: 'command', i: 1, label: 'Quit', state: 'normal', underline: -1 },
    ] } }])
    const item = host.querySelector('.tkx-mbitem') as HTMLElement
    expect(item.textContent).toBe('Quit')
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(events()).toEqual([{ t: 'menu', m: 9, i: 1 }])
  })
})
