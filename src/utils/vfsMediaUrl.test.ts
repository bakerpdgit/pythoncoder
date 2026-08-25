import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createVfsMediaUrlCache, isDirectMediaUrl, toVfsPath } from './vfsMediaUrl'
import { getEntryByPath } from './virtualFS'
import type { VFSEntry } from '../types'

vi.mock('./virtualFS', async importOriginal => {
  const actual = await importOriginal<typeof import('./virtualFS')>()
  return { ...actual, getEntryByPath: vi.fn() }
})

const mockedGetEntry = vi.mocked(getEntryByPath)

const fileEntry = (path: string, mimeType?: string): VFSEntry => ({
  id: path,
  fsId: 'default',
  parentPath: '/',
  path,
  name: path.split('/').pop()!,
  type: 'file',
  content: new Uint8Array([1, 2, 3, 4]).buffer,
  mimeType,
  modifiedAt: 0,
})

let createdUrls: string[]
let revokedUrls: string[]

beforeEach(() => {
  createdUrls = []
  revokedUrls = []
  let counter = 0
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => {
      const url = `blob:mock/${counter++}`
      createdUrls.push(url)
      return url
    }),
    revokeObjectURL: vi.fn((url: string) => { revokedUrls.push(url) }),
  })
  mockedGetEntry.mockReset()
})

describe('isDirectMediaUrl', () => {
  it('recognises what the browser can already fetch', () => {
    for (const url of [
      'https://example.com/a.mp3',
      'http://example.com/a.mp3',
      'data:audio/wav;base64,AAAA',
      'blob:http://localhost/abc',
      '//cdn.example.com/a.mp3',
      'HTTPS://EXAMPLE.COM/A.MP3',
    ]) expect(isDirectMediaUrl(url)).toBe(true)
  })

  it('treats bare filenames and paths as virtual-filesystem sources', () => {
    for (const source of ['beep.wav', '/sounds/beep.wav', 'sounds/beep.wav', './beep.wav']) {
      expect(isDirectMediaUrl(source)).toBe(false)
    }
  })
})

describe('toVfsPath', () => {
  it('resolves a relative source against the working directory', () => {
    expect(toVfsPath('beep.wav', '/')).toBe('/beep.wav')
    expect(toVfsPath('beep.wav', '/sounds')).toBe('/sounds/beep.wav')
    expect(toVfsPath('beep.wav', '/sounds/')).toBe('/sounds/beep.wav')
  })

  it('leaves an absolute source alone', () => {
    expect(toVfsPath('/sounds/beep.wav', '/elsewhere')).toBe('/sounds/beep.wav')
  })
})

describe('createVfsMediaUrlCache', () => {
  const opts = { fsId: 'default', cwd: '/' }

  it('passes a direct URL through without touching the filesystem', async () => {
    const cache = createVfsMediaUrlCache()
    await expect(cache.resolve('https://example.com/a.mp3', opts)).resolves.toBe('https://example.com/a.mp3')
    expect(mockedGetEntry).not.toHaveBeenCalled()
    expect(createdUrls).toHaveLength(0)
  })

  it('resolves an empty source to an empty string', async () => {
    const cache = createVfsMediaUrlCache()
    await expect(cache.resolve('', opts)).resolves.toBe('')
  })

  it('mints one blob URL for a virtual-filesystem file', async () => {
    mockedGetEntry.mockResolvedValue(fileEntry('/beep.wav', 'audio/wav'))
    const cache = createVfsMediaUrlCache()
    const url = await cache.resolve('beep.wav', opts)
    expect(url).toBe('blob:mock/0')
    expect(mockedGetEntry).toHaveBeenCalledWith('default', '/beep.wav')
  })

  // The bug this cache exists to fix: `for i in range(50): stdaud.load("beep.wav")`
  // used to retain 50 copies of the clip for the whole run.
  it('reuses the same URL for repeat calls and reads the file only once', async () => {
    mockedGetEntry.mockResolvedValue(fileEntry('/beep.wav', 'audio/wav'))
    const cache = createVfsMediaUrlCache()
    const urls = []
    for (let i = 0; i < 50; i++) urls.push(await cache.resolve('beep.wav', opts))
    expect(new Set(urls).size).toBe(1)
    expect(createdUrls).toHaveLength(1)
    expect(mockedGetEntry).toHaveBeenCalledTimes(1)
  })

  it('collapses concurrent resolutions of one file to a single retained URL', async () => {
    mockedGetEntry.mockResolvedValue(fileEntry('/beep.wav', 'audio/wav'))
    const cache = createVfsMediaUrlCache()
    const [a, b, c] = await Promise.all([
      cache.resolve('beep.wav', opts),
      cache.resolve('beep.wav', opts),
      cache.resolve('beep.wav', opts),
    ])
    expect(a).toBe(b)
    expect(b).toBe(c)
    // Losers of the race revoke their own URL rather than leaking it.
    expect(createdUrls.filter(u => !revokedUrls.includes(u))).toEqual([a])
    cache.releaseAll()
    expect(revokedUrls).toContain(a)
  })

  it('keys the cache per filesystem and per path', async () => {
    mockedGetEntry.mockImplementation(async (_fsId, path) => fileEntry(path, 'audio/wav'))
    const cache = createVfsMediaUrlCache()
    const a = await cache.resolve('beep.wav', { fsId: 'default', cwd: '/' })
    const b = await cache.resolve('beep.wav', { fsId: 'other', cwd: '/' })
    const c = await cache.resolve('other.wav', { fsId: 'default', cwd: '/' })
    expect(new Set([a, b, c]).size).toBe(3)
  })

  it('prefers the entry mime type, then the caller default, then the extension', async () => {
    const createObjectURL = vi.mocked(URL.createObjectURL)
    mockedGetEntry.mockResolvedValueOnce(fileEntry('/a.wav', 'audio/wav'))
    mockedGetEntry.mockResolvedValueOnce(fileEntry('/b.bin', ''))
    mockedGetEntry.mockResolvedValueOnce(fileEntry('/c.png', ''))
    const cache = createVfsMediaUrlCache()
    await cache.resolve('a.wav', opts)
    await cache.resolve('b.bin', { ...opts, defaultMimeType: 'audio/mpeg' })
    await cache.resolve('c.png', opts)
    const types = createObjectURL.mock.calls.map(([blob]) => (blob as Blob).type)
    expect(types).toEqual(['audio/wav', 'audio/mpeg', 'image/png'])
  })

  it('returns the source unchanged when no such file exists, and reports it once', async () => {
    mockedGetEntry.mockResolvedValue(null)
    const onMissing = vi.fn()
    const cache = createVfsMediaUrlCache()
    await expect(cache.resolve('nope.wav', { ...opts, onMissing })).resolves.toBe('nope.wav')
    expect(onMissing).toHaveBeenCalledWith('nope.wav', '/nope.wav')
    expect(createdUrls).toHaveLength(0)
  })

  it('falls back to the raw source when the filesystem read throws', async () => {
    mockedGetEntry.mockRejectedValue(new Error('IndexedDB unavailable'))
    const cache = createVfsMediaUrlCache()
    await expect(cache.resolve('beep.wav', opts)).resolves.toBe('beep.wav')
  })

  it('revokes everything on releaseAll and starts clean afterwards', async () => {
    mockedGetEntry.mockImplementation(async (_fsId, path) => fileEntry(path, 'audio/wav'))
    const cache = createVfsMediaUrlCache()
    const first = await cache.resolve('a.wav', opts)
    const second = await cache.resolve('b.wav', opts)

    cache.releaseAll()
    expect(revokedUrls.sort()).toEqual([first, second].sort())

    // A later run resolves afresh rather than handing back a revoked URL.
    const again = await cache.resolve('a.wav', opts)
    expect(again).not.toBe(first)
  })
})
