import type { Theme } from '../../types'

interface Props {
  theme: Theme
  onToggle: () => void
}

export const ThemeToggleButton = ({ theme, onToggle }: Props) => (
  <button
    type="button"
    onClick={onToggle}
    className="flex items-center gap-2 rounded border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-emerald-400"
    title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
  >
    {theme === 'dark' ? (
      <svg className="h-4 w-4 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v2.25M12 18.75V21M4.72 4.72l1.59 1.59M17.69 17.69l1.59 1.59M3 12h2.25M18.75 12H21M4.72 19.28l1.59-1.59M17.69 6.31l1.59-1.59M15.75 12A3.75 3.75 0 1112 8.25 3.75 3.75 0 0115.75 12z" />
      </svg>
    ) : (
      <svg className="h-4 w-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12.79A9 9 0 1111.21 3c-.02.27-.03.54-.03.81A9 9 0 0021 12.79z" />
      </svg>
    )}
    {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
  </button>
)
