import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectResourceKind, kindOfFiles } from './resourceKind'

afterEach(() => { vi.unstubAllGlobals() })

function serve(routes: Record<string, BodyInit>) {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const body = routes[String(input)]
    return body === undefined ? new Response('nope', { status: 404 }) : new Response(body)
  }))
}

async function zipOf(files: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip()
  for (const [path, text] of Object.entries(files)) zip.file(path, text)
  return zip.generateAsync({ type: 'arraybuffer' })
}

const enc = (t: string) => new TextEncoder().encode(t).buffer as ArrayBuffer

describe('kindOfFiles', () => {
  it('reads book.json first, then 01.py', () => {
    expect(kindOfFiles(new Map([['/book.json', enc('{}')], ['/01.py', enc('')]]))).toBe('book')
    expect(kindOfFiles(new Map([['/01.py', enc('')]]))).toBe('simple')
    expect(kindOfFiles(new Map([['/main.py', enc('')]]))).toBe('files')
  })
})

describe('detectResourceKind', () => {
  it('takes a book.json address as a book', async () => {
    const found = await detectResourceKind('https://github.com/me/r/blob/main/book.json')
    expect(found).toEqual({ kind: 'book', url: 'https://raw.githubusercontent.com/me/r/main/book.json' })
  })

  it('finds a book.json in a GitHub folder without the API', async () => {
    serve({ 'https://raw.githubusercontent.com/me/r/main/week1/book.json': '{"children":[]}' })
    expect(await detectResourceKind('https://github.com/me/r/tree/main/week1'))
      .toEqual({ kind: 'book', url: 'https://raw.githubusercontent.com/me/r/main/week1/book.json' })
  })

  it('takes a GitHub folder with 01.py as a simple book', async () => {
    serve({ 'https://raw.githubusercontent.com/me/r/HEAD/01.py': 'print(1)' })
    expect(await detectResourceKind('https://github.com/me/r')).toEqual({ kind: 'simple', source: 'https://github.com/me/r' })
  })

  it('looks inside a ZIP', async () => {
    serve({
      'https://x.test/book.zip': await zipOf({ 'b/book.json': '{}', 'b/ex01.py': '' }),
      'https://x.test/simple.zip': await zipOf({ '01.py': '', '02.py': '' }),
      'https://x.test/project.zip': await zipOf({ 'main.py': 'x' }),
    })
    expect((await detectResourceKind('https://x.test/book.zip')).kind).toBe('zip-book')
    expect(await detectResourceKind('https://x.test/simple.zip')).toEqual({ kind: 'simple', source: 'https://x.test/simple.zip' })
    const files = await detectResourceKind('https://x.test/project.zip')
    expect(files.kind === 'files' && [...files.files.keys()]).toEqual(['/main.py'])
  })

  it('opens any other single file as files, and refuses a web page', async () => {
    serve({ 'https://x.test/game.py': 'print(1)', 'https://x.test/page': '<!doctype html><html></html>' })
    const found = await detectResourceKind('https://x.test/game.py')
    expect(found.kind === 'files' && [...found.files.keys()]).toEqual(['/game.py'])
    await expect(detectResourceKind('https://x.test/page')).rejects.toThrow(/web page/)
  })
})
