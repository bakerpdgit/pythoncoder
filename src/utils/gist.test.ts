import { afterEach, describe, expect, it, vi } from 'vitest'
import { gistRawUrl, listUserGists, parseGistLocation } from './gist'

const ID = '0123456789abcdef0123456789abcdef'

afterEach(() => { vi.unstubAllGlobals() })

describe('parseGistLocation', () => {
  it('reads the address bar of a gist page', () => {
    expect(parseGistLocation(`https://gist.github.com/someone/${ID}`)).toEqual({ user: 'someone', id: ID, file: null })
    expect(parseGistLocation(`https://gist.github.com/someone/${ID}#file-main-py`)).toEqual({ user: 'someone', id: ID, file: null })
    expect(parseGistLocation(`https://gist.github.com/${ID}`)).toEqual({ user: null, id: ID, file: null })
  })

  it('reads raw addresses, pinned to a revision or not', () => {
    expect(parseGistLocation(`https://gist.githubusercontent.com/someone/${ID}/raw/main.py`))
      .toEqual({ user: 'someone', id: ID, file: 'main.py' })
    expect(parseGistLocation(`https://gist.githubusercontent.com/someone/${ID}/raw/abc123/my%20code.py`))
      .toEqual({ user: 'someone', id: ID, file: 'my code.py' })
  })

  it('refuses other addresses', () => {
    expect(parseGistLocation('https://github.com/someone/repo')).toBeNull()
    expect(parseGistLocation('https://gist.github.com/someone/not-an-id')).toBeNull()
    expect(parseGistLocation('nonsense')).toBeNull()
  })
})

describe('gistRawUrl', () => {
  it('is the unpinned address, which always serves the newest revision', () => {
    expect(gistRawUrl('someone', ID, 'my code.py'))
      .toBe(`https://gist.githubusercontent.com/someone/${ID}/raw/my%20code.py`)
  })
})

describe('listUserGists', () => {
  it('maps the API to file names', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(url).toBe('https://api.github.com/users/someone/gists?per_page=100')
      return new Response(JSON.stringify([
        { id: ID, description: 'Homework', owner: { login: 'someone' }, files: { 'main.py': { filename: 'main.py' } }, updated_at: '2026-10-01' },
        { id: 'f'.repeat(32), description: null, files: { 'a.py': { filename: 'a.py' }, 'b.txt': { filename: 'b.txt' } } },
      ]))
    }))
    expect(await listUserGists('someone', '')).toEqual([
      { id: ID, user: 'someone', description: 'Homework', files: ['main.py'], updatedAt: '2026-10-01' },
      { id: 'f'.repeat(32), user: 'someone', description: '', files: ['a.py', 'b.txt'], updatedAt: '' },
    ])
  })
})
