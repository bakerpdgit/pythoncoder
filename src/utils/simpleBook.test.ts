import { describe, expect, it } from 'vitest'
import {
  buildSimpleBookManifest, isSimpleBookFileUrl, isSimpleBookUrl, readSimpleBookActivities,
  simpleBookFileUrl, simpleBookIdPrefix, simpleBookRootUrl, simpleBookSource,
} from './simpleBook'
import type { BookChallenge } from '../types'

const REPO = 'https://github.com/perse-cs/girlscodingclub2627'

describe('readSimpleBookActivities', () => {
  it('reads a folder of exercises, guides and shared files', () => {
    const activities = readSimpleBookActivities([
      'challenge01.py', 'challenge01.txt', 'challenge01_data.txt',
      'challenge02.py',
      'challenge03.py', 'challenge03.txt',
    ])
    expect(activities.map(a => a.stem)).toEqual(['challenge01', 'challenge02', 'challenge03'])
    expect(activities[0].guideName).toBe('challenge01.txt')
    expect(activities[0].additional).toEqual([{ sourceName: 'challenge01_data.txt', mountAs: 'data.txt' }])
    expect(activities[1].guideName).toBeUndefined()
    expect(activities[1].additional).toEqual([])
  })

  it('orders activities by name, counting numbers rather than digits', () => {
    const activities = readSimpleBookActivities(['challenge10.py', 'challenge2.py', 'challenge1.py'])
    expect(activities.map(a => a.stem)).toEqual(['challenge1', 'challenge2', 'challenge10'])
  })

  it('treats a .py extending another activity as that activity’s module', () => {
    const activities = readSimpleBookActivities(['challenge01.py', 'challenge01_utils.py'])
    expect(activities.map(a => a.stem)).toEqual(['challenge01'])
    expect(activities[0].additional).toEqual([{ sourceName: 'challenge01_utils.py', mountAs: 'utils.py' }])
  })

  it('keeps an underscored .py that no activity claims', () => {
    const activities = readSimpleBookActivities(['solo_task.py'])
    expect(activities.map(a => a.stem)).toEqual(['solo_task'])
  })

  it('gives a shared file to the most specific activity that could claim it', () => {
    const activities = readSimpleBookActivities(['week.py', 'week_one.py', 'week_one_data.csv'])
    // week_one.py is week's module, so week owns the data file at its full name.
    expect(activities.map(a => a.stem)).toEqual(['week'])
    expect(activities[0].additional.map(f => f.mountAs).sort()).toEqual(['one.py', 'one_data.csv'])
  })

  it('ignores subfolders and files that belong to nothing', () => {
    const activities = readSimpleBookActivities([
      'challenge01.py', 'notes.txt', 'README.md', 'extras/challenge99.py',
    ])
    expect(activities.map(a => a.stem)).toEqual(['challenge01'])
    expect(activities[0].additional).toEqual([])
  })

  it('finds nothing in a folder with no Python in it', () => {
    expect(readSimpleBookActivities(['book.json', 'guide.md'])).toEqual([])
  })
})

describe('buildSimpleBookManifest', () => {
  const manifest = buildSimpleBookManifest(
    ['challenge01.py', 'challenge01.txt', 'challenge01_data.txt', 'challenge02.py'],
    { source: REPO, name: 'girlscodingclub2627' })
  const first = manifest.children[0] as BookChallenge

  it('titles an activity after its file, without the extension', () => {
    expect(manifest.children.map(child => (child as BookChallenge).name))
      .toEqual(['challenge01', 'challenge02'])
  })

  it('mounts a shared file under its stripped name, fetched from the prefixed one', () => {
    expect(first.additionalFiles).toEqual([
      { filename: 'data.txt', visible: true, source: 'challenge01_data.txt' },
    ])
  })

  it('makes every activity an example, since nothing here can declare a test', () => {
    for (const child of manifest.children) {
      expect((child as BookChallenge).isExample).toBe(true)
      expect((child as BookChallenge).tests).toBeUndefined()
    }
  })

  it('keeps ids stable for a source but distinct between two folders', () => {
    const again = buildSimpleBookManifest(['challenge01.py'], { source: REPO, name: 'x' })
    const elsewhere = buildSimpleBookManifest(['challenge01.py'], { source: `${REPO}/tree/main/week2`, name: 'x' })
    expect((again.children[0] as BookChallenge).id).toBe(first.id)
    expect((elsewhere.children[0] as BookChallenge).id).not.toBe(first.id)
  })

  it('prefixes ids so they cannot collide with another book’s', () => {
    expect(first.id.startsWith(simpleBookIdPrefix(REPO))).toBe(true)
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
    const fileUrl = simpleBookFileUrl(simpleBookRootUrl(REPO), 'challenge01.py')
    expect(isSimpleBookFileUrl(fileUrl)).toBe(true)
    expect(simpleBookSource(fileUrl)).toBe(REPO)
    expect(fileUrl.endsWith('#challenge01.py')).toBe(true)
  })

  it('resolves a file against a file URL, not on top of it', () => {
    const fileUrl = simpleBookFileUrl(simpleBookRootUrl(REPO), 'challenge01.py')
    expect(simpleBookFileUrl(fileUrl, 'challenge02.py')).toBe(`${simpleBookRootUrl(REPO)}#challenge02.py`)
  })

  it('reads a vfs source as well as a web one', () => {
    const root = simpleBookRootUrl('vfs://fs:abc123')
    expect(simpleBookSource(root)).toBe('vfs://fs:abc123')
  })
})
