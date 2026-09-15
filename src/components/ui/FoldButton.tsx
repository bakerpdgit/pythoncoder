interface FoldButtonProps {
  collapsed: boolean
  /** Which way the panel folds: up to a header strip at its top, or down to one at its bottom. */
  towards: 'up' | 'down'
  /** What folds, for the tooltip and screen readers: "editor", "console". */
  label: string
  onToggle: () => void
}

const DOUBLE_UP = 'M5 11l7-7 7 7M5 19l7-7 7 7'
const DOUBLE_DOWN = 'M19 13l-7 7-7-7m14-8l-7 7-7-7'

/**
 * The double chevron that folds a whole panel to its header strip — the
 * vertical counterpart of the sidebars' collapse control. It points the way the
 * panel will move: towards its header while open, away from it once folded.
 */
export function FoldButton({ collapsed, towards, label, onToggle }: FoldButtonProps) {
  const action = collapsed ? `Expand ${label}` : `Collapse ${label}`
  const pointsUp = (towards === 'up') !== collapsed
  return (
    <button type="button" onClick={onToggle} title={action} aria-label={action} aria-expanded={!collapsed}
      className="text-slate-400 hover:text-slate-200 transition-colors p-0.5">
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={pointsUp ? DOUBLE_UP : DOUBLE_DOWN} />
      </svg>
    </button>
  )
}
