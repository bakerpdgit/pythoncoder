import { describe, expect, it, vi } from 'vitest'
import { P5ImageStore, P5Painter } from './p5Draw'

// The painter against a context that records what it is asked to do: the
// operations Coder's p5 sends (src/python/p5) and the canvas calls they
// become. A real canvas paints them in e2e/p5.spec.ts; the tester's pictures
// are compared in p5Compare.test.ts.

function recorder() {
  const calls: unknown[][] = []
  const canvas = { width: 0, height: 0 }
  const props: Record<string, unknown> = {}
  const ctx = new Proxy({ canvas } as Record<string, unknown>, {
    get(target, name: string) {
      if (name in target) return target[name]
      if (name in props) return props[name]
      return (...args: unknown[]) => { calls.push([name, ...args]) }
    },
    set(_target, name: string, value) {
      props[name] = value
      calls.push([`=${name}`, value])
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, canvas }
}

const names = (calls: unknown[][]) => calls.map(c => c[0])

describe('P5Painter', () => {
  it('paints a shape with the fill and stroke last set, scaled for the screen', () => {
    const { ctx, calls } = recorder()
    const painter = new P5Painter(ctx, new P5ImageStore(), 100, 100, { scale: 2 })
    calls.length = 0
    painter.apply([
      ['tf', 1, 0, 0, 1, 10, 20],
      ['fs', 'rgb(255,0,0)'], ['ss', 'rgb(0,0,0)'], ['lw', 3], ['cap', 'round'], ['join', 'miter'],
      ['e', 5, 5, 2, 3],
    ])
    expect(calls).toEqual([
      ['setTransform', 2, 0, 0, 2, 20, 40],
      ['beginPath'],
      ['ellipse', 5, 5, 2, 3, 0, 0, Math.PI * 2],
      ['=fillStyle', 'rgb(255,0,0)'], ['fill'],
      ['=strokeStyle', 'rgb(0,0,0)'], ['=lineWidth', 3], ['=lineCap', 'round'], ['=lineJoin', 'miter'], ['stroke'],
    ])
  })

  it('skips the fill or the outline that is switched off, and paints a background whatever the matrix', () => {
    const { ctx, calls } = recorder()
    const painter = new P5Painter(ctx, new P5ImageStore(), 50, 40)
    painter.apply([['tf', 2, 0, 0, 2, 5, 5], ['fs', 0], ['ss', 'rgb(1,2,3)'], ['lw', 1]])
    calls.length = 0
    painter.apply([['r', 0, 0, 10, 10], ['bg', 'rgb(9,9,9)'], ['ss', 0], ['fs', 'rgb(5,5,5)'], ['l', 0, 0, 1, 1]])
    expect(calls).toEqual([
      ['beginPath'], ['rect', 0, 0, 10, 10],
      ['=strokeStyle', 'rgb(1,2,3)'], ['=lineWidth', 1], ['=lineCap', 'round'], ['=lineJoin', 'miter'], ['stroke'],
      ['save'], ['setTransform', 1, 0, 0, 1, 0, 0], ['=fillStyle', 'rgb(9,9,9)'], ['fillRect', 0, 0, 50, 40], ['restore'],
      // A line with no stroke draws nothing.
      ['beginPath'], ['moveTo', 0, 0], ['lineTo', 1, 1],
    ])
  })

  it('fills an arc as a pie unless told otherwise, and outlines it as its mode says', () => {
    const { ctx, calls } = recorder()
    const painter = new P5Painter(ctx, new P5ImageStore(), 100, 100)
    painter.apply([['fs', 'red'], ['ss', 'black'], ['lw', 1]])
    const shapes = (mode: string) => {
      calls.length = 0
      painter.apply([['a', 50, 50, 20, 10, 0, 1, mode]])
      return names(calls).filter(n => ['ellipse', 'lineTo', 'closePath', 'fill', 'stroke'].includes(n as string))
    }
    expect(shapes('default')).toEqual(['ellipse', 'lineTo', 'closePath', 'fill', 'ellipse', 'stroke'])
    expect(shapes('open')).toEqual(['ellipse', 'closePath', 'fill', 'ellipse', 'stroke'])
    expect(shapes('chord')).toEqual(['ellipse', 'closePath', 'fill', 'ellipse', 'closePath', 'stroke'])
    expect(shapes('pie')).toEqual(['ellipse', 'lineTo', 'closePath', 'fill', 'ellipse', 'lineTo', 'closePath', 'stroke'])
  })

  it('rounds the corners it is given, and draws a point as a dot of the stroke colour', () => {
    const { ctx, calls } = recorder()
    const painter = new P5Painter(ctx, new P5ImageStore(), 100, 100)
    painter.apply([['fs', 0], ['ss', 'blue'], ['lw', 6], ['cap', 'round']])
    calls.length = 0
    painter.apply([['r', 0, 0, 20, 10, [2, 2, 2, 2]]])
    expect(names(calls).filter(n => n === 'arcTo')).toHaveLength(4)
    calls.length = 0
    painter.apply([['pt', 5, 6]])
    expect(calls).toEqual([['=fillStyle', 'blue'], ['beginPath'], ['arc', 5, 6, 3, 0, Math.PI * 2], ['fill']])
    calls.length = 0
    painter.apply([['cap', 'butt'], ['pt', 5, 6]])
    expect(calls).toEqual([['=fillStyle', 'blue'], ['fillRect', 2, 3, 6, 6]])
  })

  it('resizes the canvas for `size`, puts the transformation back, and tells its owner', () => {
    const { ctx, calls, canvas } = recorder()
    const onResize = vi.fn()
    const painter = new P5Painter(ctx, new P5ImageStore(), 100, 100, { scale: 2, onResize })
    painter.apply([['tf', 1, 0, 0, 1, 3, 4]])
    calls.length = 0
    painter.apply([['size', 300, 150]])
    expect(canvas).toEqual({ width: 600, height: 300 })
    expect(painter.width).toBe(300)
    expect(calls).toEqual([['setTransform', 2, 0, 0, 2, 6, 8]])
    expect(onResize).toHaveBeenCalledWith(300, 150)
  })

  it('writes text with its font and alignment, outlined only when the sketch asked for an outline', () => {
    const { ctx, calls } = recorder()
    const painter = new P5Painter(ctx, new P5ImageStore(), 100, 100)
    painter.apply([['fs', 'black'], ['ss', 'red'], ['lw', 1], ['font', '20px serif'], ['ta', 'center', 'middle']])
    calls.length = 0
    painter.apply([['t', 'hi', 10, 20, 0], ['t', 'there', 10, 40, 1]])
    expect(names(calls)).toEqual([
      '=font', '=textAlign', '=textBaseline', '=fillStyle', 'fillText',
      '=font', '=textAlign', '=textBaseline', '=fillStyle', 'fillText', '=strokeStyle', '=lineWidth', '=lineJoin', 'strokeText',
    ])
    expect(calls[4]).toEqual(['fillText', 'hi', 10, 20])
  })

  it('holds everything drawn after a picture that is still being decoded', () => {
    const { ctx } = recorder()
    const images = new P5ImageStore()
    const painter = new P5Painter(ctx, images, 100, 100)
    vi.spyOn(images, 'isPending').mockImplementation(id => id === 'img1')
    const ops = [['bg', 'white'], ['imgdef', 'img1', 'image/png', ''], ['img', 'img1', 0, 0, 10, 10], ['r', 0, 0, 5, 5]]
    expect(painter.apply(ops)).toBe(2)
  })
})
