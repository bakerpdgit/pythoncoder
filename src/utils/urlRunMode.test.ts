import { describe, expect, it } from 'vitest'
import { getRunModeFromSearch, getShowFirstFromSearch } from './urlRunMode'

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

describe('URL first learning-book example', () => {
  it('supports a bare or explicitly enabled showFirst flag', () => {
    expect(getShowFirstFromSearch('?showFirst')).toBe(true)
    expect(getShowFirstFromSearch('?showFirst=true')).toBe(true)
    expect(getShowFirstFromSearch('?showFirst=1')).toBe(true)
    expect(getShowFirstFromSearch('?showFirst=yes')).toBe(true)
  })

  it('composes with book and Trace mode parameters', () => {
    const book = encodeURIComponent('https://example.test/Tracing/book.json')
    const search = `?book=${book}&mode=Trace&showFirst=true`
    expect(getShowFirstFromSearch(search)).toBe(true)
    expect(getRunModeFromSearch(search)).toBe('trace')
  })

  it('remains disabled when omitted or explicitly false', () => {
    expect(getShowFirstFromSearch('?mode=Trace')).toBe(false)
    expect(getShowFirstFromSearch('?showFirst=false')).toBe(false)
    expect(getShowFirstFromSearch('?showFirst=0')).toBe(false)
  })
})
