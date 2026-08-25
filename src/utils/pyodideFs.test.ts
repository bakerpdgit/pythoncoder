import { describe, expect, it } from 'vitest'

import { PYODIDE_SYSTEM_DIRS, pyodideSkipDirs } from './pyodideFs'

describe('pyodideSkipDirs', () => {
  it('skips every Pyodide-owned directory when the user mounted nothing there', () => {
    const skip = pyodideSkipDirs(['/main.py', '/data/numbers.txt'])
    for (const dir of PYODIDE_SYSTEM_DIRS) expect(skip.has(dir)).toBe(true)
  })

  // The 2 MB /lib/python313.zip is what used to land in every downloaded zip.
  it('skips the standard library directory', () => {
    expect(pyodideSkipDirs(['/main.py']).has('/lib')).toBe(true)
  })

  it('leaves user directories alone', () => {
    const skip = pyodideSkipDirs(['/main.py'])
    for (const dir of ['/data', '/images', '/main.py', '/sounds']) {
      expect(skip.has(dir)).toBe(false)
    }
  })

  // A learning book is free to contain a folder called `lib` or `home`.
  it('keeps a system-named directory that the user actually mounted files into', () => {
    const skip = pyodideSkipDirs(['/main.py', '/lib/helpers.py'])
    expect(skip.has('/lib')).toBe(false)
    expect(skip.has('/home')).toBe(true)
  })

  it('handles mounted paths given without a leading slash', () => {
    expect(pyodideSkipDirs(['lib/helpers.py']).has('/lib')).toBe(false)
  })

  it('skips everything when nothing is mounted', () => {
    expect(pyodideSkipDirs([]).size).toBe(PYODIDE_SYSTEM_DIRS.length)
  })

  it('does not let a deep user path unlock an unrelated system directory', () => {
    const skip = pyodideSkipDirs(['/data/lib/thing.py'])
    expect(skip.has('/lib')).toBe(true)
    expect(skip.has('/data')).toBe(false)
  })
})
