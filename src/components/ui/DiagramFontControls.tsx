interface Props {
  fontSize: number
  onDecrease: () => void
  onIncrease: () => void
  canDecrease: boolean
  canIncrease: boolean
  hoverClass?: string
}

export const DiagramFontControls = ({ fontSize, onDecrease, onIncrease, canDecrease, canIncrease, hoverClass = 'hover:border-emerald-400' }: Props) => (
  <div className="flex items-center gap-1">
    <button
      type="button"
      onClick={onDecrease}
      disabled={!canDecrease}
      className={`flex h-6 min-w-[2rem] items-center justify-center rounded border border-slate-600 bg-slate-800/70 px-2 text-xs font-bold text-slate-200 transition-colors ${hoverClass} disabled:cursor-not-allowed disabled:opacity-50`}
      title="Decrease diagram font size"
      aria-label="Decrease diagram font size"
    >
      -
    </button>
    <span className="min-w-[3.25rem] text-center font-mono text-[11px] text-slate-400">{fontSize}px</span>
    <button
      type="button"
      onClick={onIncrease}
      disabled={!canIncrease}
      className={`flex h-6 min-w-[2rem] items-center justify-center rounded border border-slate-600 bg-slate-800/70 px-2 text-xs font-bold text-slate-200 transition-colors ${hoverClass} disabled:cursor-not-allowed disabled:opacity-50`}
      title="Increase diagram font size"
      aria-label="Increase diagram font size"
    >
      +
    </button>
  </div>
)
