import { describe, expect, it } from 'vitest'
import type { BookManifest } from '../types'
import { findBookTargetById, findFirstBookChallenge } from './bookLoader'

describe('findFirstBookChallenge', () => {
  it('returns the first direct example', async () => {
    const manifest: BookManifest = {
      children: [
        { id: 'first', name: 'First example', py: 'first.py' },
        { id: 'second', name: 'Second example', py: 'second.py' },
      ],
    }

    const target = await findFirstBookChallenge(
      'https://example.test/root/book.json',
      async () => manifest,
    )

    expect(target).toEqual({
      bookUrl: 'https://example.test/root/book.json',
      breadcrumb: [],
      challenge: manifest.children[0],
    })
  })

  it('walks nested books in display order and preserves the breadcrumb', async () => {
    const manifests: Record<string, BookManifest> = {
      'https://example.test/root/book.json': {
        children: [
          { id: 'empty-section', name: 'Empty section', bookLink: 'empty/book.json' },
          { id: 'lessons', name: 'Lessons', bookLink: 'lessons/book.json' },
        ],
      },
      'https://example.test/root/empty/book.json': { children: [] },
      'https://example.test/root/lessons/book.json': {
        children: [{ id: 'nested-first', name: 'Nested first', py: 'start.py' }],
      },
    }

    const target = await findFirstBookChallenge(
      'https://example.test/root/book.json',
      async url => manifests[url],
    )

    expect(target?.bookUrl).toBe('https://example.test/root/lessons/book.json')
    expect(target?.challenge.id).toBe('nested-first')
    expect(target?.breadcrumb).toEqual([
      { name: 'Lessons', bookUrl: 'https://example.test/root/book.json' },
    ])
  })

  it('returns null for empty and cyclic book trees', async () => {
    const rootUrl = 'https://example.test/root/book.json'
    const childUrl = 'https://example.test/root/child/book.json'
    const manifests: Record<string, BookManifest> = {
      [rootUrl]: { children: [{ id: 'child', name: 'Child', bookLink: 'child/book.json' }] },
      [childUrl]: { children: [{ id: 'root', name: 'Root', bookLink: '../book.json' }] },
    }

    await expect(findFirstBookChallenge(rootUrl, async url => manifests[url])).resolves.toBeNull()
  })
})

describe('findBookTargetById', () => {
  const rootUrl = 'https://example.test/root/book.json'
  const lessonsUrl = 'https://example.test/root/lessons/book.json'
  const deepUrl = 'https://example.test/root/lessons/deep/book.json'

  const manifests: Record<string, BookManifest> = {
    [rootUrl]: {
      children: [
        { id: 'intro', name: 'Intro', py: 'intro.py' },
        { id: 'lessons', name: 'Lessons', bookLink: 'lessons/book.json' },
      ],
    },
    [lessonsUrl]: {
      children: [{ id: 'deep', name: 'Deep', bookLink: 'deep/book.json' }],
    },
    [deepUrl]: {
      children: [{ id: 'buried', name: 'Buried activity', py: 'buried.py' }],
    },
  }
  const load = async (url: string) => manifests[url]

  it('finds an activity in the root book', async () => {
    const target = await findBookTargetById(rootUrl, 'intro', load)
    expect(target).toEqual({
      kind: 'challenge',
      bookUrl: rootUrl,
      breadcrumb: [],
      sectionPath: [],
      challenge: manifests[rootUrl].children[0],
    })
  })

  it('finds an activity two sub-books deep with its breadcrumb and section path', async () => {
    const target = await findBookTargetById(rootUrl, 'buried', load)
    expect(target?.kind).toBe('challenge')
    expect(target?.bookUrl).toBe(deepUrl)
    expect(target?.breadcrumb).toEqual([
      { name: 'Lessons', bookUrl: rootUrl },
      { name: 'Deep', bookUrl: lessonsUrl },
    ])
    expect(target?.sectionPath).toEqual(['lessons', 'deep'])
  })

  it('resolves a sub-book id to that section', async () => {
    const target = await findBookTargetById(rootUrl, 'deep', load)
    expect(target).toEqual({
      kind: 'section',
      bookUrl: deepUrl,
      breadcrumb: [
        { name: 'Lessons', bookUrl: rootUrl },
        { name: 'Deep', bookUrl: lessonsUrl },
      ],
      sectionPath: ['lessons'],
    })
  })

  it('returns null for an unknown id', async () => {
    await expect(findBookTargetById(rootUrl, 'no-such-id', load)).resolves.toBeNull()
  })

  it('terminates on a cyclic book tree', async () => {
    const childUrl = 'https://example.test/root/child/book.json'
    const cyclic: Record<string, BookManifest> = {
      [rootUrl]: { children: [{ id: 'child', name: 'Child', bookLink: 'child/book.json' }] },
      [childUrl]: { children: [{ id: 'back', name: 'Back', bookLink: '../book.json' }] },
    }
    await expect(findBookTargetById(rootUrl, 'missing', async url => cyclic[url])).resolves.toBeNull()
  })

  it('takes the first match when an id is duplicated', async () => {
    const duplicated: Record<string, BookManifest> = {
      [rootUrl]: {
        children: [
          { id: 'dup', name: 'First copy', py: 'a.py' },
          { id: 'dup', name: 'Second copy', py: 'b.py' },
        ],
      },
    }
    const target = await findBookTargetById(rootUrl, 'dup', async url => duplicated[url])
    expect(target?.kind === 'challenge' && target.challenge.name).toBe('First copy')
  })
})
