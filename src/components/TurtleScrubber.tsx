interface TurtleScrubberProps {
  history: string[]
  step: number
  isPlaying: boolean
  speed: number
  onStepChange: (step: number) => void
  onTogglePlay: () => void
  onSpeedChange: (speed: number) => void
  onClose: () => void
}

export function TurtleScrubber({ history, step, isPlaying, speed, onStepChange, onTogglePlay, onSpeedChange, onClose }: TurtleScrubberProps) {
  const max = Math.max(0, history.length - 1)
  const canGoPrev = step > 0
  const canGoNext = step < max

  // Speed slider: 1 (2000ms = slowest) to 20 (100ms = fastest)
  const speedSliderVal = Math.round((2100 - speed) / 100)
  const handleSpeedSlider = (val: number) => onSpeedChange(Math.max(100, Math.min(2000, 2100 - val * 100)))

  const btnBase = 'rounded px-1.5 py-0.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed'

  return (
    <div className="flex items-center gap-1.5 border-b border-slate-700 bg-slate-900/90 px-2 py-1.5 text-xs select-none flex-shrink-0">
      <button
        onClick={() => onStepChange(Math.max(0, step - 1))}
        disabled={!canGoPrev}
        title="Previous step"
        className={`${btnBase} text-slate-300 hover:bg-slate-700`}
      >
        ←
      </button>

      <button
        onClick={onTogglePlay}
        disabled={history.length === 0}
        title={isPlaying ? 'Pause' : 'Play from start'}
        className={`${btnBase} min-w-[42px] font-semibold ${isPlaying ? 'text-amber-400 hover:bg-slate-700' : 'text-emerald-400 hover:bg-slate-700'}`}
      >
        {isPlaying ? '⏸ Pause' : '▶ Play'}
      </button>

      <button
        onClick={() => onStepChange(Math.min(max, step + 1))}
        disabled={!canGoNext}
        title="Next step"
        className={`${btnBase} text-slate-300 hover:bg-slate-700`}
      >
        →
      </button>

      <input
        type="range"
        min={0}
        max={max}
        value={step}
        onChange={e => onStepChange(parseInt(e.target.value))}
        className="flex-1 accent-emerald-400 cursor-pointer"
        style={{ minWidth: 60 }}
        title={`Step ${step + 1} of ${history.length}`}
      />

      <span className="text-slate-400 whitespace-nowrap tabular-nums" title="Current step / total steps">
        {step + 1}/{history.length}
      </span>

      <span className="text-slate-500 whitespace-nowrap ml-1">Speed:</span>
      <input
        type="range"
        min={1}
        max={20}
        value={speedSliderVal}
        onChange={e => handleSpeedSlider(parseInt(e.target.value))}
        className="w-14 accent-sky-400 cursor-pointer"
        title={`${speed}ms per step`}
      />

      <button
        onClick={onClose}
        title="Close scrubber"
        className={`${btnBase} ml-1 text-slate-500 hover:text-slate-200 hover:bg-slate-700 font-bold text-sm leading-none`}
      >
        ×
      </button>
    </div>
  )
}
