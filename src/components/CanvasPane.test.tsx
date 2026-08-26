import { createRef } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CanvasPane, type CanvasPaneHandle } from './CanvasPane'
import { STDCTX_CANVAS_HEIGHT, STDCTX_CANVAS_WIDTH } from '../utils/stdctx'

describe('CanvasPane', () => {
  const getCanvas = (container: HTMLElement) =>
    container.querySelector('canvas') as HTMLCanvasElement

  // A bare <canvas> already reports 300x150, so this has to be set on attach.
  // It matters most when the pane mounts only once a run has started, which is
  // what happens when the program's stdctx lives in an imported module.
  it('sizes a freshly mounted canvas to the Python Sponge default', () => {
    const { container } = render(<CanvasPane />)
    const canvas = getCanvas(container)
    expect(canvas.width).toBe(STDCTX_CANVAS_WIDTH)
    expect(canvas.height).toBe(STDCTX_CANVAS_HEIGHT)
    expect(canvas.width).not.toBe(300)
  })

  it('restores the default size when a run clears it after a resize', () => {
    const ref = createRef<CanvasPaneHandle>()
    const { container } = render(<CanvasPane ref={ref} />)
    const canvas = getCanvas(container)

    canvas.width = 800
    canvas.height = 600
    ref.current?.clear()

    expect(canvas.width).toBe(STDCTX_CANVAS_WIDTH)
    expect(canvas.height).toBe(STDCTX_CANVAS_HEIGHT)
  })

  it('reports key presses as the key name, and blocks the browser default', () => {
    const pressed: string[] = []
    const released: string[] = []
    const { container } = render(
      <CanvasPane onKeyDown={k => pressed.push(k)} onKeyUp={k => released.push(k)} />,
    )
    const canvas = getCanvas(container)

    const down = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    canvas.dispatchEvent(down)
    const up = new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true, cancelable: true })
    canvas.dispatchEvent(up)

    expect(pressed).toEqual(['ArrowRight'])
    expect(released).toEqual(['ArrowRight'])
    // Arrow keys must not scroll the panel out from under a game.
    expect(down.defaultPrevented).toBe(true)
  })

  it('is focusable so stdctx.check_key() can see key presses', () => {
    const { container } = render(<CanvasPane />)
    expect(getCanvas(container).tabIndex).toBe(0)
  })
})
