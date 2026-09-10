import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildSimpleBookManifest, fetchSimpleBookManifest, invalidateSimpleBook, isSimpleBookFileUrl,
  isSimpleBookUrl, parseSimpleBookGuide, readSimpleBookGuide, simpleBookExerciseNumber,
  simpleBookFileUrl, simpleBookIdPrefix, simpleBookRootUrl, simpleBookSource,
  type SimpleBookExercise,
} from './simpleBook'
import type { BookChallenge } from '../types'

const REPO = 'https://github.com/perse-cs/girlscodingclub2627'

function exercise(number: string, over: Partial<SimpleBookExercise> = {}): SimpleBookExercise {
  return { number, hasGuide: false, additional: [], ...over }
}

describe('parseSimpleBookGuide', () => {
  it('takes the files a guide asks for off the top and shows the rest', () => {
    const guide = parseSimpleBookGuide([
      '#! data.txt',
      '#!scores.csv',
      '',
      'Read the scores and print the highest.',
    ].join('\n'))
    expect(guide.additional).toEqual(['data.txt', 'scores.csv'])
    expect(guide.text).toBe('Read the scores and print the highest.')
  })

  it('reads instructions with no directives at all verbatim', () => {
    const guide = parseSimpleBookGuide('Use *args and my_var — every character survives.')
    expect(guide.additional).toEqual([])
    expect(guide.text).toBe('Use *args and my_var — every character survives.')
  })

  it('leaves nothing to read when the file is only directives', () => {
    const guide = parseSimpleBookGuide('#! data.txt\n\n   \n')
    expect(guide.additional).toEqual(['data.txt'])
    expect(guide.text).toBe('')
  })

  it('only reads directives at the top, so a later #! is prose', () => {
    const guide = parseSimpleBookGuide('#! data.txt\nOpen it.\n#! late.txt')
    expect(guide.additional).toEqual(['data.txt'])
    expect(guide.text).toBe('Open it.\n#! late.txt')
  })

  it('ignores blank lines and a leading ./, and never asks for a file twice', () => {
    const guide = parseSimpleBookGuide('\n#! ./data.txt\n\n#! data.txt\n#!\nGo.')
    expect(guide.additional).toEqual(['data.txt'])
    expect(guide.text).toBe('Go.')
  })

  it('survives CRLF line endings and a byte-order mark, as Notepad writes them', () => {
    const guide = parseSimpleBookGuide('﻿#! data.txt\r\n\r\nLine one\r\nLine two')
    expect(guide.additional).toEqual(['data.txt'])
    expect(guide.text).toBe('Line one\nLine two')
  })
})

describe('buildSimpleBookManifest', () => {
  const manifest = buildSimpleBookManifest(
    [exercise('01', { hasGuide: true, additional: ['data.txt'] }), exercise('02')],
    { source: REPO, name: 'girlscodingclub2627' })
  const first = manifest.children[0] as BookChallenge

  it('titles each exercise by its number and points at its two files', () => {
    expect(manifest.children.map(child => (child as BookChallenge).name)).toEqual(['01', '02'])
    expect(first.py).toBe('01.py')
    expect(first.guide).toBe('01.txt')
  })

  it('leaves the guide unset for an exercise with no .txt beside it', () => {
    expect((manifest.children[1] as BookChallenge).guide).toBeUndefined()
  })

  it('mounts the files the guide asked for, visible to the student', () => {
    expect(first.additionalFiles).toEqual([{ filename: 'data.txt', visible: true }])
  })

  it('makes every exercise an example, since nothing here can declare a test', () => {
    for (const child of manifest.children) {
      expect((child as BookChallenge).isExample).toBe(true)
      expect((child as BookChallenge).tests).toBeUndefined()
    }
  })

  it('keeps ids stable for a source but distinct between two folders', () => {
    const again = buildSimpleBookManifest([exercise('01')], { source: REPO, name: 'x' })
    const elsewhere = buildSimpleBookManifest([exercise('01')], { source: `${REPO}/tree/main/week2`, name: 'x' })
    expect((again.children[0] as BookChallenge).id).toBe(first.id)
    expect((elsewhere.children[0] as BookChallenge).id).not.toBe(first.id)
    expect(first.id.startsWith(simpleBookIdPrefix(REPO))).toBe(true)
  })
})

describe('simpleBookExerciseNumber', () => {
  it('numbers exercises with two digits so they read in book order', () => {
    expect([1, 9, 10, 23].map(simpleBookExerciseNumber)).toEqual(['01', '09', '10', '23'])
  })
})

// ── Reading a repository without listing it ─────────────────────────────────

/** A fake repository: a map of path → text, served like raw.githubusercontent. */
function serveRepo(files: Record<string, string>) {
  const requests: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    requests.push(url)
    const match = /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.*)$/.exec(url)
    const body = match ? files[match[1]] : undefined
    return body === undefined
      ? new Response('Not Found', { status: 404 })
      : new Response(body, { status: 200 })
  }))
  return requests
}

afterEach(() => { vi.unstubAllGlobals() })

describe('fetchSimpleBookManifest', () => {
  it('finds the exercises by number and stops at the first missing one', async () => {
    const source = REPO
    const requests = serveRepo({
      '01.py': 'print(1)',
      '01.txt': '#! data.txt\nAdd the numbers up.',
      '02.py': 'print(2)',
      '04.py': 'print(4)',
      'data.txt': '1,2,3',
    })
    invalidateSimpleBook(simpleBookRootUrl(source))
    const manifest = await fetchSimpleBookManifest(simpleBookRootUrl(source))

    expect(manifest.children.map(child => (child as BookChallenge).name)).toEqual(['01', '02'])
    expect((manifest.children[0] as BookChallenge).additionalFiles)
      .toEqual([{ filename: 'data.txt', visible: true }])
    // The whole point: a class behind one school IP must not spend the GitHub
    // API's ~60 requests an hour just to open their books.
    expect(requests.some(url => url.includes('api.github.com'))).toBe(false)
    expect(requests.every(url => url.startsWith('https://raw.githubusercontent.com/'))).toBe(true)
    // The branch is not looked up either — raw.githubusercontent takes HEAD.
    expect(requests[0]).toContain('/perse-cs/girlscodingclub2627/HEAD/')
  })

  it('serves an exercise’s instructions with the directives taken out', async () => {
    const source = `${REPO}-guides`
    serveRepo({ '01.py': 'pass', '01.txt': '#! data.txt\n\nPrint the answer.' })
    invalidateSimpleBook(simpleBookRootUrl(source))
    await fetchSimpleBookManifest(simpleBookRootUrl(source))

    expect(await readSimpleBookGuide(simpleBookFileUrl(simpleBookRootUrl(source), '01.txt')))
      .toBe('Print the answer.')
  })

  it('re-reads a file rather than re-fetching it within one open book', async () => {
    const source = `${REPO}-cached`
    const requests = serveRepo({ '01.py': 'pass', '01.txt': 'Go.' })
    invalidateSimpleBook(simpleBookRootUrl(source))
    await fetchSimpleBookManifest(simpleBookRootUrl(source))
    const afterProbe = requests.length
    await readSimpleBookGuide(simpleBookFileUrl(simpleBookRootUrl(source), '01.txt'))
    expect(requests.length).toBe(afterProbe)
  })

  it('does not mistake a host’s “not found” web page for an exercise', async () => {
    const source = 'https://school.example/exercises/'
    // A single-page app's server answers anything it does not have with its own
    // index page and a 200. Believing it would publish 99 exercises, 98 of them
    // holding a copy of somebody's HTML.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(
      /0[12]\.py$/.test(url) ? 'pass' : '<!DOCTYPE html><html><body>Not found</body></html>',
      { status: 200 })))
    invalidateSimpleBook(simpleBookRootUrl(source))
    const manifest = await fetchSimpleBookManifest(simpleBookRootUrl(source))
    expect(manifest.children.map(child => (child as BookChallenge).name)).toEqual(['01', '02'])
    expect((manifest.children[0] as BookChallenge).guide).toBeUndefined()
  })

  it('says what it looked for when a folder holds no numbered exercises', async () => {
    const source = `${REPO}-empty`
    serveRepo({ 'challenge01.py': 'pass' })
    invalidateSimpleBook(simpleBookRootUrl(source))
    await expect(fetchSimpleBookManifest(simpleBookRootUrl(source)))
      .rejects.toThrow(/01\.py/)
  })

  it('reports a network that is down rather than shortening the book', async () => {
    const source = `${REPO}-offline`
    // Unreachable, not absent — and unreachable on every mirror, so there is no
    // answer to be had. Shortening the book here would hand a student a book
    // missing its second half and no hint that anything went wrong.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (/0[12]\.py/.test(url)) return new Response('pass', { status: 200 })
      if (/03(\.|%2E)?py/.test(url)) throw new TypeError('Failed to fetch')
      return new Response('Not Found', { status: 404 })
    }))
    invalidateSimpleBook(simpleBookRootUrl(source))
    await expect(fetchSimpleBookManifest(simpleBookRootUrl(source))).rejects.toThrow(/03\.py/)
  })
})

describe('simplebook URLs', () => {
  it('round-trips a source address', () => {
    const root = simpleBookRootUrl(REPO)
    expect(isSimpleBookUrl(root)).toBe(true)
    expect(isSimpleBookFileUrl(root)).toBe(false)
    expect(simpleBookSource(root)).toBe(REPO)
  })

  it('names a file within the source', () => {
    const fileUrl = simpleBookFileUrl(simpleBookRootUrl(REPO), '01.py')
    expect(isSimpleBookFileUrl(fileUrl)).toBe(true)
    expect(simpleBookSource(fileUrl)).toBe(REPO)
    expect(fileUrl.endsWith('#01.py')).toBe(true)
  })

  it('resolves a file against a file URL, not on top of it', () => {
    const fileUrl = simpleBookFileUrl(simpleBookRootUrl(REPO), '01.py')
    expect(simpleBookFileUrl(fileUrl, '02.py')).toBe(`${simpleBookRootUrl(REPO)}#02.py`)
  })

  it('reads a vfs source as well as a web one', () => {
    const root = simpleBookRootUrl('vfs://fs:abc123')
    expect(simpleBookSource(root)).toBe('vfs://fs:abc123')
  })
})
