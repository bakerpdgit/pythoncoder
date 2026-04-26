import type { VFSEntry, VFSFile, VFSFilesystem } from '../types'

const DB_NAME = 'pythoncoder-vfs'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openVFSDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('filesystems')) {
        db.createObjectStore('filesystems', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('entries')) {
        const store = db.createObjectStore('entries', { keyPath: 'id' })
        store.createIndex('byFsAndParent', ['fsId', 'parentPath'], { unique: false })
        store.createIndex('byFsAndPath', ['fsId', 'path'], { unique: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

export function getParentPath(path: string): string {
  const idx = path.lastIndexOf('/')
  if (idx <= 0) return '/'
  return path.substring(0, idx)
}

function idbGet<T>(store: IDBObjectStore | IDBIndex, key: IDBValidKey | IDBKeyRange): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const req = store.get(key)
    req.onsuccess = () => resolve((req.result as T) ?? null)
    req.onerror = () => reject(req.error)
  })
}

function idbGetAll<T>(store: IDBObjectStore | IDBIndex, query?: IDBValidKey | IDBKeyRange): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = query !== undefined ? store.getAll(query) : store.getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

function idbPut(store: IDBObjectStore, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.put(value)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function idbAdd(store: IDBObjectStore, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.add(value)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function idbDelete(store: IDBObjectStore, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function ensureDefaultFilesystem(): Promise<void> {
  const db = await openVFSDb()
  const t = db.transaction('filesystems', 'readwrite')
  const store = t.objectStore('filesystems')
  const existing = await idbGet<VFSFilesystem>(store, 'default')
  if (!existing) {
    await idbAdd(store, { id: 'default', name: 'Default', createdAt: Date.now() })
  }
}

export async function listFilesystems(): Promise<VFSFilesystem[]> {
  const db = await openVFSDb()
  const store = db.transaction('filesystems', 'readonly').objectStore('filesystems')
  return idbGetAll<VFSFilesystem>(store)
}

export async function createFilesystem(name: string): Promise<VFSFilesystem> {
  const db = await openVFSDb()
  const fs: VFSFilesystem = { id: crypto.randomUUID(), name, createdAt: Date.now() }
  const store = db.transaction('filesystems', 'readwrite').objectStore('filesystems')
  await idbAdd(store, fs)
  return fs
}

export function renameFilesystem(id: string, newName: string): Promise<void> {
  if (id === 'default') return Promise.reject(new Error('Cannot rename the default filesystem.'))
  return new Promise((resolve, reject) => {
    openVFSDb().then(db => {
      const store = db.transaction('filesystems', 'readwrite').objectStore('filesystems')
      const getReq = store.get(id)
      getReq.onsuccess = () => {
        if (!getReq.result) { reject(new Error('Filesystem not found.')); return }
        const putReq = store.put({ ...(getReq.result as VFSFilesystem), name: newName })
        putReq.onsuccess = () => resolve()
        putReq.onerror = () => reject(putReq.error)
      }
      getReq.onerror = () => reject(getReq.error)
    }).catch(reject)
  })
}

export async function deleteFilesystem(id: string): Promise<void> {
  if (id === 'default') throw new Error('Cannot delete the default filesystem.')
  const db = await openVFSDb()
  const allEntries = await _getAllEntriesForFs(db, id)
  const t = db.transaction(['filesystems', 'entries'], 'readwrite')
  const fsStore = t.objectStore('filesystems')
  const entryStore = t.objectStore('entries')
  await Promise.all([
    idbDelete(fsStore, id),
    ...allEntries.map(e => idbDelete(entryStore, e.id)),
  ])
}

export async function listChildren(fsId: string, parentPath: string): Promise<VFSEntry[]> {
  const db = await openVFSDb()
  const index = db.transaction('entries', 'readonly').objectStore('entries').index('byFsAndParent')
  return idbGetAll<VFSEntry>(index, [fsId, parentPath])
}

export async function getEntryByPath(fsId: string, path: string): Promise<VFSEntry | null> {
  const db = await openVFSDb()
  const index = db.transaction('entries', 'readonly').objectStore('entries').index('byFsAndPath')
  return idbGet<VFSEntry>(index, [fsId, path])
}

export async function createEntry(
  fsId: string,
  parentPath: string,
  name: string,
  type: 'file' | 'folder',
  content?: ArrayBuffer,
  mimeType?: string
): Promise<VFSEntry> {
  const path = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`
  const entry: VFSEntry = {
    id: crypto.randomUUID(), fsId, parentPath, path, name, type,
    content, mimeType, size: content?.byteLength, modifiedAt: Date.now(),
  }
  const db = await openVFSDb()
  await idbAdd(db.transaction('entries', 'readwrite').objectStore('entries'), entry)
  return entry
}

export async function writeFile(
  fsId: string,
  path: string,
  content: ArrayBuffer,
  mimeType?: string
): Promise<void> {
  const db = await openVFSDb()
  const store = db.transaction('entries', 'readwrite').objectStore('entries')
  const index = store.index('byFsAndPath')
  const existing = await idbGet<VFSEntry>(index, [fsId, path])
  if (existing) {
    await idbPut(store, { ...existing, content, mimeType: mimeType ?? existing.mimeType, size: content.byteLength, modifiedAt: Date.now() })
  } else {
    const parentPath = getParentPath(path)
    const name = path.substring(path.lastIndexOf('/') + 1)
    await idbAdd(store, {
      id: crypto.randomUUID(), fsId, parentPath, path, name, type: 'file',
      content, mimeType: mimeType ?? 'text/plain', size: content.byteLength, modifiedAt: Date.now(),
    })
  }
}

async function _getAllEntriesForFs(db: IDBDatabase, fsId: string): Promise<VFSEntry[]> {
  return new Promise((resolve, reject) => {
    const store = db.transaction('entries', 'readonly').objectStore('entries')
    const cursor = store.openCursor()
    const results: VFSEntry[] = []
    cursor.onsuccess = () => {
      const c = cursor.result
      if (c) {
        if ((c.value as VFSEntry).fsId === fsId) results.push(c.value as VFSEntry)
        c.continue()
      } else {
        resolve(results)
      }
    }
    cursor.onerror = () => reject(cursor.error)
  })
}

export async function renameEntry(fsId: string, path: string, newName: string): Promise<void> {
  const db = await openVFSDb()
  const allEntries = await _getAllEntriesForFs(db, fsId)
  const entry = allEntries.find(e => e.path === path)
  if (!entry) throw new Error('Entry not found')
  const parentPath = getParentPath(path)
  const newPath = parentPath === '/' ? `/${newName}` : `${parentPath}/${newName}`
  const t = db.transaction('entries', 'readwrite')
  const store = t.objectStore('entries')
  const updates: VFSEntry[] = [{ ...entry, path: newPath, name: newName, modifiedAt: Date.now() }]
  if (entry.type === 'folder') {
    for (const desc of allEntries.filter(e => e.path.startsWith(path + '/'))) {
      const newDescPath = newPath + desc.path.substring(path.length)
      const newDescParent = desc.parentPath === path ? newPath : desc.parentPath.startsWith(path + '/') ? newPath + desc.parentPath.substring(path.length) : desc.parentPath
      updates.push({ ...desc, path: newDescPath, parentPath: newDescParent, modifiedAt: Date.now() })
    }
  }
  await Promise.all(updates.map(u => idbPut(store, u)))
}

export async function deleteEntry(fsId: string, path: string): Promise<void> {
  const db = await openVFSDb()
  const allEntries = await _getAllEntriesForFs(db, fsId)
  const toDelete = allEntries.filter(e => e.path === path || e.path.startsWith(path + '/'))
  const store = db.transaction('entries', 'readwrite').objectStore('entries')
  await Promise.all(toDelete.map(e => idbDelete(store, e.id)))
}

export async function getAllFiles(fsId: string): Promise<VFSFile[]> {
  const db = await openVFSDb()
  const entries = await _getAllEntriesForFs(db, fsId)
  return entries
    .filter(e => e.type === 'file' && e.content !== undefined)
    .map(e => ({ path: e.path, content: e.content!, mimeType: e.mimeType ?? 'text/plain' }))
}

export async function syncFilesFromPyodide(fsId: string, updatedFiles: VFSFile[]): Promise<void> {
  for (const file of updatedFiles) {
    await writeFile(fsId, file.path, file.content, file.mimeType)
  }
}

export function guessMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  const map: Record<string, string> = {
    py: 'text/x-python', txt: 'text/plain', js: 'text/javascript',
    ts: 'text/typescript', html: 'text/html', css: 'text/css',
    json: 'application/json', csv: 'text/csv', md: 'text/markdown',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
    pdf: 'application/pdf',
  }
  return map[ext] ?? 'application/octet-stream'
}

export function isTextMime(mimeType: string): boolean {
  return mimeType.startsWith('text/') || mimeType === 'application/json'
}

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

export async function downloadEntryAsZip(fsId: string, entryPath: string, zipName: string): Promise<void> {
  const { default: JSZip } = await import('jszip')
  const allFiles = await getAllFiles(fsId)
  const zip = new JSZip()
  const prefix = entryPath === '/' ? '' : entryPath
  const files = entryPath === '/' ? allFiles : allFiles.filter(f => f.path.startsWith(prefix + '/') || f.path === entryPath)
  for (const file of files) {
    const rel = prefix ? file.path.substring(prefix.length + 1) : file.path.substring(1)
    if (rel) zip.file(rel, file.content)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${zipName}.zip`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

export function downloadSingleFile(content: ArrayBuffer, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

export function mountFilesToPyodide(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pyodide: any,
  files: VFSFile[],
  cwd: string
): void {
  for (const file of files) {
    const dir = getParentPath(file.path)
    if (dir !== '/') {
      try { pyodide.FS.mkdirTree(dir) } catch { /* exists */ }
    }
    try { pyodide.FS.writeFile(file.path, new Uint8Array(file.content)) } catch { /* ignore */ }
  }
  try { pyodide.FS.chdir(cwd) } catch { /* ignore */ }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readFilesFromPyodide(pyodide: any, mountedPaths: string[], cwd: string): VFSFile[] {
  const results: VFSFile[] = []
  const visited = new Set<string>()

  function walk(dirPath: string) {
    let entries: string[]
    try { entries = pyodide.FS.readdir(dirPath) as string[] } catch { return }
    for (const name of entries) {
      if (name === '.' || name === '..') continue
      const fullPath = dirPath === '/' ? `/${name}` : `${dirPath}/${name}`
      if (visited.has(fullPath)) continue
      visited.add(fullPath)
      try {
        const stat = pyodide.FS.stat(fullPath)
        if (pyodide.FS.isDir(stat.mode)) {
          walk(fullPath)
        } else if (pyodide.FS.isFile(stat.mode)) {
          const content = pyodide.FS.readFile(fullPath) as Uint8Array
          results.push({ path: fullPath, content: content.buffer.slice(0) as ArrayBuffer, mimeType: guessMimeType(name) })
        }
      } catch { /* skip */ }
    }
  }

  const dirsToScan = new Set<string>([cwd])
  for (const p of mountedPaths) dirsToScan.add(getParentPath(p))
  for (const dir of dirsToScan) walk(dir)

  return results
}
