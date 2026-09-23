import { describe, expect, it } from 'vitest'
import { ancestorFolderPaths } from './virtualFS'

describe('ancestorFolderPaths', () => {
  it('lists every folder above a nested file, outermost first', () => {
    expect(ancestorFolderPaths('/a/b/c.txt')).toEqual(['/a', '/a/b'])
  })

  it('has none for a file at the root', () => {
    expect(ancestorFolderPaths('/main.py')).toEqual([])
  })

  it('ignores doubled or missing slashes', () => {
    expect(ancestorFolderPaths('data//stations.csv')).toEqual(['/data'])
  })
})
