import type { CSSProperties, MutableRefObject } from 'react'
import type { DisplaySurface, DisplayZoom, PlotFigure } from '../types'
import { DISPLAY_ZOOM_LEVELS } from '../utils/storage'
import { CanvasPane, type CanvasPaneHandle } from './CanvasPane'
import { TurtleScrubber } from './TurtleScrubber'

const SURFACE_LABELS: Record<DisplaySurface, string> = {
  canvas: 'Canvas',
  tkinter: 'Window',
  turtle: 'Turtle',
  stdctx: 'Draw',
  plot: 'Plot',
}

interface DisplayPaneProps {
  /** Surfaces with something to show. Empty = the pane is mounted but parked. */
  availableSurfaces: DisplaySurface[]
  activeSurface: DisplaySurface
  onSelectSurface: (surface: DisplaySurface) => void
  /** 'fit' shrinks each surface to the pane; a percentage shows it at that size and scrolls. */
  zoom: DisplayZoom
  onZoomChange: (zoom: DisplayZoom) => void
  /** Shared main-thread canvas host (pygame and the pyo-js turtle). */
  mainThreadCanvasRef: MutableRefObject<HTMLCanvasElement | null>
  /** Where tkinter windows are drawn. The renderer applies the zoom itself. */
  tkinterHostRef: (el: HTMLDivElement | null) => void
  /** sys.stdctx canvas. */
  canvasPaneRef: MutableRefObject<CanvasPaneHandle | null>
  onStdctxKeyDown: (key: string) => void
  onStdctxKeyUp: (key: string) => void
  resolveStdctxImageUri: (uri: string) => string | Promise<string>
  /** Charts this run has produced, oldest first. */
  plotFigures: PlotFigure[]
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
 *
 * Zoom is CSS `zoom` on each surface's content, not a transform: `zoom` scales
 * the layout box along with the pixels, so the scroll area grows with the
 * content and scroll bars appear exactly when a zoomed surface stops fitting.
 * It works the same on a canvas, an SVG, an image and an iframe, so no surface
 * needs to know what size its program chose. pygame maps the mouse through the
 * canvas's on-screen size, so clicks still land where they are aimed.
 */
export function DisplayPane({
  availableSurfaces,
  activeSurface,
  onSelectSurface,
  zoom,
  onZoomChange,
  mainThreadCanvasRef,
  tkinterHostRef,
  canvasPaneRef,
  onStdctxKeyDown,
  onStdctxKeyUp,
  resolveStdctxImageUri,
  plotFigures,
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
  const scale = zoom === 'fit' ? null : zoom / 100
  const zoomStyle: CSSProperties | undefined = scale === null ? undefined : { zoom: scale }
  // Zoomed content may be wider than the pane: let its wrapper grow with it so
  // the scroll container scrolls, while still centring anything smaller.
  const zoomedWrapper = 'min-h-full min-w-full w-max'

  return (
    <div className="flex flex-1 flex-col overflow-hidden min-h-0">
      <div className="bg-slate-900 py-2 px-3 border-b border-slate-700 flex-shrink-0 flex items-center justify-between gap-2">
        <div className="font-bold uppercase tracking-wider text-xs text-teal-400">Display</div>
        <div className="flex items-center gap-2">
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
          <label className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Zoom</span>
            <select
              value={String(zoom)}
              onChange={e => onZoomChange(e.target.value === 'fit' ? 'fit' : Number(e.target.value))}
              title="Display zoom"
              className="bg-slate-800 border border-slate-600 rounded text-[11px] text-slate-300 px-1 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="fit">Fit</option>
              {DISPLAY_ZOOM_LEVELS.map(level => (
                <option key={level} value={level}>{level}%</option>
              ))}
            </select>
          </label>
        </div>
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
        <div className={`${scale === null ? 'mx-auto h-full w-full max-w-6xl' : zoomedWrapper} flex flex-col p-3 ${activeSurface !== 'canvas' ? 'hidden' : ''}`}>
          <div className="flex-1 rounded-xl border border-slate-600 bg-slate-950/80 p-3">
            <canvas
              id="canvas"
              ref={mainThreadCanvasRef}
              className={`mx-auto block rounded bg-slate-950 ${scale === null ? 'max-h-full max-w-full' : ''}`}
              style={{ imageRendering: 'pixelated', outline: 'none', ...zoomStyle }}
              onPointerDown={() => mainThreadCanvasRef.current?.focus()}
            />
          </div>
        </div>

        {/* tkinter windows — DOM drawn by utils/tkinterRenderer.ts */}
        <div ref={tkinterHostRef} className={`min-h-full ${activeSurface !== 'tkinter' ? 'hidden' : ''}`} />

        {/* Basthon SVG turtle */}
        <div className={`${scale === null ? 'mx-auto h-full' : zoomedWrapper} flex items-start justify-center p-3 ${activeSurface !== 'turtle' ? 'hidden' : ''}`}>
          <div dangerouslySetInnerHTML={{ __html: turtleSvg }} className={scale === null ? 'max-w-full' : ''} style={zoomStyle} />
        </div>

        {/* Charts — one per show(), newest last */}
        <div className={`h-full overflow-auto p-3 ${activeSurface !== 'plot' ? 'hidden' : ''}`}>
          <div className={scale === null ? 'mx-auto flex max-w-4xl flex-col items-stretch gap-3' : 'flex w-max min-w-full flex-col items-center gap-3'}>
            {plotFigures.map((figure, i) => figure.kind === 'image' ? (
              <img
                key={i}
                src={figure.uri}
                alt={plotFigures.length > 1 ? `Figure ${i + 1}` : 'Figure'}
                // Zoomed, a chart starts from the size Agg rendered it at.
                className={`mx-auto rounded border border-slate-600 bg-white ${scale === null ? 'max-w-full' : 'max-w-none'}`}
                style={zoomStyle}
              />
            ) : (
              // sandbox without allow-same-origin: the chart runs its own
              // plotly.js on an opaque origin and can touch nothing of ours.
              <iframe
                key={i}
                title={plotFigures.length > 1 ? `Figure ${i + 1}` : 'Figure'}
                srcDoc={figure.html}
                sandbox="allow-scripts"
                className={`rounded border border-slate-600 bg-white ${scale === null ? 'h-[440px] w-full' : 'flex-shrink-0'}`}
                // A plotly figure fills whatever frame it is given, so zoomed it
                // starts from plotly's own default figure width.
                style={scale === null ? undefined : { width: 700, height: 440, zoom: scale }}
              />
            ))}
          </div>
        </div>

        {/* sys.stdctx canvas */}
        <div className={`h-full ${activeSurface !== 'stdctx' ? 'hidden' : 'flex flex-col min-h-0 overflow-hidden'}`}>
          <CanvasPane
            ref={canvasPaneRef}
            zoom={scale}
            onKeyDown={onStdctxKeyDown}
            onKeyUp={onStdctxKeyUp}
            resolveImageUri={resolveStdctxImageUri}
          />
        </div>
      </div>
    </div>
  )
}
