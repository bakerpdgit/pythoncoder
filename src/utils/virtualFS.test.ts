import { describe, expect, it } from 'vitest'
import { ancestorFolderPaths, planOrphanRepair } from './virtualFS'

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

describe('planOrphanRepair', () => {
  const entry = (fsId: string, path: string, type: 'file' | 'folder' = 'file') => ({
    id: `${fsId}${path}`, fsId, path, type, name: path.slice(path.lastIndexOf('/') + 1),
    parentPath: path.slice(0, path.lastIndexOf('/')) || '/', modifiedAt: 0,
  })

  it('deletes Pyodide files swept in without their folder, and reveals the user\'s', () => {
    const plan = planOrphanRepair([
      entry('default', '/main.py'),
      entry('default', '/lib/python313.zip'),
      entry('default', '/data/scores.txt'),
      entry('other', '/data', 'folder'),
      entry('other', '/data/scores.txt'),
    ])
    expect(plan.remove.map(e => e.path)).toEqual(['/lib/python313.zip'])
    expect(plan.reveal.map(e => `${e.fsId}${e.path}`)).toEqual(['default/data/scores.txt'])
  })

  it('leaves a lib folder the user really has alone', () => {
    const plan = planOrphanRepair([entry('book', '/lib', 'folder'), entry('book', '/lib/helpers.py')])
    expect(plan).toEqual({ remove: [], reveal: [] })
  })
})
