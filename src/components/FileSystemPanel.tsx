import { useState, useEffect, useRef, useCallback } from 'react'
import {
  listChildren, listFilesystems, createFilesystem, deleteFilesystem, renameFilesystem,
  createEntry, deleteEntry, renameEntry, getEntryByPath, guessMimeType,
  isTextMime, isImageMime, downloadEntryAsZip, downloadSingleFile, writeFile,
  getParentPath, loadFilesystemFromUrl,
} from '../utils/virtualFS'
import { isBookUrl, BOOK_FS_PREFIX, BOOK_SRC_PREFIX, getBookFsDisplayName } from '../utils/bookLoader'
import { isHtmlFile } from '../utils/htmlPreview'
import { ConfirmDialog } from './dialogs/ConfirmDialog'
import { SaveFileDialog } from './dialogs/SaveFileDialog'
import type { VFSEntry, VFSFilesystem } from '../types'

interface Props {
  activeFilesystemId: string
  currentWorkingDir: string
  openFilePath: string | null
  hiddenPaths?: string[]
  isChallengeMode?: boolean
  onFilesystemChange: (id: string) => void
  onFilesystemForcedChange: (id: string) => void
  onCwdChange: (path: string) => void
  onOpenFile: (entry: VFSEntry) => void
  onPreviewHtml: (entry: VFSEntry) => void
  onError: (msg: string) => void
  onBookOpen?: (url: string) => void
  onLocalFileImport?: (fileMap: Map<string, ArrayBuffer>, sourceName: string) => Promise<void>
  onFolderConnect?: (handle: FileSystemDirectoryHandle) => Promise<void>
  reloadTrigger: number
}

interface ContextMenu {
  x: number; y: number; entry: VFSEntry
}

interface ImagePreview {
  url: string; name: string
}

export function FileSystemPanel({
  activeFilesystemId, currentWorkingDir, openFilePath, hiddenPaths, isChallengeMode,
  onFilesystemChange, onFilesystemForcedChange, onCwdChange, onOpenFile, onError, onBookOpen,
  onPreviewHtml, onLocalFileImport, onFolderConnect, reloadTrigger,
}: Props) {
  const [filesystems, setFilesystems] = useState<VFSFilesystem[]>([])
  const [currentFsEntry, setCurrentFsEntry] = useState<VFSFilesystem | null>(null)
  const [currentPath, setCurrentPath] = useState('/')
  const [entries, setEntries] = useState<VFSEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmConfig, setConfirmConfig] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [showNewFolderInline, setShowNewFolderInline] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFsDialog, setShowNewFsDialog] = useState(false)
  const [newFsName, setNewFsName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [pendingUpload, setPendingUpload] = useState<{ name: string; content: ArrayBuffer; mimeType: string } | null>(null)
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null)
  const [showFsMenu, setShowFsMenu] = useState(false)
  const [showUrlDialog, setShowUrlDialog] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlError, setUrlError] = useState('')
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const zipInputRef = useRef<HTMLInputElement>(null)
  const fsMenuRef = useRef<HTMLDivElement>(null)

  const reload = useCallback(async () => {
    try {
      const [fsList, children] = await Promise.all([
        listFilesystems(),
        listChildren(activeFilesystemId, currentPath),
      ])
      const activeFsEntry = fsList.find(f => f.id === activeFilesystemId)
      setCurrentFsEntry(activeFsEntry ?? null)
      setFilesystems(fsList.filter(f => !f.name.startsWith(BOOK_FS_PREFIX) && !f.name.startsWith(BOOK_SRC_PREFIX)).sort((a, b) => a.createdAt - b.createdAt))
      const hidden = new Set(hiddenPaths ?? [])
      setEntries(children.filter(e => !hidden.has(e.path)).sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
        return a.name.localeCompare(b.name)
      }))
    } catch { /* ignore */ }
  }, [activeFilesystemId, currentPath, hiddenPaths])

  useEffect(() => { void reload() }, [reload, reloadTrigger])

  useEffect(() => { setCurrentPath('/') }, [activeFilesystemId])

  useEffect(() => {
    if (!showFsMenu) return
    const handler = (e: MouseEvent) => {
      if (!fsMenuRef.current?.contains(e.target as Node)) setShowFsMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFsMenu])

  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [contextMenu])

  const breadcrumbs = (() => {
    if (currentPath === '/') return [{ label: 'Root', path: '/' }]
    const parts = currentPath.split('/').filter(Boolean)
    const crumbs = [{ label: 'Root', path: '/' }]
    let acc = ''
    for (const p of parts) { acc += '/' + p; crumbs.push({ label: p, path: acc }) }
    return crumbs
  })()

  const navigate = (path: string) => { setCurrentPath(path); setSelectedId(null) }

  const handleDoubleClick = async (entry: VFSEntry) => {
    if (entry.type === 'folder') { navigate(entry.path); return }
    const mime = entry.mimeType ?? guessMimeType(entry.name)
    if (isImageMime(mime)) {
      if (entry.content) {
        const blob = new Blob([entry.content], { type: mime })
        const url = URL.createObjectURL(blob)
        setImagePreview({ url, name: entry.name })
      }
      return
    }
    if (isTextMime(mime)) { onOpenFile(entry); return }
    onError(`Cannot render '${entry.name}' in the editor. Download it to view.`)
  }

  const handleContextMenu = (e: React.MouseEvent, entry: VFSEntry) => {
    e.preventDefault(); e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, entry })
  }

  const isProtected = (entry: VFSEntry) =>
    activeFilesystemId === 'default' && entry.path === '/main.py'

  const canPreviewHtml = (entry: VFSEntry) =>
    entry.type === 'file' && isHtmlFile(entry.name, entry.mimeType ?? guessMimeType(entry.name))

  const startRename = (entry: VFSEntry) => {
    if (isProtected(entry)) { onError('main.py cannot be renamed in the default filesystem.'); setContextMenu(null); return }
    setRenameId(entry.id); setRenameValue(entry.name); setContextMenu(null)
  }

  const commitRename = async (entry: VFSEntry) => {
    if (!renameValue.trim() || renameValue === entry.name) { setRenameId(null); return }
    try {
      await renameEntry(activeFilesystemId, entry.path, renameValue.trim())
      setRenameId(null); void reload()
    } catch (err) { onError(String(err)); setRenameId(null) }
  }

  const handleDelete = (entry: VFSEntry) => {
    setContextMenu(null)
    if (isProtected(entry)) { onError('main.py cannot be deleted from the default filesystem.'); return }
    if (entry.path === openFilePath) { onError('Cannot delete the currently open file.'); return }
    setConfirmConfig({
      message: `Delete "${entry.name}"${entry.type === 'folder' ? ' and all its contents' : ''}?`,
      onConfirm: async () => {
        try { await deleteEntry(activeFilesystemId, entry.path); void reload() }
        catch (err) { onError(String(err)) }
        setConfirmConfig(null)
      },
    })
  }

  const handleDownload = async (entry: VFSEntry) => {
    setContextMenu(null)
    if (entry.type === 'folder') {
      await downloadEntryAsZip(activeFilesystemId, entry.path, entry.name)
    } else if (entry.content) {
      downloadSingleFile(entry.content, entry.name, entry.mimeType ?? guessMimeType(entry.name))
    }
  }

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result as ArrayBuffer
      const mime = file.type || guessMimeType(file.name)
      setPendingUpload({ name: file.name, content, mimeType: mime })
      setShowSaveDialog(true)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const handleSaveDialogSave = async (parentPath: string, filename: string) => {
    if (!pendingUpload) return
    try {
      const path = parentPath === '/' ? `/${filename}` : `${parentPath}/${filename}`
      const existing = await getEntryByPath(activeFilesystemId, path)
      if (existing) {
        await writeFile(activeFilesystemId, path, pendingUpload.content, pendingUpload.mimeType)
      } else {
        await createEntry(activeFilesystemId, parentPath, filename, 'file', pendingUpload.content, pendingUpload.mimeType)
      }
      setPendingUpload(null); setShowSaveDialog(false)
      setCurrentPath(parentPath); void reload()
    } catch (err) { onError(String(err)) }
  }

  const handleNewFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await createEntry(activeFilesystemId, currentPath, newFolderName.trim(), 'folder')
      setNewFolderName(''); setShowNewFolderInline(false); void reload()
    } catch (err) { onError(String(err)) }
  }

  const handleNewFile = () => {
    setPendingUpload({ name: 'new_file.py', content: new ArrayBuffer(0), mimeType: 'text/x-python' })
    setShowSaveDialog(true)
  }

  const handleCreateFs = async () => {
    if (!newFsName.trim()) return
    try {
      const { id: newFsId } = await createFilesystem(newFsName.trim())
      setNewFsName(''); setShowNewFsDialog(false)
      void reload()
      onFilesystemChange(newFsId)
    } catch (err) { onError(String(err)) }
  }

  const handleDeleteFs = (fs: VFSFilesystem) => {
    if (fs.id === 'default') { onError('Cannot delete the default filesystem.'); return }
    setConfirmConfig({
      message: `Delete filesystem "${fs.name}" and all its files?`,
      onConfirm: async () => {
        try {
          await deleteFilesystem(fs.id)
          if (activeFilesystemId === fs.id) onFilesystemForcedChange('default')
          const fsList = await listFilesystems()
          setFilesystems(fsList.filter(f => !f.name.startsWith(BOOK_FS_PREFIX) && !f.name.startsWith(BOOK_SRC_PREFIX)).sort((a, b) => a.createdAt - b.createdAt))
        } catch (err) { onError(String(err)) }
        setConfirmConfig(null)
      },
    })
  }

  const handleSetCwd = () => {
    onCwdChange(currentPath); setContextMenu(null)
  }

  const handleDownloadFs = async () => {
    const fs = filesystems.find(f => f.id === activeFilesystemId)
    await downloadEntryAsZip(activeFilesystemId, '/', fs?.name ?? 'filesystem')
  }

  const handleLoadFromUrl = async () => {
    const url = urlInput.trim()
    if (!url) return

    // Book.json URL → open as learning book
    if (isBookUrl(url)) {
      setShowUrlDialog(false)
      setUrlInput('')
      onBookOpen?.(url)
      return
    }

    setUrlLoading(true)
    setUrlError('')
    try {
      const fsList = await listFilesystems()
      const existing = fsList.find(f => f.name === url)
      if (existing) {
        if (!window.confirm(`A filesystem for this URL already exists. Overwrite with fresh content from the URL?`)) {
          setUrlLoading(false)
          return
        }
        await deleteFilesystem(existing.id)
      }
      const fsId = await loadFilesystemFromUrl(url)
      setShowUrlDialog(false)
      setUrlInput('')
      const bookEntry = await getEntryByPath(fsId, '/book.json')
      if (bookEntry && onBookOpen) {
        onBookOpen(`vfs://fs:${fsId}/book.json`)
      } else {
        onFilesystemChange(fsId)
      }
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : String(err))
    } finally {
      setUrlLoading(false)
    }
  }

  const handleZipFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { default: JSZip } = await import('jszip')
      const zip = await JSZip.loadAsync(await file.arrayBuffer())
      const allNames = Object.keys(zip.files).filter(n => !zip.files[n].dir && !n.startsWith('__MACOSX'))
      const prefix = (() => {
        if (allNames.length === 0) return ''
        const parts0 = allNames[0].split('/')
        let common = parts0.slice(0, -1).join('/') + (parts0.length > 1 ? '/' : '')
        for (const n of allNames) {
          while (common && !n.startsWith(common)) common = common.slice(0, common.lastIndexOf('/', common.length - 2) + 1)
          if (!common) break
        }
        return common
      })()
      const fileMap = new Map<string, ArrayBuffer>()
      for (const name of allNames) {
        const stripped = prefix ? name.slice(prefix.length) : name
        if (!stripped) continue
        fileMap.set(stripped, await zip.files[name].async('arraybuffer'))
      }
      const zipName = file.name.replace(/\.zip$/i, '')
      await onLocalFileImport?.(fileMap, zipName)
    } catch (err) { onError(err instanceof Error ? err.message : String(err)) }
  }

  const handleFolderOpen = async () => {
    if (!('showDirectoryPicker' in window)) {
      onError('Your browser does not support the File System Access API.')
      return
    }
    try {
      const handle = await (window as typeof window & { showDirectoryPicker: (o?: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: 'readwrite' })
      await onFolderConnect?.(handle)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      onError(err instanceof Error ? err.message : String(err))
    }
  }

  const currentFs = filesystems.find(f => f.id === activeFilesystemId)

  return (
    <div className="flex flex-col h-full overflow-hidden text-xs select-none">
      {/* Filesystem selector / challenge label */}
      <div className="px-2 py-2 border-b border-slate-700 flex items-center gap-1 flex-shrink-0">
        {isChallengeMode ? (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-slate-700 bg-slate-900 text-amber-400 text-xs flex-1 min-w-0">
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="truncate font-medium">
              {currentFsEntry ? getBookFsDisplayName(currentFsEntry.name) : 'Challenge Files'}
            </span>
          </div>
        ) : (
          <div className="relative flex-1" ref={fsMenuRef}>
            <button onClick={() => setShowFsMenu(o => !o)}
              className="w-full flex items-center justify-between gap-1 px-2 py-1.5 rounded border border-slate-600 bg-slate-900 text-slate-300 text-xs hover:border-slate-500 transition-colors">
              <span className="truncate">{currentFs?.name ?? '...'}</span>
              <svg className="w-3 h-3 flex-shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showFsMenu && (
              <div className="absolute top-full left-0 right-0 mt-1 z-40 bg-slate-800 border border-slate-600 rounded shadow-xl">
                {filesystems.map(fs => (
                  <div key={fs.id} className="flex items-center justify-between px-2 py-1.5 hover:bg-slate-700 transition-colors">
                    <button className={`flex-1 text-left truncate ${fs.id === activeFilesystemId ? 'text-emerald-400' : 'text-slate-300'}`}
                      onClick={() => { onFilesystemChange(fs.id); setShowFsMenu(false) }}>
                      {fs.name}
                    </button>
                    {fs.id !== 'default' && (
                      <div className="flex items-center ml-2 flex-shrink-0 gap-1">
                        <button type="button" onClick={() => { void downloadEntryAsZip(fs.id, '/', fs.name) }}
                          title="Download as zip"
                          className="text-slate-500 hover:text-sky-400">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                        <button type="button" onClick={() => { handleDeleteFs(fs); setShowFsMenu(false) }}
                          title="Delete filesystem"
                          className="text-slate-500 hover:text-red-400">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <div className="border-t border-slate-700">
                  {showNewFsDialog ? (
                    <div className="px-2 py-2 flex gap-1">
                      <input autoFocus value={newFsName} onChange={e => setNewFsName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void handleCreateFs(); if (e.key === 'Escape') { setShowNewFsDialog(false); setNewFsName('') } }}
                        className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-400"
                        placeholder="FS name..." />
                      <button onClick={() => void handleCreateFs()} className="px-2 py-1 bg-sky-600 text-white text-xs rounded">OK</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowNewFsDialog(true)}
                      className="w-full text-left px-2 py-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 flex items-center gap-1 transition-colors">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                      New filesystem
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="px-2 py-1 border-b border-slate-700 flex items-center gap-1 flex-shrink-0">
        <input ref={uploadInputRef} type="file" className="hidden" onChange={handleUpload} />
        <input ref={zipInputRef} type="file" accept=".zip" className="hidden" onChange={e => void handleZipFileChange(e)} />
        <ToolbarBtn title="New file" onClick={handleNewFile}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
        </ToolbarBtn>
        <ToolbarBtn title="New folder" onClick={() => { setShowNewFolderInline(true); setNewFolderName('') }}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m4-11H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
          </svg>
        </ToolbarBtn>
        <ToolbarBtn title="Upload file" onClick={() => uploadInputRef.current?.click()}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </ToolbarBtn>
        <ToolbarBtn title="Open local ZIP file (import as filesystem or learning book)" onClick={() => zipInputRef.current?.click()}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 12h4" />
          </svg>
        </ToolbarBtn>
        <ToolbarBtn title="Connect local folder (live filesystem or learning book)" onClick={() => void handleFolderOpen()}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11v6m-3-3l3 3 3-3" />
          </svg>
        </ToolbarBtn>
        <ToolbarBtn title="Open from URL (ZIP or book.json)" onClick={() => { setUrlError(''); setShowUrlDialog(true) }}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth="2" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
          </svg>
        </ToolbarBtn>
        <div className="flex-1" />
        <ToolbarBtn title="Set current folder as working directory" onClick={handleSetCwd}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            <text x="12" y="17" textAnchor="middle" fontSize="7" fill="currentColor" stroke="none" fontFamily="monospace">~</text>
          </svg>
        </ToolbarBtn>
        <ToolbarBtn title="Download filesystem as ZIP" onClick={() => void handleDownloadFs()}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </ToolbarBtn>
      </div>

      {/* Breadcrumb */}
      <div className="px-2 py-1 border-b border-slate-700 flex items-center gap-0.5 overflow-x-auto flex-shrink-0">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.path} className="flex items-center gap-0.5 flex-shrink-0">
            {i > 0 && <span className="text-slate-600">/</span>}
            <button onClick={() => navigate(crumb.path)}
              className={`px-1 py-0.5 rounded hover:bg-slate-700 transition-colors ${i === breadcrumbs.length - 1 ? 'text-slate-200' : 'text-slate-400 hover:text-slate-200'}`}>
              {crumb.label}
            </button>
          </span>
        ))}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto py-1 min-h-0">
        {showNewFolderInline && (
          <div className="flex items-center gap-1 px-2 py-1">
            <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z" />
            </svg>
            <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleNewFolder(); if (e.key === 'Escape') setShowNewFolderInline(false) }}
              onBlur={() => { if (!newFolderName.trim()) setShowNewFolderInline(false) }}
              className="flex-1 bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-400" />
          </div>
        )}
        {entries.length === 0 && !showNewFolderInline ? (
          <div className="text-slate-600 text-center py-6">Empty folder</div>
        ) : (
          entries.map(entry => {
            const isOpen = entry.path === openFilePath
            const isCwd = entry.path === currentWorkingDir && entry.type === 'folder'
            return (
              <div key={entry.id}
                className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer rounded mx-1 transition-colors
                  ${selectedId === entry.id ? 'bg-slate-600' : 'hover:bg-slate-700'}`}
                onClick={() => setSelectedId(entry.id)}
                onDoubleClick={() => void handleDoubleClick(entry)}
                onContextMenu={e => handleContextMenu(e, entry)}>
                {renameId === entry.id ? (
                  <>
                    <EntryIcon entry={entry} />
                    <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void commitRename(entry); if (e.key === 'Escape') setRenameId(null) }}
                      onBlur={() => void commitRename(entry)}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 bg-slate-900 border border-slate-500 rounded px-1 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-sky-400" />
                  </>
                ) : (
                  <>
                    <EntryIcon entry={entry} />
                    <span className={`flex-1 truncate ${isOpen ? 'text-emerald-400' : 'text-slate-300'}`}>{entry.name}</span>
                    {isCwd && <span className="text-[9px] text-sky-400 flex-shrink-0 font-semibold">CWD</span>}
                    {isOpen && <span className="text-[9px] text-emerald-400 flex-shrink-0">open</span>}
                    {entry.type === 'file' && entry.size !== undefined && (
                      <span className="text-slate-600 text-[9px] flex-shrink-0">{formatSize(entry.size)}</span>
                    )}
                  </>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* CWD indicator */}
      <div className="px-2 py-1.5 border-t border-slate-700 flex-shrink-0">
        <div className="text-[10px] text-slate-500 truncate" title={`CWD: ${currentWorkingDir}`}>
          <span className="text-slate-600">CWD: </span>
          <span className="text-sky-500">{currentWorkingDir}</span>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div className="fixed z-50 bg-slate-800 border border-slate-600 rounded shadow-2xl py-1 text-xs min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={e => e.stopPropagation()}>
          {contextMenu.entry.type === 'file' && (
            <CtxItem label="Open" onClick={() => { void handleDoubleClick(contextMenu.entry); setContextMenu(null) }} />
          )}
          {canPreviewHtml(contextMenu.entry) && (
            <CtxItem label="Preview HTML" onClick={() => { onPreviewHtml(contextMenu.entry); setContextMenu(null) }} />
          )}
          <CtxItem label="Rename" onClick={() => startRename(contextMenu.entry)} disabled={isProtected(contextMenu.entry)} />
          <CtxItem label="Download" onClick={() => void handleDownload(contextMenu.entry)} />
          {contextMenu.entry.type === 'folder' && (
            <CtxItem label="Download as ZIP" onClick={() => void handleDownload(contextMenu.entry)} />
          )}
          <CtxItem label="Set as CWD" onClick={() => { if (contextMenu.entry.type === 'folder') { onCwdChange(contextMenu.entry.path) } setContextMenu(null) }}
            disabled={contextMenu.entry.type !== 'folder'} />
          <div className="border-t border-slate-700 my-1" />
          <CtxItem label="Delete" onClick={() => handleDelete(contextMenu.entry)} danger disabled={isProtected(contextMenu.entry)} />
        </div>
      )}

      {/* Dialogs */}
      {confirmConfig && (
        <ConfirmDialog message={confirmConfig.message}
          onConfirm={confirmConfig.onConfirm}
          onCancel={() => setConfirmConfig(null)} />
      )}
      {showSaveDialog && (
        <SaveFileDialog fsId={activeFilesystemId}
          initialPath={currentPath}
          initialName={pendingUpload?.name ?? ''}
          title={pendingUpload?.name ? `Save "${pendingUpload.name}"` : 'Save File'}
          onSave={(p, n) => void handleSaveDialogSave(p, n)}
          onCancel={() => { setShowSaveDialog(false); setPendingUpload(null) }} />
      )}
      {imagePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => { URL.revokeObjectURL(imagePreview.url); setImagePreview(null) }}>
          <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between w-full">
              <span className="text-slate-300 text-sm">{imagePreview.name}</span>
              <button onClick={() => { URL.revokeObjectURL(imagePreview.url); setImagePreview(null) }}
                className="text-slate-400 hover:text-slate-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <img src={imagePreview.url} alt={imagePreview.name} className="max-h-[80vh] max-w-full object-contain rounded" />
          </div>
        </div>
      )}

      {/* Load from URL dialog */}
      {showUrlDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => { if (!urlLoading) { setShowUrlDialog(false); setUrlInput(''); setUrlError('') } }}>
          <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-5 w-[440px] max-w-[95vw] text-xs"
            onClick={e => e.stopPropagation()}>
            <div className="text-sm font-bold text-white mb-1">Open from URL</div>
            <p className="text-slate-400 mb-3 leading-relaxed">
              Enter a URL to a <strong className="text-slate-300">book.json</strong> or a <strong className="text-slate-300">book ZIP</strong> to open a learning book, or any other ZIP to load as a filesystem.<br />
              GitHub blob/raw URLs are automatically fetched via jsDelivr.
            </p>
            <input
              autoFocus
              type="url"
              value={urlInput}
              onChange={e => { setUrlInput(e.target.value); setUrlError('') }}
              onKeyDown={e => { if (e.key === 'Enter' && !urlLoading) void handleLoadFromUrl(); if (e.key === 'Escape') { setShowUrlDialog(false); setUrlInput(''); setUrlError('') } }}
              placeholder="https://..."
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-sky-400 mb-2"
            />
            {urlError && <div className="text-red-400 text-[11px] mb-2">{urlError}</div>}
            <div className="flex justify-end gap-2 mt-1">
              <button onClick={() => { setShowUrlDialog(false); setUrlInput(''); setUrlError('') }}
                disabled={urlLoading}
                className="px-3 py-1.5 rounded border border-slate-600 text-slate-300 hover:border-slate-400 disabled:opacity-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => void handleLoadFromUrl()}
                disabled={urlLoading || !urlInput.trim()}
                className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold disabled:opacity-50 transition-colors flex items-center gap-2">
                {urlLoading && (
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
                {urlLoading ? 'Loading...' : 'Load'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EntryIcon({ entry }: { entry: VFSEntry }) {
  if (entry.type === 'folder') {
    return (
      <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z" />
      </svg>
    )
  }
  const mime = entry.mimeType ?? guessMimeType(entry.name)
  if (isImageMime(mime)) {
    return (
      <svg className="w-4 h-4 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    )
  }
  if (mime === 'text/x-python') {
    return (
      <svg className="w-4 h-4 text-sky-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    )
  }
  return (
    <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function ToolbarBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick}
      className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors">
      {children}
    </button>
  )
}

function CtxItem({ label, onClick, danger, disabled }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button onClick={disabled ? undefined : onClick}
      className={`w-full text-left px-3 py-1.5 transition-colors ${disabled ? 'text-slate-600 cursor-default' : danger ? 'text-red-400 hover:bg-red-900/30' : 'text-slate-300 hover:bg-slate-700'}`}>
      {label}
    </button>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`
  return `${(bytes / 1024 / 1024).toFixed(1)}M`
}
