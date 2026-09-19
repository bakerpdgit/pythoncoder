import { describe, expect, it, vi } from 'vitest'
import type { BookManifest, BookNavState } from '../types'

import { findSiblingSection } from './BookPanel'

const ROOT = 'https://example.test/book/book.json'

const manifests: Record<string, BookManifest> = {
  [ROOT]: {
    name: 'Course',
    children: [
      { id: 'intro', name: 'Intro exercise', py: 'intro.py' },
      { id: 'io', name: 'Outputs and inputs', bookLink: 'io/book.json' },
      { id: 'mid', name: 'Between the sections', py: 'mid.py' },
      { id: 'sel', name: 'Selection', bookLink: 'sel/book.json' },
      { id: 'loops', name: 'Loops', bookLink: 'loops/book.json' },
    ],
  },
  'https://example.test/book/io/book.json': { name: 'Outputs and inputs', children: [] },
  'https://example.test/book/sel/book.json': { name: 'Selection', children: [] },
  'https://example.test/book/loops/book.json': { name: 'Loops', children: [] },
}

const load = async (url: string) => manifests[url]

const navStateFor = (section: 'io' | 'sel' | 'loops'): BookNavState => ({
  rootUrl: ROOT,
  currentBookUrl: `https://example.test/book/${section}/book.json`,
  // `navigateInto` records the section's own name against its parent's url.
  breadcrumb: [{ name: manifests[ROOT].children.find(c => c.id === section)!.name, bookUrl: ROOT }],
  activeChallengeId: null,
})

describe('findSiblingSection', () => {
  it('steps past activities to the next section', async () => {
    const target = await findSiblingSection(navStateFor('io'), 1, load)
    expect(target).toEqual({
      name: 'Selection',
      bookUrl: 'https://example.test/book/sel/book.json',
      breadcrumb: [{ name: 'Selection', bookUrl: ROOT }],
    })
  })

  it('steps back to the previous section', async () => {
    const target = await findSiblingSection(navStateFor('loops'), -1, load)
    expect(target?.name).toBe('Selection')
    expect(target?.bookUrl).toBe('https://example.test/book/sel/book.json')
  })

  it('has nothing before the first section or after the last', async () => {
    expect(await findSiblingSection(navStateFor('io'), -1, load)).toBeNull()
    expect(await findSiblingSection(navStateFor('loops'), 1, load)).toBeNull()
  })

  it('replaces the last crumb rather than deepening the trail', async () => {
    const nested: BookNavState = {
      rootUrl: ROOT,
      currentBookUrl: 'https://example.test/book/sel/book.json',
      breadcrumb: [
        { name: 'Unit 1', bookUrl: 'https://example.test/unit/book.json' },
        { name: 'Selection', bookUrl: ROOT },
      ],
      activeChallengeId: null,
    }
    const target = await findSiblingSection(nested, 1, load)
    expect(target?.breadcrumb).toEqual([
      { name: 'Unit 1', bookUrl: 'https://example.test/unit/book.json' },
      { name: 'Loops', bookUrl: ROOT },
    ])
  })

  it('has no siblings at the root of a book', async () => {
    const atRoot: BookNavState = {
      rootUrl: ROOT, currentBookUrl: ROOT, breadcrumb: [], activeChallengeId: null,
    }
    const loader = vi.fn(load)
    expect(await findSiblingSection(atRoot, 1, loader)).toBeNull()
    expect(loader).not.toHaveBeenCalled()
  })

  it('returns null when the parent no longer lists this section', async () => {
    const orphan: BookNavState = {
      rootUrl: ROOT,
      currentBookUrl: 'https://example.test/book/gone/book.json',
      breadcrumb: [{ name: 'Gone', bookUrl: ROOT }],
      activeChallengeId: null,
    }
    expect(await findSiblingSection(orphan, 1, load)).toBeNull()
  })
})
