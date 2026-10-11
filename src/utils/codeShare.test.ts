import { describe, expect, it } from 'vitest'
import {
  buildEmbeddedShareLink, buildHostedShareLink, decodeSharePayload, encodeSharePayload,
  isTextContent, judgeShareLinkLength, normaliseSharedPath, readHostedBookContext, readShareFragment, sharedFilesDigest,
  URL_SHARE_MAX, URL_SHARE_SOFT_LIMIT,
} from './codeShare'

const enc = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer

describe('share payloads', () => {
  it('carry one file there and back', async () => {
    const payload = { files: [{ path: '/main.py', text: 'print("hi")\n' }], open: '/main.py' }
    expect(await decodeSharePayload(await encodeSharePayload(payload))).toEqual(payload)
  })

  it('carry several files, folders and non-ASCII text', async () => {
    const payload = {
      files: [
        { path: '/main.py', text: 'from helpers import greet\ngreet("Zoë 👋")\n' },
        { path: '/lib/helpers.py', text: 'def greet(name):\n    print(f"héllo {name}")\n' },
        { path: '/data.txt', text: '' },
      ],
      open: '/lib/helpers.py',
    }
    expect(await decodeSharePayload(await encodeSharePayload(payload))).toEqual(payload)
  })

  it('are URL-safe and compress repetitive code', async () => {
    const text = 'for i in range(10):\n    print(i)\n'.repeat(200)
    const encoded = await encodeSharePayload({ files: [{ path: '/main.py', text }], open: '/main.py' })
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(encoded.length).toBeLessThan(text.length / 10)
  })

  it('open the first file when the named one is missing', async () => {
    const encoded = await encodeSharePayload({ files: [{ path: '/a.py', text: 'x' }], open: '/gone.py' })
    expect((await decodeSharePayload(encoded)).open).toBe('/a.py')
  })

  it('refuse a damaged or truncated link', async () => {
    const encoded = await encodeSharePayload({ files: [{ path: '/main.py', text: 'print(1)\n'.repeat(50) }], open: '/main.py' })
    await expect(decodeSharePayload(encoded.slice(0, encoded.length / 2))).rejects.toThrow(/damaged/)
    await expect(decodeSharePayload('not a payload!')).rejects.toThrow(/damaged/)
  })

  it('refuse a payload from a version this build does not know', async () => {
    const stream = new CompressionStream('deflate')
    const writer = stream.writable.getWriter()
    void writer.write(new TextEncoder().encode(JSON.stringify({ v: 99, files: [['/a.py', 'x']] })))
    void writer.close()
    const bytes = new Uint8Array(await new Response(stream.readable).arrayBuffer())
    const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    await expect(decodeSharePayload(encoded)).rejects.toThrow(/newer version/)
  })
})

describe('normaliseSharedPath', () => {
  it('makes paths absolute and refuses ones that climb out', () => {
    expect(normaliseSharedPath('main.py')).toBe('/main.py')
    expect(normaliseSharedPath('a\\b/./c.py')).toBe('/a/b/c.py')
    expect(normaliseSharedPath('../etc/passwd')).toBeNull()
    expect(normaliseSharedPath('/')).toBeNull()
  })
})

describe('links', () => {
  const base = `${location.origin}${location.pathname}`

  it('put embedded code in the fragment, never the query', async () => {
    const link = await buildEmbeddedShareLink({ files: [{ path: '/main.py', text: 'x = 1' }], open: '/main.py' })
    expect(link.startsWith(`${base}#share=`)).toBe(true)
    expect(readShareFragment(new URL(link).hash)).toBe(link.slice(link.indexOf('#share=') + 7))
  })

  it('point hosted code at its address, naming a file when asked', () => {
    const drive = 'https://drive.google.com/uc?export=download&id=abc'
    expect(buildHostedShareLink(drive, { name: 'my game.py' }))
      .toBe(`${base}?filesystem=${encodeURIComponent(drive)}&name=my%20game.py`)
    expect(buildHostedShareLink('https://x.test/a.zip')).toBe(`${base}?filesystem=https%3A%2F%2Fx.test%2Fa.zip`)
  })

  it('ignore other fragments', () => {
    expect(readShareFragment('')).toBeNull()
    expect(readShareFragment('#section-2')).toBeNull()
  })

  it('are judged by length in three tiers', () => {
    expect(judgeShareLinkLength('x'.repeat(URL_SHARE_SOFT_LIMIT))).toEqual({ ok: true, length: URL_SHARE_SOFT_LIMIT, long: false })
    expect(judgeShareLinkLength('x'.repeat(URL_SHARE_SOFT_LIMIT + 1))).toMatchObject({ ok: true, long: true })
    const tooLong = judgeShareLinkLength('x'.repeat(URL_SHARE_MAX + 1))
    expect(tooLong.ok).toBe(false)
    expect(!tooLong.ok && tooLong.reason).toMatch(/Too long for a link — 8,001 characters/)
  })
})

describe('content', () => {
  it('tells text from binary', () => {
    expect(isTextContent(enc('print("héllo")'))).toBe(true)
    expect(isTextContent(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1]).buffer)).toBe(false)
    expect(isTextContent(new Uint8Array([0xff, 0xfe, 0x41]).buffer)).toBe(false)
  })

  it('digests files independently of their order, and notices a change', () => {
    const a = new Map([['/a.py', enc('1')], ['/b.py', enc('2')]])
    const b = new Map([['/b.py', enc('2')], ['/a.py', enc('1')]])
    const c = new Map([['/a.py', enc('1')], ['/b.py', enc('3')]])
    expect(sharedFilesDigest(a)).toBe(sharedFilesDigest(b))
    expect(sharedFilesDigest(a)).not.toBe(sharedFilesDigest(c))
  })
})

describe('book context', () => {
  const book = { url: 'https://github.com/me/book', simple: true, activity: 'simple-abc-01', title: 'Loops', activityTitle: '01' }

  it('travels in a link payload, and a bad one is dropped', async () => {
    const payload = { files: [{ path: '/01.py', text: 'x' }], open: '/01.py', book }
    expect((await decodeSharePayload(await encodeSharePayload(payload))).book).toEqual(book)
    const bad = await encodeSharePayload({ files: payload.files, open: '/01.py', book: { ...book, url: 'javascript:x' } })
    expect((await decodeSharePayload(bad)).book).toBeUndefined()
  })

  it('travels on a hosted link as inbook / activity', () => {
    const link = buildHostedShareLink('https://gist.githubusercontent.com/u/abc/raw/01.py', { book })
    const search = new URL(link).search
    expect(search).toContain(`&inbook=${encodeURIComponent(book.url)}&activity=simple-abc-01&inbooksimple=1`)
    expect(readHostedBookContext(search)).toEqual({ url: book.url, simple: true, activity: 'simple-abc-01', title: undefined, activityTitle: undefined })
    expect(readHostedBookContext('?filesystem=x')).toBeNull()
  })
})
