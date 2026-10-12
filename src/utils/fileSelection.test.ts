import { describe, expect, it } from 'vitest'
import {
  EMPTY_SELECTION, clickSelection, isWithin, nudgeInside, pruneSelection, selectionFiles,
} from './fileSelection'

const order = ['a', 'b', 'c', 'd', 'e']
const ids = (s: { ids: ReadonlySet<string> }) => [...s.ids].sort()

describe('clickSelection', () => {
  it('a plain click selects that one alone and becomes the anchor', () => {
    const s = clickSelection({ ids: new Set(['a', 'c']), anchor: 'a' }, order, 'd', {})
    expect(ids(s)).toEqual(['d'])
    expect(s.anchor).toBe('d')
  })

  it('Ctrl+click adds and removes, moving the anchor', () => {
    let s = clickSelection(EMPTY_SELECTION, order, 'b', {})
    s = clickSelection(s, order, 'd', { ctrl: true })
    expect(ids(s)).toEqual(['b', 'd'])
    s = clickSelection(s, order, 'b', { ctrl: true })
    expect(ids(s)).toEqual(['d'])
    expect(s.anchor).toBe('b')
  })

  it('Shift+click selects the run from the anchor, either way, and keeps the anchor', () => {
    let s = clickSelection(EMPTY_SELECTION, order, 'b', {})
    s = clickSelection(s, order, 'd', { shift: true })
    expect(ids(s)).toEqual(['b', 'c', 'd'])
    expect(s.anchor).toBe('b')
    // A second Shift+click re-measures from the same anchor, as Explorer does.
    s = clickSelection(s, order, 'a', { shift: true })
    expect(ids(s)).toEqual(['a', 'b'])
  })

  it('Ctrl+Shift adds the run to what is already selected', () => {
    let s = clickSelection(EMPTY_SELECTION, order, 'a', {})
    s = clickSelection(s, order, 'd', { ctrl: true })
    s = clickSelection(s, order, 'e', { ctrl: true, shift: true })
    expect(ids(s)).toEqual(['a', 'd', 'e'])
  })

  it('Shift+click with no anchor (or a vanished one) selects just the target', () => {
    expect(ids(clickSelection(EMPTY_SELECTION, order, 'c', { shift: true }))).toEqual(['c'])
    expect(ids(clickSelection({ ids: new Set(['x']), anchor: 'x' }, order, 'c', { shift: true }))).toEqual(['c'])
  })
})

describe('pruneSelection', () => {
  it('drops ids no longer listed, and an anchor that went with them', () => {
    const s = pruneSelection({ ids: new Set(['a', 'x']), anchor: 'x' }, order)
    expect(ids(s)).toEqual(['a'])
    expect(s.anchor).toBeNull()
  })

  it('returns the same object when nothing changed, so state does not churn', () => {
    const s = { ids: new Set(['a', 'b']), anchor: 'a' }
    expect(pruneSelection(s, order)).toBe(s)
  })
})

describe('isWithin', () => {
  it('matches a root and what is inside it, not a sibling sharing its prefix', () => {
    expect(isWithin('/data', ['/data'])).toBe(true)
    expect(isWithin('/data/x.csv', ['/data'])).toBe(true)
    expect(isWithin('/data2/x.csv', ['/data'])).toBe(false)
    expect(isWithin('/anything', ['/'])).toBe(true)
  })
})

describe('selectionFiles', () => {
  const buf = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer
  const files: [string, ArrayBuffer][] = [
    ['/main.py', buf('m')],
    ['/proj/a.py', buf('a')],
    ['/proj/data/x.csv', buf('x')],
    ['/proj/data2/y.csv', buf('y')],
    ['/proj/b.py', buf('b')],
  ]

  it('takes the selected files and everything inside selected folders, re-rooted at their folder', () => {
    const out = selectionFiles(files, ['/proj/a.py', '/proj/data'], '/proj')
    expect([...out.keys()].sort()).toEqual(['/a.py', '/data/x.csv'])
  })

  it('leaves paths alone when the selection is at the root', () => {
    const out = selectionFiles(files, ['/main.py'], '/')
    expect([...out.keys()]).toEqual(['/main.py'])
  })
})

describe('nudgeInside', () => {
  const bounds = { left: 10, top: 0, right: 210, bottom: 400 }

  it('leaves a box that fits where it is', () => {
    expect(nudgeInside({ left: 50, top: 20, right: 170, bottom: 80 }, bounds)).toEqual({ dx: 0, dy: 0 })
  })

  it('moves a right-aligned menu that spills off the left edge back inside', () => {
    expect(nudgeInside({ left: -30, top: 20, right: 90, bottom: 80 }, bounds)).toEqual({ dx: 44, dy: 0 })
  })

  it('moves a context menu that spills off the bottom right up and left', () => {
    expect(nudgeInside({ left: 150, top: 350, right: 290, bottom: 500 }, bounds)).toEqual({ dx: -84, dy: -104 })
  })

  it('keeps the left edge visible when the box is wider than the space', () => {
    expect(nudgeInside({ left: 0, top: 0, right: 300, bottom: 50 }, bounds, 0).dx).toBe(10)
  })
})
