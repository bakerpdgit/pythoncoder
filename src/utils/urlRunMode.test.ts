import { describe, expect, it } from 'vitest'
import { getRunModeFromSearch } from './urlRunMode'

describe('URL run mode', () => {
  it('selects Trace case-insensitively', () => {
    expect(getRunModeFromSearch('?mode=Trace')).toBe('trace')
    expect(getRunModeFromSearch('?mode=TRACE')).toBe('trace')
  })

  it('composes with an encoded learning-book URL in either parameter order', () => {
    const book = encodeURIComponent('https://example.test/Tracing/book.json')
    expect(getRunModeFromSearch(`?book=${book}&mode=Trace`)).toBe('trace')
    expect(getRunModeFromSearch(`?mode=Trace&book=${book}`)).toBe('trace')
  })

  it('supports the other button modes and safely falls back for invalid values', () => {
    expect(getRunModeFromSearch('?mode=Run')).toBe('run')
    expect(getRunModeFromSearch('?mode=Debug')).toBe('debug')
    expect(getRunModeFromSearch('?mode=unknown')).toBe('debug')
    expect(getRunModeFromSearch('', 'trace')).toBe('trace')
  })
})
