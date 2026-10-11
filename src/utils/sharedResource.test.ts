import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  describeSharedFiles, driveDirectUrl, fetchSharedFiles, sameSharedFiles, sharedFileName, SharedResourceError,
} from './sharedResource'
import { listRepoFilesRecursive } from './githubRepo'

const enc = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer
const dec = (buffer: ArrayBuffer | undefined) => new TextDecoder().decode(buffer)

afterEach(() => { vi.unstubAllGlobals() })

/** Serve a map of address → body; anything else is a 404. Records what was asked for. */
function serve(routes: Record<string, BodyInit | (() => Response)>) {
  const requests: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = String(input)
    requests.push(url)
    const route = routes[url]
    if (route === undefined) return new Response('nope', { status: 404 })
    return typeof route === 'function' ? route() : new Response(route)
  }))
  return requests
}

async function zipOf(files: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip()
  for (const [path, text] of Object.entries(files)) zip.file(path, text)
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('driveDirectUrl', () => {
  it('turns Drive share links into download addresses', () => {
    expect(driveDirectUrl('https://drive.google.com/file/d/1AbC-_x/view?usp=sharing'))
      .toBe('https://drive.google.com/uc?export=download&id=1AbC-_x')
    expect(driveDirectUrl('https://drive.google.com/open?id=XYZ'))
      .toBe('https://drive.google.com/uc?export=download&id=XYZ')
  })

  it('leaves other hosts alone, even with an id parameter', () => {
    expect(driveDirectUrl('https://example.com/file?id=abc')).toBeNull()
    expect(driveDirectUrl('not a url')).toBeNull()
  })
})

describe('sharedFileName', () => {
  it('prefers the given name, then the address, then main.py', () => {
    expect(sharedFileName('https://drive.google.com/uc?export=download&id=1', 'game.py')).toBe('game.py')
    expect(sharedFileName('https://gist.githubusercontent.com/u/abc/raw/my%20code.py')).toBe('my code.py')
    expect(sharedFileName('https://drive.google.com/uc?export=download&id=1')).toBe('main.py')
    expect(sharedFileName('https://x.test/a.py', '../../evil')).toBe('a.py')
  })
})

describe('fetchSharedFiles', () => {
  it('reads a single file, named by its address', async () => {
    serve({ 'https://gist.githubusercontent.com/u/0123456789abcdef0123/raw/hello.py': 'print("hi")\n' })
    const result = await fetchSharedFiles('https://gist.githubusercontent.com/u/0123456789abcdef0123/raw/hello.py')
    expect(result.kind).toBe('file')
    expect([...result.files.keys()]).toEqual(['/hello.py'])
    expect(dec(result.files.get('/hello.py'))).toBe('print("hi")\n')
  })

  it('names a Drive file by the name it was shared with', async () => {
    serve({ 'https://drive.google.com/uc?export=download&id=F1': 'x = 1\n' })
    const result = await fetchSharedFiles('https://drive.google.com/file/d/F1/view?usp=sharing', { name: 'quiz.py' })
    expect([...result.files.keys()]).toEqual(['/quiz.py'])
  })

  it('falls back to the proxy for a host without CORS', async () => {
    const proxied = `${location.origin}/api/proxy?url=${encodeURIComponent('https://drive.google.com/uc?export=download&id=F2')}`
    const requests = serve({
      'https://drive.google.com/uc?export=download&id=F2': () => { throw new TypeError('Failed to fetch') },
      [proxied]: 'print(2)\n',
    })
    const result = await fetchSharedFiles('https://drive.google.com/uc?export=download&id=F2')
    expect(dec(result.files.get('/main.py'))).toBe('print(2)\n')
    expect(requests).toContain(proxied)
  })

  it('unpacks a ZIP, recognised by its bytes, dropping a single enclosing folder', async () => {
    serve({ 'https://drive.google.com/uc?export=download&id=Z': await zipOf({ 'proj/main.py': 'import util', 'proj/lib/util.py': 'x=1', '__MACOSX/proj/._main.py': 'junk' }) })
    const result = await fetchSharedFiles('https://drive.google.com/file/d/Z/view')
    expect(result.kind).toBe('zip')
    expect([...result.files.keys()].sort()).toEqual(['/lib/util.py', '/main.py'])
  })

  it('reports a sign-in page as not shared publicly', async () => {
    serve({ 'https://drive.google.com/uc?export=download&id=P': '<!DOCTYPE html><html><title>Sign in</title></html>' })
    const failure = await fetchSharedFiles('https://drive.google.com/file/d/P/view').catch(e => e)
    expect(failure).toBeInstanceOf(SharedResourceError)
    expect(failure.problem).toBe('web-page')
    expect(failure.message).toMatch(/Anyone with the link/)
  })

  it('reports a missing file as not found', async () => {
    serve({})
    const failure = await fetchSharedFiles('https://x.test/gone.py').catch(e => e)
    expect(failure.problem).toBe('not-found')
  })

  it('reads a GitHub folder through the trees API, then raw', async () => {
    const requests = serve({
      'https://api.github.com/repos/me/proj/git/trees/main?recursive=1': JSON.stringify({ tree: [
        { path: 'README.md', type: 'blob' },
        { path: 'code', type: 'tree' },
        { path: 'code/main.py', type: 'blob' },
        { path: 'code/data/scores.txt', type: 'blob' },
        { path: 'code/.github/workflows/ci.yml', type: 'blob' },
      ] }),
      'https://raw.githubusercontent.com/me/proj/main/code/main.py': 'print(open("data/scores.txt").read())',
      'https://raw.githubusercontent.com/me/proj/main/code/data/scores.txt': '10\n',
    })
    const result = await fetchSharedFiles('https://github.com/me/proj/tree/main/code')
    expect(result.kind).toBe('folder')
    expect([...result.files.keys()]).toEqual(['/data/scores.txt', '/main.py'])
    expect(requests.some(r => r.includes('README'))).toBe(false)
  })

  it('lists a folder through jsDelivr when GitHub is rate limiting', async () => {
    serve({
      'https://api.github.com/repos/me/proj/git/trees/main?recursive=1': () =>
        new Response('limited', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
      'https://data.jsdelivr.com/v1/packages/gh/me/proj@main?structure=flat': JSON.stringify({ files: [
        { name: '/main.py' }, { name: '/sub/b.py' },
      ] }),
    })
    expect(await listRepoFilesRecursive({ owner: 'me', repo: 'proj', branch: 'main', path: '', isFile: false }, ''))
      .toEqual(['main.py', 'sub/b.py'])
  })
})

describe('describing and comparing', () => {
  it('says what was found', () => {
    expect(describeSharedFiles(new Map([['/main.py', enc('a\nb\n')]]))).toBe('main.py (2 lines)')
    expect(describeSharedFiles(new Map([['/a', enc('')], ['/b', enc('')], ['/c', enc('')], ['/d', enc('')], ['/e', enc('')]])))
      .toBe('5 files: a, b, c, d, …')
  })

  it('compares paths and bytes', () => {
    expect(sameSharedFiles(new Map([['/a', enc('1')]]), new Map([['/a', enc('1')]]))).toBe(true)
    expect(sameSharedFiles(new Map([['/a', enc('1')]]), new Map([['/a', enc('2')]]))).toBe(false)
    expect(sameSharedFiles(new Map([['/a', enc('1')]]), new Map([['/b', enc('1')]]))).toBe(false)
  })
})
