import { useState, useEffect } from 'react'
import { listChildren, createEntry, getEntryByPath } from '../../utils/virtualFS'
import type { VFSEntry } from '../../types'

interface Props {
  fsId: string
  initialPath?: string
  initialName?: string
  title?: string
  onSave: (parentPath: string, filename: string) => void
  onCancel: () => void
}

export function SaveFileDialog({ fsId, initialPath = '/', initialName = '', title = 'Save File', onSave, onCancel }: Props) {
  const [currentPath, setCurrentPath] = useState(initialPath === '/' ? '/' : initialPath)
  const [entries, setEntries] = useState<VFSEntry[]>([])
  const [filename, setFilename] = useState(initialName)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listChildren(fsId, currentPath).then(children => {
      setEntries(children.filter(e => e.type === 'folder').sort((a, b) => a.name.localeCompare(b.name)))
    }).catch(() => setEntries([]))
  }, [fsId, currentPath])

  const breadcrumbs = (() => {
    if (currentPath === '/') return [{ label: 'Root', path: '/' }]
    const parts = currentPath.split('/').filter(Boolean)
    const crumbs = [{ label: 'Root', path: '/' }]
    let acc = ''
    for (const p of parts) { acc += '/' + p; crumbs.push({ label: p, path: acc }) }
    return crumbs
  })()

  const handleSave = async () => {
    if (!filename.trim()) { setError('Please enter a filename.'); return }
    const existing = await getEntryByPath(fsId, currentPath === '/' ? `/${filename.trim()}` : `${currentPath}/${filename.trim()}`)
    if (existing && existing.type === 'folder') { setError('A folder with that name exists.'); return }
    setError('')
    onSave(currentPath, filename.trim())
  }

  const handleNewFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await createEntry(fsId, currentPath, newFolderName.trim(), 'folder')
      setNewFolderName(''); setShowNewFolder(false)
      const children = await listChildren(fsId, currentPath)
      setEntries(children.filter(e => e.type === 'folder').sort((a, b) => a.name.localeCompare(b.name)))
    } catch { setError('Could not create folder.') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-full max-w-md mx-4 flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <span className="font-semibold text-slate-200 text-sm">{title}</span>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-200 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="px-4 py-2 border-b border-slate-700 flex items-center gap-1 flex-wrap text-xs text-slate-400">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-1">
              {i > 0 && <span>/</span>}
              <button onClick={() => setCurrentPath(crumb.path)}
                className={`hover:text-slate-200 transition-colors ${i === breadcrumbs.length - 1 ? 'text-slate-200 font-semibold' : 'hover:underline'}`}>
                {crumb.label}
              </button>
            </span>
          ))}
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto min-h-0 px-2 py-2">
          {entries.length === 0 ? (
            <div className="text-slate-500 text-xs px-2 py-4 text-center">No subfolders</div>
          ) : (
            entries.map(entry => (
              <button key={entry.id} onDoubleClick={() => setCurrentPath(entry.path)}
                className="w-full text-left px-3 py-2 rounded text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors">
                <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z" />
                </svg>
                {entry.name}
              </button>
            ))
          )}
        </div>

        {/* New folder */}
        {showNewFolder ? (
          <div className="px-4 py-2 border-t border-slate-700 flex gap-2">
            <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleNewFolder(); if (e.key === 'Escape') setShowNewFolder(false) }}
              className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-400"
              placeholder="Folder name..." />
            <button onClick={() => void handleNewFolder()}
              className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded font-semibold transition-colors">Create</button>
            <button onClick={() => setShowNewFolder(false)}
              className="px-3 py-1 border border-slate-600 text-slate-300 text-xs rounded hover:bg-slate-700 transition-colors">Cancel</button>
          </div>
        ) : (
          <div className="px-4 py-2 border-t border-slate-700">
            <button onClick={() => setShowNewFolder(true)}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              New folder
            </button>
          </div>
        )}

        {/* Filename + actions */}
        <div className="px-4 py-4 border-t border-slate-700 flex flex-col gap-3">
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2 items-center">
            <label className="text-xs text-slate-400 flex-shrink-0">Filename:</label>
            <input value={filename} onChange={e => setFilename(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleSave() }}
              className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
              placeholder="filename.py" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={onCancel}
              className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition-colors">
              Cancel
            </button>
            <button onClick={() => void handleSave()}
              className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
