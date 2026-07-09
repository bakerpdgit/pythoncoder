import { useState } from 'react'
import { buildShareLink } from '../../utils/bookSource'

// Shared building blocks for the "open from the web" wizards (GitHub / Google
// Drive / other public URL). Styling mirrors the app's other modal dialogs
// (dark slate defaults, remapped by the light-theme overrides in index.css).

export interface WizardProps {
  onBack: () => void
  onOpen: (url: string) => void
}

export const inputClass =
  'w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-sky-400'

export const primaryBtnClass =
  'px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold disabled:opacity-50 transition-colors'

export const secondaryBtnClass =
  'px-3 py-1.5 rounded border border-slate-600 text-slate-300 hover:border-slate-400 disabled:opacity-50 transition-colors'

/** A copyable "student link" row: the shareable ?book= URL + a Copy button. */
export function ShareLinkRow({ resourceUrl }: { resourceUrl: string }) {
  const [copied, setCopied] = useState(false)
  const link = buildShareLink(resourceUrl)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — the text is still selectable below */ }
  }
  return (
    <div className="mt-3 rounded border border-slate-700 bg-slate-900/60 p-2">
      <div className="text-[11px] text-slate-400 mb-1">
        Student link — opens this book directly:
      </div>
      <div className="flex items-center gap-2">
        <input readOnly value={link} onFocus={e => e.currentTarget.select()}
          className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-300 focus:outline-none" />
        <button type="button" onClick={() => void copy()}
          className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-[11px] flex-shrink-0 transition-colors">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

/** Standard footer: Back, optional busy spinner, and the primary Open button. */
export function WizardFooter({
  onBack, onOpen, openLabel = 'Open', openDisabled, busy,
}: {
  onBack: () => void
  onOpen: () => void
  openLabel?: string
  openDisabled?: boolean
  busy?: boolean
}) {
  return (
    <div className="flex justify-between items-center gap-2 mt-4">
      <button type="button" onClick={onBack} className={secondaryBtnClass}>Back</button>
      <button type="button" onClick={onOpen} disabled={openDisabled || busy}
        className={`${primaryBtnClass} flex items-center gap-2`}>
        {busy && (
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
        {openLabel}
      </button>
    </div>
  )
}

export function WizardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-3">
      <div className="text-sm font-bold text-white mb-1">{title}</div>
      <p className="text-slate-400 leading-relaxed">{subtitle}</p>
    </div>
  )
}
