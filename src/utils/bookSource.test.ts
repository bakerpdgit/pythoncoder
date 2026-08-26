import { describe, expect, it } from 'vitest'
import { buildShareLink } from './bookSource'

const BOOK = 'https://raw.githubusercontent.com/bakerpdgit/funchallenges1/HEAD/book.json'
const ENCODED = encodeURIComponent(BOOK)

describe('buildShareLink', () => {
  it('matches the original single-argument form', () => {
    expect(buildShareLink(BOOK))
      .toBe(`${location.origin}${location.pathname}?book=${ENCODED}`)
  })

  it('appends an encoded challenge id', () => {
    expect(buildShareLink(BOOK, { challengeId: 'a b/c' }))
      .toBe(`${location.origin}${location.pathname}?book=${ENCODED}&challenge=a%20b%2Fc`)
  })

  it('drops showFirst once a challenge is named', () => {
    const link = buildShareLink(BOOK, { challengeId: 'intro', showFirst: true })
    expect(link).toContain('challenge=intro')
    expect(link).not.toContain('showFirst')
  })

  it('emits showFirst for a whole-book link', () => {
    expect(buildShareLink(BOOK, { showFirst: true })).toContain('&showFirst=1')
  })

  it('appends the run mode alongside a challenge', () => {
    expect(buildShareLink(BOOK, { challengeId: 'intro', mode: 'trace' }))
      .toBe(`${location.origin}${location.pathname}?book=${ENCODED}&challenge=intro&mode=trace`)
  })
})
