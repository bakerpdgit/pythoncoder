import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'
import {
  STDCTX_CANVAS_HEIGHT,
  STDCTX_CANVAS_WIDTH,
  clearStdctxImageCache,
  processCanvasCommand,
  type StdctxCommand,
} from '../utils/stdctx'

export type CanvasPaneHandle = {
  /** Replay a batch of stdctx draw commands onto the canvas. */
  draw: (commands: StdctxCommand[]) => void
  /** Clear the canvas, restore the default size, and reset every context setting. */
  clear: () => void
  /** Give the canvas keyboard focus so stdctx.check_key() sees key presses. */
  focus: () => void
}

type CanvasPaneProps = {
  /** Windows virtual key code pressed/released on the canvas (see keyToVirtualKeyCode). */
  onKeyDown?: (key: string) => void
  onKeyUp?: (key: string) => void
  /** Resolves a drawImage() URI, which may name a virtual-filesystem file. */
  resolveImageUri?: (uri: string) => string | Promise<string>
}

/**
 * The Canvas tab of the console panel: an HTML canvas driven by `sys.stdctx`
 * draw commands, matching Python Sponge's graphics pane. It starts at Sponge's
 * fixed 500x400 and follows `stdctx.resize()` from there.
 *
 * The canvas dimensions are deliberately NOT React props: a `resize` command
 * writes them straight to the element, and React must not overwrite that on a
 * later render.
 */
export const CanvasPane = forwardRef<CanvasPaneHandle, CanvasPaneProps>(({ onKeyDown, onKeyUp, resolveImageUri }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const attachCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas
    if (!canvas) return
    // Size it on attach, unconditionally. A bare <canvas> already reports the
    // HTML default of 300x150, so guarding on a falsy width would never fire —
    // and when the pane mounts only once a run has started (the program's
    // stdctx lives in an imported module, so the tab did not exist before),
    // clear() ran against a null ref and nothing else would size it.
    canvas.width = STDCTX_CANVAS_WIDTH
    canvas.height = STDCTX_CANVAS_HEIGHT
  }, [])

  useImperativeHandle(ref, () => ({
    draw: (commands: StdctxCommand[]) => {
      const context = canvasRef.current?.getContext('2d')
      if (!context) return
      for (const command of commands) processCanvasCommand(context, command, resolveImageUri)
    },
    clear: () => {
      const canvas = canvasRef.current
      if (!canvas) return
      // A new run may be drawing different bytes under the same filename.
      clearStdctxImageCache()
      // Every run starts from Sponge's default size. Assigning the width also
      // clears the bitmap and resets fillStyle, transforms and paths.
      canvas.width = STDCTX_CANVAS_WIDTH
      canvas.height = STDCTX_CANVAS_HEIGHT
    },
    focus: () => canvasRef.current?.focus(),
  }), [resolveImageUri])

  return (
    <div className="flex flex-1 min-h-0 items-start justify-center overflow-auto bg-slate-900/40 p-3">
      <canvas
        ref={attachCanvas}
        tabIndex={0}
        aria-label="stdctx canvas"
        onKeyDown={e => { if (onKeyDown) { onKeyDown(e.key); e.preventDefault() } }}
        onKeyUp={e => { if (onKeyUp) { onKeyUp(e.key); e.preventDefault() } }}
        className="flex-shrink-0 rounded border border-slate-600 bg-white outline-none focus:border-teal-400"
      />
    </div>
  )
})

CanvasPane.displayName = 'CanvasPane'
