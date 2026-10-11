import { useState } from 'react'
import { ResourceFinder, type FoundResource } from './ResourceFinder'
import { BigButton, primaryBtnClass, secondaryBtnClass } from './webWizardShared'

interface Props {
  onClose: () => void
  onOpenLocalZip: () => void
  onConnectFolder: () => void
  onOpenResourceUrl: (url: string) => void
}

// Open something into the File System panel: a ZIP or a folder from this
// computer, or a repository, folder, ZIP or file from the web.
//
// Nothing asks what it is. A book.json makes it a learning book, a 01.py a
// simple learning book, and anything else opens as plain files.
export function OpenResourceDialog({ onClose, onOpenLocalZip, onConnectFolder, onOpenResourceUrl }: Props) {
  const [view, setView] = useState<'hub' | 'web'>('hub')
  const [found, setFound] = useState<FoundResource | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Open a source"
        className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-5 w-[480px] max-w-[95vw] max-h-[92vh] overflow-y-auto text-xs"
        onClick={e => e.stopPropagation()}>
        {view === 'hub' && (
          <>
            <div className="text-sm font-bold text-white mb-1">Open a source</div>
            <p className="text-slate-400 mb-3 leading-relaxed">
              A learning book opens as a book (it has a <code className="font-mono">book.json</code>, or numbered
              exercises from <code className="font-mono">01.py</code>); anything else opens as files.
            </p>
            <div className="flex flex-col gap-2">
              <BigButton
                title="Open a local ZIP file"
                desc="Import a ZIP from your computer."
                icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M10 12h4" />}
                onClick={() => { onOpenLocalZip(); onClose() }} />
              <BigButton
                title="Connect a local folder"
                desc="Two-way sync with a folder on your disk."
                icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2zM12 11v6m-3-3l3 3 3-3" />}
                onClick={() => { onConnectFolder(); onClose() }} />
              <BigButton
                title="Open from the web"
                desc="A GitHub repository, folder or ZIP, a Google Drive file, or any public address."
                icon={<><circle cx="12" cy="12" r="9" strokeWidth="2" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></>}
                onClick={() => setView('web')} />
            </div>
            <div className="flex justify-end mt-4">
              <button type="button" onClick={onClose} className={secondaryBtnClass}>Cancel</button>
            </div>
          </>
        )}

        {view === 'web' && (
          <>
            <div className="text-sm font-bold text-white mb-1">Open from the web</div>
            <p className="text-slate-400 mb-3 leading-relaxed">Where is it?</p>
            <ResourceFinder selected={found} onSelect={setFound} />
            <div className="flex justify-between items-center gap-2 mt-4">
              <button type="button" onClick={() => { setView('hub'); setFound(null) }} className={secondaryBtnClass}>Back</button>
              <button type="button" disabled={!found} className={primaryBtnClass}
                onClick={() => { if (found) { onOpenResourceUrl(found.url); onClose() } }}>
                Open
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
