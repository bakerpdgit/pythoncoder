interface Props {
  isEditing: boolean
  bookName: string | null
  folderConnected: boolean
  isVerifying?: boolean
  onNewBook: () => void
  onOpenZip: () => void
  onConnectFolder: () => void
  onExportZip: () => void
  onReloadFolder: () => void
  onCloseBook: () => void
  onOpenJsonEditor: () => void
  onVerifyAll: () => void
}

function BigButton({ title, desc, onClick, icon }: { title: string; desc: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-start gap-2.5 text-left p-2.5 rounded border border-slate-600 bg-slate-900/50 hover:border-sky-500 hover:bg-slate-900 transition-colors w-full">
      <svg className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {icon}
      </svg>
      <span className="flex-1 min-w-0">
        <span className="block text-slate-100 font-semibold text-xs">{title}</span>
        <span className="block text-slate-400 text-[10px] leading-snug mt-0.5">{desc}</span>
      </span>
    </button>
  )
}

// Teacher Tools — the control surface for authoring learning books. Editing
// affordances live in the Book panel (exercise list + guide), the code editor
// (starter/solution tabs) and the console (test cases); this panel is where a
// teacher creates/opens/exports a book and reaches the advanced JSON editor.
export function TeacherToolsPanel({
  isEditing, bookName, folderConnected, isVerifying,
  onNewBook, onOpenZip, onConnectFolder, onExportZip, onReloadFolder,
  onCloseBook, onOpenJsonEditor, onVerifyAll,
}: Props) {
  return (
    <div className="flex flex-col overflow-hidden text-xs select-none">
      <div className="bg-slate-900 py-1.5 px-3 border-b border-slate-700 flex-shrink-0 flex items-center gap-2">
        <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l6.16-3.42A12 12 0 0112 21a12 12 0 01-6.16-10.42L12 14z" />
        </svg>
        <span className="font-bold uppercase tracking-wider text-slate-300 text-[11px]">Teacher Tools</span>
      </div>

      <div className="overflow-y-auto p-3 space-y-2">
        {!isEditing ? (
          <>
            <p className="text-slate-500 text-[11px] leading-relaxed mb-1">
              Author a learning book: exercises, tests, guides and files. Nothing here is visible to students.
            </p>
            <BigButton title="New book" desc="Start a fresh book with one example exercise."
              onClick={onNewBook}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />} />
            <BigButton title="Open a ZIP" desc="Edit an existing learning book from a .zip on your computer."
              onClick={onOpenZip}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M10 12h4" />} />
            <BigButton title="Connect a local folder" desc="Two-way sync: edits save straight back to the folder on disk."
              onClick={onConnectFolder}
              icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2zM12 11v6m-3-3l3 3 3-3" />} />
          </>
        ) : (
          <>
            <div className="rounded border border-emerald-600/40 bg-emerald-500/10 px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <span className="text-emerald-300 font-semibold text-[11px] truncate" title={bookName ?? ''}>
                  Editing: {bookName ?? 'book'}
                </span>
              </div>
              <div className="text-slate-400 text-[10px] mt-1 leading-snug">
                {folderConnected
                  ? 'Connected to a local folder — changes save to disk.'
                  : 'Changes are held in the browser. Export a ZIP to keep them.'}
              </div>
            </div>

            <button type="button" onClick={onOpenJsonEditor}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded border border-slate-600 text-slate-300 hover:border-sky-500 hover:text-sky-300 transition-colors">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              Advanced book.json editor
            </button>

            <button type="button" onClick={onVerifyAll} disabled={isVerifying}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded border border-slate-600 text-slate-300 hover:border-emerald-500 hover:text-emerald-300 disabled:opacity-50 transition-colors">
              {isVerifying ? (
                <svg className="w-3.5 h-3.5 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {isVerifying ? 'Verifying…' : 'Verify all solutions'}
            </button>

            <button type="button" onClick={onExportZip}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded border border-slate-600 text-slate-300 hover:border-sky-500 hover:text-sky-300 transition-colors">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export as ZIP
            </button>

            {folderConnected && (
              <button type="button" onClick={onReloadFolder}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded border border-slate-600 text-slate-300 hover:border-amber-500 hover:text-amber-300 transition-colors">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reload from folder
              </button>
            )}

            <div className="border-t border-slate-700 my-1" />
            <button type="button" onClick={onCloseBook}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded border border-slate-600 text-slate-300 hover:border-red-500 hover:text-red-300 transition-colors">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Close book
            </button>
          </>
        )}
      </div>
    </div>
  )
}
