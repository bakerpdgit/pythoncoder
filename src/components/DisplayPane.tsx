import type { MutableRefObject } from 'react'
import type { DisplaySurface } from '../types'
import { CanvasPane, type CanvasPaneHandle } from './CanvasPane'
import { TurtleScrubber } from './TurtleScrubber'

const SURFACE_LABELS: Record<DisplaySurface, string> = {
  canvas: 'Canvas',
  turtle: 'Turtle',
  stdctx: 'Draw',
}

interface DisplayPaneProps {
  /** Surfaces with something to show. Empty = the pane is mounted but parked. */
  availableSurfaces: DisplaySurface[]
  activeSurface: DisplaySurface
  onSelectSurface: (surface: DisplaySurface) => void
  /** Shared main-thread canvas host (pygame and the pyo-js turtle). */
  mainThreadCanvasRef: MutableRefObject<HTMLCanvasElement | null>
  /** sys.stdctx canvas. */
  canvasPaneRef: MutableRefObject<CanvasPaneHandle | null>
  onStdctxKeyDown: (key: string) => void
  onStdctxKeyUp: (key: string) => void
  resolveStdctxImageUri: (uri: string) => string | Promise<string>
  /** Basthon SVG turtle: the frame to show, plus the scrubber's own state. */
  turtleSvg: string
  turtleHistory: string[]
  showScrubber: boolean
  scrubStep: number
  scrubPlaying: boolean
  scrubSpeed: number
  onScrubStepChange: (step: number) => void
  onScrubTogglePlay: () => void
  onScrubSpeedChange: (speed: number) => void
  onScrubClose: () => void
}

/**
 * Every kind of visual program output, in one pane directly below the Console.
 *
 * All three surfaces stay mounted for the life of the pane and are hidden with
 * the `hidden` class rather than unmounted: both canvases are driven
 * imperatively through refs, and a remount would throw the drawing away.
 * For the same reason the pane itself stays mounted while it has nothing to
 * show — App keeps the canvas hosts reachable so a run can start drawing into
 * them before React has flushed the state that reveals the pane.
 */
export function DisplayPane({
  availableSurfaces,
  activeSurface,
  onSelectSurface,
  mainThreadCanvasRef,
  canvasPaneRef,
  onStdctxKeyDown,
  onStdctxKeyUp,
  resolveStdctxImageUri,
  turtleSvg,
  turtleHistory,
  showScrubber,
  scrubStep,
  scrubPlaying,
  scrubSpeed,
  onScrubStepChange,
  onScrubTogglePlay,
  onScrubSpeedChange,
  onScrubClose,
}: DisplayPaneProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden min-h-0">
      <div className="bg-slate-900 py-2 px-3 border-b border-slate-700 flex-shrink-0 flex items-center justify-between gap-2">
        <div className="font-bold uppercase tracking-wider text-xs text-teal-400">Display</div>
        {/* Tabs only earn their place when a program drives more than one surface. */}
        {availableSurfaces.length > 1 && (
          <div className="flex rounded overflow-hidden border border-slate-700 text-[11px]" role="tablist" aria-label="Display surfaces">
            {availableSurfaces.map(surface => (
              <button
                key={surface}
                type="button"
                role="tab"
                aria-selected={activeSurface === surface}
                onClick={() => onSelectSurface(surface)}
                className={`px-2.5 py-1 font-bold uppercase tracking-wider ${activeSurface === surface ? 'bg-teal-700 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                {SURFACE_LABELS[surface]}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeSurface === 'turtle' && showScrubber && (
        <TurtleScrubber
          history={turtleHistory}
          step={scrubStep}
          isPlaying={scrubPlaying}
          speed={scrubSpeed}
          onStepChange={onScrubStepChange}
          onTogglePlay={onScrubTogglePlay}
          onSpeedChange={onScrubSpeedChange}
          onClose={onScrubClose}
        />
      )}

      <div className="flex-1 overflow-auto relative min-h-0">
        {/* Main-thread canvas (pygame / pyo-js turtle) */}
        <div className={`mx-auto flex h-full w-full max-w-6xl flex-col p-3 ${activeSurface !== 'canvas' ? 'hidden' : ''}`}>
          <div className="flex-1 rounded-xl border border-slate-600 bg-slate-950/80 p-3">
            <canvas
              id="canvas"
              ref={mainThreadCanvasRef}
              className="mx-auto block max-h-full max-w-full rounded bg-slate-950"
              style={{ imageRendering: 'pixelated', outline: 'none' }}
              onPointerDown={() => mainThreadCanvasRef.current?.focus()}
            />
          </div>
        </div>

        {/* Basthon SVG turtle */}
        <div className={`mx-auto h-full flex items-start justify-center p-3 ${activeSurface !== 'turtle' ? 'hidden' : ''}`}>
          <div dangerouslySetInnerHTML={{ __html: turtleSvg }} className="max-w-full" />
        </div>

        {/* sys.stdctx canvas */}
        <div className={`h-full ${activeSurface !== 'stdctx' ? 'hidden' : 'flex flex-col min-h-0 overflow-hidden'}`}>
          <CanvasPane
            ref={canvasPaneRef}
            onKeyDown={onStdctxKeyDown}
            onKeyUp={onStdctxKeyUp}
            resolveImageUri={resolveStdctxImageUri}
          />
        </div>
      </div>
    </div>
  )
}
