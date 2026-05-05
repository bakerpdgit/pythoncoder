const DB_NAME = 'pythoncoder-vfs'
const DB_VERSION = 1
const PREVIEW_PREFIX = '/__vfs_preview__/fs/'

const MIME_TYPES = {
  css: 'text/css; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  gif: 'image/gif',
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  mp3: 'audio/mpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  py: 'text/x-python; charset=utf-8',
  svg: 'image/svg+xml',
  ts: 'text/typescript; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  wav: 'audio/wav',
  webp: 'image/webp',
}

let dbPromise = null

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(PREVIEW_PREFIX)) return
  event.respondWith(handlePreviewRequest(event.request, url))
})

async function handlePreviewRequest(request, url) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: previewHeaders('text/plain; charset=utf-8') })
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return textResponse(405, 'Method not allowed')
  }

  const parsed = parsePreviewPath(url.pathname)
  if (!parsed) return textResponse(400, 'Invalid VFS preview URL')

  try {
    const entry = await getEntryByPath(parsed.fsId, parsed.path)
    if (!entry || entry.type !== 'file' || entry.content === undefined) {
      return textResponse(404, `VFS file not found: ${parsed.path}`)
    }

    const contentType = entry.mimeType && entry.mimeType !== 'application/octet-stream'
      ? entry.mimeType
      : guessMimeType(parsed.path)
    const body = request.method === 'HEAD' ? null : entry.content
    return new Response(body, {
      status: 200,
      headers: previewHeaders(contentType),
    })
  } catch (error) {
    return textResponse(500, error instanceof Error ? error.message : String(error))
  }
}

function parsePreviewPath(pathname) {
  const inner = pathname.slice(PREVIEW_PREFIX.length)
  const slashIndex = inner.indexOf('/')
  if (slashIndex < 0) return null

  const fsId = decodeURIComponent(inner.slice(0, slashIndex))
  let vfsPath = decodeURIComponent(inner.slice(slashIndex))
  if (!vfsPath.startsWith('/')) vfsPath = '/' + vfsPath
  if (vfsPath.endsWith('/')) vfsPath += 'index.html'

  const parts = []
  for (const part of vfsPath.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') return null
    parts.push(part)
  }

  return { fsId, path: '/' + parts.join('/') }
}

function previewHeaders(contentType) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Origin-Agent-Cluster': '?1',
  }
}

function textResponse(status, body) {
  return new Response(body, {
    status,
    headers: previewHeaders('text/plain; charset=utf-8'),
  })
}

function openVFSDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = event => {
      const db = event.target.result
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

async function getEntryByPath(fsId, path) {
  const db = await openVFSDb()
  const index = db.transaction('entries', 'readonly').objectStore('entries').index('byFsAndPath')
  return new Promise((resolve, reject) => {
    const req = index.get([fsId, path])
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

function guessMimeType(path) {
  const ext = path.toLowerCase().split('.').pop() || ''
  return MIME_TYPES[ext] || 'application/octet-stream'
}
