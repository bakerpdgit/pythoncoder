import { useState } from 'react'
import { GitHubBookWizard } from './GitHubBookWizard'
import { GoogleDriveWizard } from './GoogleDriveWizard'
import { PublicUrlWizard } from './PublicUrlWizard'

interface Props {
  onClose: () => void
  onOpenLocalZip: () => void
  onConnectFolder: () => void
  onOpenResourceUrl: (url: string) => void
}

type View = 'hub' | 'web' | 'github' | 'drive' | 'other'

// Hub dialog for opening a new source into the filesystem panel: a local ZIP, a
// connected local folder, or a book from the web (GitHub / Google Drive / any
// public URL). The web choices open per-source wizards (Part 4).
export function OpenResourceDialog({ onClose, onOpenLocalZip, onConnectFolder, onOpenResourceUrl }: Props) {
  const [view, setView] = useState<View>('hub')

  const open = (url: string) => { onOpenResourceUrl(url); onClose() }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-5 w-[480px] max-w-[95vw] text-xs"
        onClick={e => e.stopPropagation()}>
        {view === 'hub' && (
          <>
            <div className="text-sm font-bold text-white mb-3">Open a source</div>
            <div className="flex flex-col gap-2">
              <BigButton
                title="Open a local ZIP file"
                desc="Import a ZIP from your computer as a filesystem or a learning book."
                icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M10 12h4" />}
                onClick={() => { onOpenLocalZip(); onClose() }} />
              <BigButton
                title="Connect a local folder"
                desc="Two-way sync with a folder on your disk, or open a learning book from it."
                icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2zM12 11v6m-3-3l3 3 3-3" />}
                onClick={() => { onConnectFolder(); onClose() }} />
              <BigButton
                title="Open from the web"
                desc="Load a learning book from GitHub, Google Drive, or any public URL."
                icon={<><circle cx="12" cy="12" r="9" strokeWidth="2" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></>}
                onClick={() => setView('web')} />
            </div>
            <div className="flex justify-end mt-4">
              <button type="button" onClick={onClose}
                className="px-3 py-1.5 rounded border border-slate-600 text-slate-300 hover:border-slate-400 transition-colors">
                Cancel
              </button>
            </div>
          </>
        )}

        {view === 'web' && (
          <>
            <div className="text-sm font-bold text-white mb-1">Open from the web</div>
            <p className="text-slate-400 mb-3 leading-relaxed">Where is the learning book hosted?</p>
            <div className="flex flex-col gap-2">
              <BigButton title="GitHub public repo"
                desc="Book ZIP or book.json. Fetched directly from GitHub — no caching delay."
                icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16M6 16l-4-4 4-4M18 8l4 4-4 4" />}
                onClick={() => setView('github')} />
              <BigButton title="Google Drive share link"
                desc="A book ZIP shared as “Anyone with the link”."
                icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 3h8l5 9-4 7H7l-4-7 5-9zM3.5 12h17M8 3l4 9-4 7M16 3l-4 9 4 7" />}
                onClick={() => setView('drive')} />
              <BigButton title="Other public URL"
                desc="A book ZIP or book.json on any public host (fetched via proxy)."
                icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.5 6.5l1-1a4 4 0 015.66 5.66l-2.5 2.5a4 4 0 01-5.66 0M10.5 17.5l-1 1a4 4 0 01-5.66-5.66l2.5-2.5a4 4 0 015.66 0" />}
                onClick={() => setView('other')} />
            </div>
            <div className="flex justify-start mt-4">
              <button type="button" onClick={() => setView('hub')}
                className="px-3 py-1.5 rounded border border-slate-600 text-slate-300 hover:border-slate-400 transition-colors">
                Back
              </button>
            </div>
          </>
        )}

        {view === 'github' && <GitHubBookWizard onBack={() => setView('web')} onOpen={open} />}
        {view === 'drive' && <GoogleDriveWizard onBack={() => setView('web')} onOpen={open} />}
        {view === 'other' && <PublicUrlWizard onBack={() => setView('web')} onOpen={open} />}
      </div>
    </div>
  )
}

function BigButton({ title, desc, icon, onClick }: { title: string; desc: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-start gap-3 text-left p-3 rounded border border-slate-600 bg-slate-900/50 hover:border-sky-500 hover:bg-slate-900 transition-colors">
      <svg className="w-6 h-6 text-sky-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {icon}
      </svg>
      <span className="flex-1 min-w-0">
        <span className="block text-slate-100 font-semibold text-sm">{title}</span>
        <span className="block text-slate-400 text-[11px] leading-snug mt-0.5">{desc}</span>
      </span>
    </button>
  )
}
