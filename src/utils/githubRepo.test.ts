import { describe, expect, it } from 'vitest'
import {
  gitHubLocationLabel, gitHubLocationUrl, gitHubParentPath, gitHubRawUrl, isBookFileName,
  parseGitHubLocation,
} from './githubRepo'

describe('parseGitHubLocation', () => {
  it('reads a bare repository address — the thing teachers actually paste', () => {
    expect(parseGitHubLocation('https://github.com/perse-cs/girlscodingclub2627')).toEqual({
      owner: 'perse-cs', repo: 'girlscodingclub2627', branch: null, path: '', isFile: false,
    })
  })

  it('reads a folder inside a repository', () => {
    expect(parseGitHubLocation('https://github.com/perse-cs/club/tree/main/week1/starters')).toEqual({
      owner: 'perse-cs', repo: 'club', branch: 'main', path: 'week1/starters', isFile: false,
    })
  })

  it('reads a file address as a file', () => {
    expect(parseGitHubLocation('https://github.com/o/r/blob/main/books/book.json')).toEqual({
      owner: 'o', repo: 'r', branch: 'main', path: 'books/book.json', isFile: true,
    })
    expect(parseGitHubLocation('https://raw.githubusercontent.com/o/r/main/book.json')).toEqual({
      owner: 'o', repo: 'r', branch: 'main', path: 'book.json', isFile: true,
    })
  })

  it('tolerates a trailing .git and a trailing slash', () => {
    expect(parseGitHubLocation('https://github.com/o/r.git/')).toMatchObject({ repo: 'r', path: '' })
  })

  it('is null for anything that is not GitHub', () => {
    expect(parseGitHubLocation('https://example.com/book.json')).toBeNull()
    expect(parseGitHubLocation('not a url')).toBeNull()
    expect(parseGitHubLocation('https://github.com/onlyanowner')).toBeNull()
  })
})

describe('addresses built from a location', () => {
  const loc = parseGitHubLocation('https://github.com/o/r/tree/main/week1')!

  it('fetches files from raw, which sends CORS and skips the CDN cache', () => {
    expect(gitHubRawUrl(loc, 'week1/challenge01.py'))
      .toBe('https://raw.githubusercontent.com/o/r/main/week1/challenge01.py')
  })

  it('addresses a folder back on github.com, which is what a link points at', () => {
    expect(gitHubLocationUrl(loc)).toBe('https://github.com/o/r/tree/main/week1')
    expect(gitHubLocationUrl({ ...loc, path: '' })).toBe('https://github.com/o/r/tree/main')
  })

  it('labels a location by repo and path', () => {
    expect(gitHubLocationLabel(loc)).toBe('o/r/week1')
    expect(gitHubLocationLabel({ ...loc, path: '' })).toBe('o/r')
  })

  it('walks back up out of a folder', () => {
    expect(gitHubParentPath('week1/starters')).toBe('week1')
    expect(gitHubParentPath('week1')).toBe('')
    expect(gitHubParentPath('')).toBe('')
  })
})

describe('isBookFileName', () => {
  it('accepts the two things a book can be opened from', () => {
    expect(isBookFileName('book.json')).toBe(true)
    expect(isBookFileName('BOOK.JSON')).toBe(true)
    // Matched the same way isBookUrl routes it, so nothing is offered here
    // that the book loader would then decline to read as a manifest.
    expect(isBookFileName('week1-book.json')).toBe(true)
    expect(isBookFileName('tutorial4.zip')).toBe(true)
  })

  it('rejects everything else, so a repo address cannot pass for a book', () => {
    expect(isBookFileName('README.md')).toBe(false)
    expect(isBookFileName('challenge01.py')).toBe(false)
    expect(isBookFileName('booklet.json')).toBe(false)
  })
})
