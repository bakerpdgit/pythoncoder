import { useEffect, useRef, useState } from 'react'
import {
  listFilesystems, listChildren, getEntryByPath, createEntry, copyEntry, copiesIntoItself,
  getParentPath, joinVfsPath, type PlannedCopy,
} from '../../utils/virtualFS'
import { BOOK_FS_PREFIX, BOOK_SRC_PREFIX, getBookFsDisplayName } from '../../utils/bookLoader'
import { filesystemLabel } from '../../utils/filesystemNames'
import type { VFSEntry, VFSFilesystem } from '../../types'

interface Props {
  /** The filesystem the entry is in — the one the File System panel shows. */
  sourceFsId: string
  /** What to copy: one entry, or several siblings selected together. */
  entries: VFSEntry[]
  /** Paths the panel hides in the source filesystem (a book activity's hidden files). */
  hiddenPaths?: string[]
  onCopied: (dstFsId: string, dstPath: string, written: PlannedCopy[]) => void
  onCancel: () => void
}

/** What a filesystem is called here: the student's own by name, a book's by where it belongs. */
function destinationLabel(fs: VFSFilesystem, sourceFsId: string): string {
  if (fs.name.startsWith(BOOK_FS_PREFIX)) return `${getBookFsDisplayName(fs.name)} (this activity)`
  if (fs.name.startsWith(BOOK_SRC_PREFIX)) return 'This book (being edited)'
  const label = filesystemLabel(fs)
  return fs.id === sourceFsId ? `${label} (this filesystem)` : label
}

/**
 * Copy to…: choose a filesystem, browse to a folder in it, and name the copy.
 * A name already taken there is refused with the chance to change it, never
 * overwritten. Several entries keep their own names, and are refused together
 * if any of them is taken.
 */
export function CopyToDialog({ sourceFsId, entries, hiddenPaths, onCopied, onCancel }: Props) {
  const entry = entries[0]
  const single = entries.length === 1
  const title = single ? entry.name : `${entries.length} items`
  const [filesystems, setFilesystems] = useState<VFSFilesystem[]>([])
  const [fsId, setFsId] = useState(sourceFsId)
  const [currentPath, setCurrentPath] = useState(getParentPath(entry.path))
  const [children, setChildren] = useState<VFSEntry[]>([])
  const [name, setName] = useState(entry.name)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const kind = entry.type === 'folder' ? 'folder' : 'file'

  useEffect(() => {
    listFilesystems().then(all => {
      // The student's own filesystems, plus the one being browsed even when it
      // is a book's (copying an activity's file into it is still a copy).
      const shown = all.filter(f => f.id === sourceFsId
        || (!f.name.startsWith(BOOK_FS_PREFIX) && !f.name.startsWith(BOOK_SRC_PREFIX)))
      setFilesystems(shown.sort((a, b) =>
        (a.id === sourceFsId ? -1 : b.id === sourceFsId ? 1 : 0) || a.createdAt - b.createdAt))
    }).catch(() => setFilesystems([]))
  }, [sourceFsId])

  // By value: the panel hands over a fresh array on every render.
  const hiddenKey = (hiddenPaths ?? []).join('\n')
  useEffect(() => {
    let current = true
    listChildren(fsId, currentPath).then(list => {
      if (!current) return
      const hidden = new Set(fsId === sourceFsId && hiddenKey ? hiddenKey.split('\n') : [])
      setChildren(list.filter(e => !hidden.has(e.path)).sort((a, b) =>
        a.type !== b.type ? (a.type === 'folder' ? -1 : 1) : a.name.localeCompare(b.name)))
    }).catch(() => { if (current) setChildren([]) })
    return () => { current = false }
  }, [fsId, currentPath, sourceFsId, hiddenKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  const chooseFilesystem = (id: string) => {
    setFsId(id); setCurrentPath('/'); setError(''); setShowNewFolder(false)
  }
  const goTo = (path: string) => { setCurrentPath(path); setError(''); setShowNewFolder(false) }

  const fsName = (id: string) => {
    const fs = filesystems.find(f => f.id === id)
    return fs ? destinationLabel(fs, sourceFsId) : id
  }
  const folderLabel = currentPath === '/' ? 'Root' : currentPath

  const breadcrumbs = (() => {
    const crumbs = [{ label: 'Root', path: '/' }]
    let acc = ''
    for (const part of currentPath.split('/').filter(Boolean)) { acc += '/' + part; crumbs.push({ label: part, path: acc }) }
    return crumbs
  })()

  /** Put the cursor on the name, its stem selected, so a new name can just be typed. */
  const focusName = () => {
    requestAnimationFrame(() => {
      const input = nameInputRef.current
      if (!input) return
      input.focus()
      const dot = kind === 'file' ? input.value.lastIndexOf('.') : -1
      input.setSelectionRange(0, dot > 0 ? dot : input.value.length)
    })
  }

  const handleCopyMany = async () => {
    if (fsId === sourceFsId) {
      const intoItself = entries.find(e => e.type === 'folder'
        && (joinVfsPath(currentPath, e.name) === e.path || copiesIntoItself(e.path, joinVfsPath(currentPath, e.name))))
      if (intoItself) {
        setError(`The folder "${intoItself.name}" cannot be copied into itself. Choose another folder.`)
        return
      }
    }
    setBusy(true)
    try {
      const taken: string[] = []
      for (const e of entries) {
        if (await getEntryByPath(fsId, joinVfsPath(currentPath, e.name))) taken.push(e.name)
      }
      if (taken.length) {
        const names = taken.slice(0, 4).map(n => `"${n}"`).join(', ') + (taken.length > 4 ? `, and ${taken.length - 4} more` : '')
        setError(`${names} already ${taken.length === 1 ? 'exists' : 'exist'} in ${folderLabel} of ${fsName(fsId)}. `
          + 'Nothing was copied. Choose another folder, or make a new one.')
        return
      }
      const written: PlannedCopy[] = []
      for (const e of entries) written.push(...await copyEntry(sourceFsId, e.path, fsId, joinVfsPath(currentPath, e.name)))
      onCopied(fsId, currentPath, written)
    } catch (err) {
      setError(`Could not copy: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async () => {
    if (!single) { await handleCopyMany(); return }
    const trimmed = name.trim()
    if (!trimmed) { setError(`Give the copy a name.`); focusName(); return }
    if (trimmed.includes('/')) { setError('A name cannot contain "/".'); focusName(); return }
    const dstPath = joinVfsPath(currentPath, trimmed)
    if (fsId === sourceFsId && entry.type === 'folder' && (dstPath === entry.path || copiesIntoItself(entry.path, dstPath))) {
      setError('A folder cannot be copied into itself. Choose another folder.')
      return
    }
    setBusy(true)
    try {
      const existing = await getEntryByPath(fsId, dstPath)
      if (existing) {
        setError(`A ${existing.type} named "${trimmed}" already exists in ${folderLabel} of ${fsName(fsId)}. `
          + 'Change the name of the copy and try again, or Cancel.')
        focusName()
        return
      }
      const written = await copyEntry(sourceFsId, entry.path, fsId, dstPath)
      onCopied(fsId, dstPath, written)
    } catch (err) {
      setError(`Could not copy: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const handleNewFolder = async () => {
    const folder = newFolderName.trim()
    if (!folder) return
    if (folder.includes('/')) { setError('A folder name cannot contain "/".'); return }
    try {
      if (await getEntryByPath(fsId, joinVfsPath(currentPath, folder))) {
        setError(`Something named "${folder}" already exists here.`)
        return
      }
      await createEntry(fsId, currentPath, folder, 'folder')
      setNewFolderName(''); setShowNewFolder(false); setError('')
      goTo(joinVfsPath(currentPath, folder))
    } catch { setError('Could not create the folder.') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={e => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <div role="dialog" aria-modal="true" aria-label={`Copy ${title} to`}
        className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-full max-w-md mx-4 flex flex-col"
        style={{ maxHeight: '80vh' }}>
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between gap-3">
          <span className="font-semibold text-slate-200 text-sm truncate">Copy {single ? `“${title}”` : title} to…</span>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-slate-400 hover:text-slate-200 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Which filesystem */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-2">
          <label htmlFor="copy-to-fs" className="text-xs text-slate-400 flex-shrink-0">Filesystem:</label>
          <select id="copy-to-fs" value={fsId} onChange={e => chooseFilesystem(e.target.value)}
            className="flex-1 min-w-0 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-400">
            {filesystems.length === 0 && <option value={sourceFsId}>…</option>}
            {filesystems.map(fs => <option key={fs.id} value={fs.id}>{destinationLabel(fs, sourceFsId)}</option>)}
          </select>
        </div>

        {/* Where in it */}
        <div className="px-4 py-2 border-y border-slate-700 flex items-center gap-1 flex-wrap text-xs text-slate-400" aria-label="Folder">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-1">
              {i > 0 && <span>/</span>}
              <button type="button" onClick={() => goTo(crumb.path)}
                className={`hover:text-slate-200 transition-colors ${i === breadcrumbs.length - 1 ? 'text-slate-200 font-semibold' : 'hover:underline'}`}>
                {crumb.label}
              </button>
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-[8rem] px-2 py-2" data-testid="copy-to-listing">
          {currentPath !== '/' && (
            <button type="button" onClick={() => goTo(getParentPath(currentPath))}
              className="w-full text-left px-3 py-1.5 rounded text-sm text-slate-400 hover:bg-slate-700 flex items-center gap-2 transition-colors">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
              </svg>
              Up one folder
            </button>
          )}
          {children.length === 0 ? (
            <div className="text-slate-500 text-xs px-2 py-4 text-center">This folder is empty</div>
          ) : children.map(child => child.type === 'folder' ? (
            <button type="button" key={child.id} onClick={() => goTo(child.path)} title={`Open ${child.name}`}
              className="w-full text-left px-3 py-1.5 rounded text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2 transition-colors">
              <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z" />
              </svg>
              <span className="truncate">{child.name}</span>
            </button>
          ) : (
            // Files are shown so the student can see what names are taken, not chosen.
            <div key={child.id} className="px-3 py-1.5 text-sm text-slate-500 flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="truncate">{child.name}</span>
            </div>
          ))}
        </div>

        {showNewFolder ? (
          <div className="px-4 py-2 border-t border-slate-700 flex gap-2">
            <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleNewFolder(); if (e.key === 'Escape') { e.stopPropagation(); setShowNewFolder(false) } }}
              className="flex-1 min-w-0 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-400"
              placeholder="Folder name..." />
            <button type="button" onClick={() => void handleNewFolder()}
              className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded font-semibold transition-colors">Create</button>
            <button type="button" onClick={() => setShowNewFolder(false)}
              className="px-3 py-1 border border-slate-600 text-slate-300 text-xs rounded hover:bg-slate-700 transition-colors">Cancel</button>
          </div>
        ) : (
          <div className="px-4 py-2 border-t border-slate-700">
            <button type="button" onClick={() => setShowNewFolder(true)}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              New folder here
            </button>
          </div>
        )}

        <div className="px-4 py-4 border-t border-slate-700 flex flex-col gap-3">
          {error && <p role="alert" className="text-red-400 text-xs">{error}</p>}
          {single ? (
            <>
              <div className="flex gap-2 items-center">
                <label htmlFor="copy-to-name" className="text-xs text-slate-400 flex-shrink-0">Name of copy:</label>
                <input id="copy-to-name" ref={nameInputRef} value={name}
                  onChange={e => { setName(e.target.value); setError('') }}
                  onKeyDown={e => { if (e.key === 'Enter' && !busy) void handleCopy() }}
                  className="flex-1 min-w-0 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-400" />
              </div>
              <p className="text-[11px] text-slate-500 truncate" title={`${fsName(fsId)} › ${joinVfsPath(currentPath, name.trim() || '…')}`}>
                Copying to {fsName(fsId)} › {joinVfsPath(currentPath, name.trim() || '…')}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-slate-500" title={entries.map(e => e.name).join('\n')}>
              Copying {entries.map(e => e.name).slice(0, 3).join(', ')}{entries.length > 3 ? ` and ${entries.length - 3} more` : ''} to {fsName(fsId)} › {folderLabel}, keeping their names.
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onCancel} disabled={busy}
              className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={() => void handleCopy()} disabled={busy}
              className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-semibold transition-colors">
              {busy ? 'Copying…' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
