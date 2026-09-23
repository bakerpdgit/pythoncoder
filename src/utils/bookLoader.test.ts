import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookManifest } from '../types'

const listFilesystems = vi.fn<() => Promise<Array<{ id: string; name: string }>>>()
const deleteFilesystem = vi.fn<(id: string) => Promise<void>>()

vi.mock('./virtualFS', () => ({
  listFilesystems: () => listFilesystems(),
  deleteFilesystem: (id: string) => deleteFilesystem(id),
  createFilesystem: vi.fn(),
  writeFile: vi.fn(),
  guessMimeType: vi.fn(),
  getEntryByPath: vi.fn(),
}))

import {
  bookFileBaseUrls, collectBookChallengeIds, collectBookProgressIds, deleteChallengeFilesystems,
  findBookTargetById, findFirstBookChallenge, foldersHoldingOnlyHidden, isChallengeFsName,
} from './bookLoader'

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

describe('bookFileBaseUrls', () => {
  it('walks from the sub-book up to the root book directory', () => {
    // Tutorial 4: `lists/book.json` declares a bare "fp_utils.py" that actually
    // lives beside the root book.json.
    expect(bookFileBaseUrls(
      'https://example.test/t4/lists/book.json',
      'https://example.test/t4/book.json',
    )).toEqual([
      'https://example.test/t4/lists/',
      'https://example.test/t4/',
    ])
  })

  it('includes every level of a deeply nested book', () => {
    expect(bookFileBaseUrls(
      'https://example.test/t4/a/b/c/book.json',
      'https://example.test/t4/book.json',
    )).toEqual([
      'https://example.test/t4/a/b/c/',
      'https://example.test/t4/a/b/',
      'https://example.test/t4/a/',
      'https://example.test/t4/',
    ])
  })

  it('walks a book unzipped into the virtual filesystem the same way', () => {
    expect(bookFileBaseUrls(
      'vfs://fs:abc123/lists/book.json',
      'vfs://fs:abc123/book.json',
    )).toEqual([
      'vfs://fs:abc123/lists/',
      'vfs://fs:abc123/',
    ])
  })

  it('is just the book directory for a root-level book', () => {
    const root = 'https://example.test/t4/book.json'
    expect(bookFileBaseUrls(root, root)).toEqual(['https://example.test/t4/'])
  })

  it('never climbs out of the root book', () => {
    // A sub-book hosted somewhere else entirely gets no fallback at all, so a
    // missing file can never be answered by an unrelated directory.
    expect(bookFileBaseUrls(
      'https://elsewhere.test/other/book.json',
      'https://example.test/t4/book.json',
    )).toEqual(['https://elsewhere.test/other/'])

    expect(bookFileBaseUrls('https://example.test/t4/lists/book.json', null))
      .toEqual(['https://example.test/t4/lists/'])
  })
})

describe('collectBookChallengeIds', () => {
  const rootUrl = 'https://example.test/root/book.json'
  const lessonsUrl = 'https://example.test/root/lessons/book.json'

  it('collects every activity in the tree in book order', async () => {
    const manifests: Record<string, BookManifest> = {
      [rootUrl]: {
        children: [
          { id: 'intro', name: 'Intro', py: 'intro.py' },
          { id: 'lessons', name: 'Lessons', bookLink: 'lessons/book.json' },
          { id: 'outro', name: 'Outro', py: 'outro.py' },
        ],
      },
      [lessonsUrl]: {
        children: [
          { id: 'one', name: 'One', py: 'one.py' },
          { id: 'two', name: 'Two', py: 'two.py' },
        ],
      },
    }
    await expect(collectBookChallengeIds(rootUrl, async url => manifests[url]))
      .resolves.toEqual(['intro', 'one', 'two', 'outro'])
  })

  it('keeps the rest of the book when a sub-book fails to load, and ends on a cycle', async () => {
    const brokenUrl = 'https://example.test/root/broken/book.json'
    const manifests: Record<string, BookManifest> = {
      [rootUrl]: {
        children: [
          { id: 'intro', name: 'Intro', py: 'intro.py' },
          { id: 'broken', name: 'Broken', bookLink: 'broken/book.json' },
          { id: 'lessons', name: 'Lessons', bookLink: 'lessons/book.json' },
        ],
      },
      [lessonsUrl]: {
        children: [{ id: 'back', name: 'Back to the root', bookLink: '../book.json' }],
      },
    }
    await expect(collectBookChallengeIds(rootUrl, async url => {
      if (url === brokenUrl) throw new Error('404')
      return manifests[url]
    })).resolves.toEqual(['intro'])
  })
})

describe('deleteChallengeFilesystems', () => {
  beforeEach(() => {
    listFilesystems.mockReset()
    deleteFilesystem.mockReset()
    deleteFilesystem.mockResolvedValue(undefined)
  })

  it('matches a challenge filesystem with or without its display name', () => {
    expect(isChallengeFsName('__book__:keyboard', 'keyboard')).toBe(true)
    expect(isChallengeFsName('__book__:keyboard:Taking control', 'keyboard')).toBe(true)
    expect(isChallengeFsName('__book__:keyboard-2', 'keyboard')).toBe(false)
    expect(isChallengeFsName('default', 'keyboard')).toBe(false)
  })

  it('deletes only the named activities and never an unrelated filesystem', async () => {
    listFilesystems.mockResolvedValue([
      { id: 'fs-default', name: 'default' },
      { id: 'fs-a', name: '__book__:alpha:Alpha activity' },
      { id: 'fs-b', name: '__book__:beta' },
      { id: 'fs-other', name: '__book__:gamma:Another book' },
      { id: 'fs-near', name: '__book__:alpha-two:Not alpha' },
    ])

    await expect(deleteChallengeFilesystems(['alpha', 'beta'])).resolves.toBe(2)
    expect(deleteFilesystem.mock.calls.map(c => c[0]).sort()).toEqual(['fs-a', 'fs-b'])
  })

  it('does nothing for an empty book', async () => {
    await expect(deleteChallengeFilesystems([])).resolves.toBe(0)
    expect(listFilesystems).not.toHaveBeenCalled()
  })
})

describe('collectBookProgressIds', () => {
  const manifests: Record<string, BookManifest> = {
    'https://example.test/root/book.json': {
      children: [
        { id: 'warmup', name: 'Warm up', py: 'warmup.py' },
        { id: 'io', name: 'Outputs and inputs', bookLink: 'io/book.json' },
        { id: 'loops', name: 'Loops', bookLink: 'loops/book.json' },
      ],
    },
    'https://example.test/root/io/book.json': {
      children: [
        { id: 'io-1', name: 'Ex. 1', py: 'a.py' },
        { id: 'io-2', name: 'Ex. 2', py: 'b.py' },
      ],
    },
    'https://example.test/root/loops/book.json': {
      children: [
        { id: 'loops-1', name: 'Ex. 1', py: 'c.py' },
        { id: 'deeper', name: 'While loops', bookLink: 'while/book.json' },
      ],
    },
    'https://example.test/root/loops/while/book.json': {
      children: [{ id: 'while-1', name: 'Ex. 1', py: 'd.py' }],
    },
  }

  it('splits a tree by section and totals the whole book', async () => {
    const progress = await collectBookProgressIds(
      'https://example.test/root/book.json',
      async url => manifests[url],
    )

    expect(progress.byChild).toEqual({
      '1-io': ['io-1', 'io-2'],
      '2-loops': ['loops-1', 'while-1'],
    })
    // Book order, with each section's activities where the section sits.
    expect(progress.ids).toEqual(['warmup', 'io-1', 'io-2', 'loops-1', 'while-1'])
  })

  it('keys sections by position so a repeated id stays its own row', async () => {
    const repeated: Record<string, BookManifest> = {
      'https://example.test/r/book.json': {
        children: [
          { id: 'part', name: 'Part one', bookLink: 'one/book.json' },
          { id: 'part', name: 'Part two', bookLink: 'two/book.json' },
        ],
      },
      'https://example.test/r/one/book.json': { children: [{ id: 'a', name: 'A', py: 'a.py' }] },
      'https://example.test/r/two/book.json': { children: [{ id: 'b', name: 'B', py: 'b.py' }] },
    }

    const progress = await collectBookProgressIds(
      'https://example.test/r/book.json',
      async url => repeated[url],
    )

    expect(progress.byChild).toEqual({ '0-part': ['a'], '1-part': ['b'] })
  })

  it('counts a section that fails to load as empty rather than losing the book', async () => {
    const progress = await collectBookProgressIds(
      'https://example.test/root/book.json',
      async url => {
        if (url === 'https://example.test/root/io/book.json') throw new Error('404')
        return manifests[url]
      },
    )

    expect(progress.byChild['1-io']).toEqual([])
    expect(progress.ids).toEqual(['warmup', 'loops-1', 'while-1'])
  })

  it('refuses a section that points back at a book above it', async () => {
    const cyclic: Record<string, BookManifest> = {
      'https://example.test/c/book.json': {
        children: [{ id: 'sec', name: 'Section', bookLink: 'sec/book.json' }],
      },
      'https://example.test/c/sec/book.json': {
        children: [
          { id: 'only', name: 'Only', py: 'only.py' },
          { id: 'back', name: 'Back to the top', bookLink: '../book.json' },
        ],
      },
    }

    const progress = await collectBookProgressIds(
      'https://example.test/c/book.json',
      async url => cyclic[url],
    )

    expect(progress.ids).toEqual(['only'])
  })

  it('reports nothing for a book that cannot be loaded at all', async () => {
    const progress = await collectBookProgressIds(
      'https://example.test/missing/book.json',
      async () => { throw new Error('404') },
    )

    expect(progress).toEqual({ ids: [], byChild: {} })
  })
})

describe('foldersHoldingOnlyHidden', () => {
  it('hides a folder whose only file is hidden', () => {
    expect(foldersHoldingOnlyHidden(
      ['/main.py', '/instance/database.db', '/data/stations.csv'],
      ['/instance/database.db'],
    )).toEqual(['/instance'])
  })

  it('keeps a folder that still has a visible file in it', () => {
    expect(foldersHoldingOnlyHidden(
      ['/main.py', '/data/answers.txt', '/data/stations.csv'],
      ['/data/answers.txt'],
    )).toEqual([])
  })

  it('works through nested folders, keeping a parent with visible files further down', () => {
    expect(foldersHoldingOnlyHidden(
      ['/main.py', '/assets/images/secret.png', '/assets/sounds/beep.wav'],
      ['/assets/images/secret.png'],
    )).toEqual(['/assets/images'])
  })

  it('hides nothing for hidden files at the top level', () => {
    expect(foldersHoldingOnlyHidden(['/main.py', '/answer.py'], ['/answer.py'])).toEqual([])
  })

  it('does not treat a folder name that is only a prefix as a parent', () => {
    expect(foldersHoldingOnlyHidden(
      ['/data/x.csv', '/data2/y.csv'],
      ['/data/x.csv'],
    )).toEqual(['/data'])
  })
})
