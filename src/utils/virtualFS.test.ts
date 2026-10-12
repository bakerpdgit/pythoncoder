import { describe, expect, it } from 'vitest'
import { ancestorFolderPaths, copiesIntoItself, joinVfsPath, planEntryCopy, planOrphanRepair } from './virtualFS'

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

describe('planEntryCopy', () => {
  const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer
  const entry = (path: string, type: 'file' | 'folder' = 'file', text = '') => ({
    id: path, fsId: 'src', path, type, name: path.slice(path.lastIndexOf('/') + 1),
    parentPath: path.slice(0, path.lastIndexOf('/')) || '/', modifiedAt: 0,
    content: type === 'file' ? bytes(text) : undefined, mimeType: type === 'file' ? 'text/x-python' : undefined,
  })
  const entries = [
    entry('/main.py', 'file', 'print(1)'),
    entry('/game', 'folder'),
    entry('/game/sprites', 'folder'),
    entry('/game/sprites/hero.txt', 'file', 'H'),
    entry('/game/run.py', 'file', 'run'),
    entry('/gamebook.py', 'file', 'not in the folder'),
  ]

  it('copies one file to its new path, content and type kept', () => {
    const plan = planEntryCopy(entries, '/main.py', '/backup/main copy.py')
    expect(plan.map(p => p.path)).toEqual(['/backup/main copy.py'])
    expect(new TextDecoder().decode(plan[0].content)).toBe('print(1)')
    expect(plan[0].mimeType).toBe('text/x-python')
  })

  it('copies a folder with everything beneath it, folders before their files', () => {
    const plan = planEntryCopy(entries, '/game', '/old/game')
    expect(plan.map(p => `${p.type}:${p.path}`)).toEqual([
      'folder:/old/game',
      'file:/old/game/run.py',
      'folder:/old/game/sprites',
      'file:/old/game/sprites/hero.txt',
    ])
  })

  it('does not take a sibling whose name merely starts the same', () => {
    expect(planEntryCopy(entries, '/game', '/g2').some(p => p.path.includes('gamebook'))).toBe(false)
  })

  it('has nothing to copy for a path that is not there', () => {
    expect(planEntryCopy(entries, '/missing.py', '/x.py')).toEqual([])
  })
})

describe('copiesIntoItself', () => {
  it('refuses a folder copied inside itself, but not beside it', () => {
    expect(copiesIntoItself('/game', '/game/game')).toBe(true)
    expect(copiesIntoItself('/game', '/game copy')).toBe(false)
    expect(copiesIntoItself('/game', '/gamebook/game')).toBe(false)
  })
})

describe('joinVfsPath', () => {
  it('joins without doubling the root slash', () => {
    expect(joinVfsPath('/', 'a.py')).toBe('/a.py')
    expect(joinVfsPath('/data', 'a.py')).toBe('/data/a.py')
  })
})
