import { afterEach, describe, expect, it } from 'vitest'
import { clearDraft, describeDraftTime, MAX_DRAFT_LENGTH, readDraft, writeDraft } from './editorDraft'

afterEach(() => localStorage.clear())

describe('editor drafts', () => {
  it('keeps one backup per filesystem', () => {
    writeDraft('default', { path: '/main.py', content: 'print(1)', savedAt: 1 })
    writeDraft('__book__:a', { path: '/ex.py', content: 'print(2)', savedAt: 2 })
    expect(readDraft('default')).toEqual({ path: '/main.py', content: 'print(1)', savedAt: 1 })
    expect(readDraft('__book__:a')?.content).toBe('print(2)')
    clearDraft('default')
    expect(readDraft('default')).toBeNull()
    expect(readDraft('__book__:a')).not.toBeNull()
  })

  it('replaces the backup rather than keeping a second one', () => {
    writeDraft('default', { path: '/main.py', content: 'old', savedAt: 1 })
    writeDraft('default', { path: '/other.py', content: 'new', savedAt: 2 })
    expect(readDraft('default')).toEqual({ path: '/other.py', content: 'new', savedAt: 2 })
  })

  it('ignores anything that is not a backup', () => {
    localStorage.setItem('pythoncoder-draft:default', 'not json')
    expect(readDraft('default')).toBeNull()
    localStorage.setItem('pythoncoder-draft:default', JSON.stringify({ path: '/main.py' }))
    expect(readDraft('default')).toBeNull()
  })

  it('skips a file too large to be a program', () => {
    writeDraft('default', { path: '/data.py', content: 'x'.repeat(MAX_DRAFT_LENGTH + 1), savedAt: 1 })
    expect(readDraft('default')).toBeNull()
  })
})

describe('describeDraftTime', () => {
  const now = new Date(2026, 8, 30, 15, 0).getTime()

  it('says today or yesterday when it can', () => {
    expect(describeDraftTime(new Date(2026, 8, 30, 9, 5).getTime(), now)).toMatch(/^today at /)
    expect(describeDraftTime(new Date(2026, 8, 29, 23, 59).getTime(), now)).toMatch(/^yesterday at /)
  })

  it('gives the date for anything older', () => {
    expect(describeDraftTime(new Date(2026, 8, 20, 9, 5).getTime(), now)).toMatch(/^on .*2026 at /)
  })
})
