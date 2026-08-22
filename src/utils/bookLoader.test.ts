import { describe, expect, it } from 'vitest'
import type { BookManifest } from '../types'
import { findFirstBookChallenge } from './bookLoader'

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
