import { describe, expect, it } from 'vitest'
import { addressLabel, filesystemLabel, uniqueFilesystemName, validateFilesystemName } from './filesystemNames'

describe('validateFilesystemName', () => {
  const existing = ['Default', 'My Game', '__book__:abc']
  it('accepts a fresh name', () => expect(validateFilesystemName('Homework', existing)).toBeNull())
  it('refuses an empty one', () => expect(validateFilesystemName('   ', existing)).toMatch(/name/))
  it('refuses one that exists, ignoring case and spaces', () =>
    expect(validateFilesystemName(' my game ', existing)).toMatch(/already/))
  it('refuses reserved prefixes', () => {
    expect(validateFilesystemName('__book__:x', existing)).toMatch(/reserved/)
    expect(validateFilesystemName('__booksrc__:x', existing)).toMatch(/reserved/)
  })
})

describe('uniqueFilesystemName', () => {
  it('numbers a taken name', () => {
    expect(uniqueFilesystemName('main', ['Default'])).toBe('main')
    expect(uniqueFilesystemName('main', ['main', 'Main (2)'])).toBe('main (3)')
  })
})

describe('labels', () => {
  it('names an address after its last meaningful part', () => {
    expect(addressLabel('https://github.com/me/project')).toBe('project')
    expect(addressLabel('https://github.com/me/project/tree/main/week1')).toBe('week1')
    expect(addressLabel('https://gist.githubusercontent.com/me/abc/raw/game.py')).toBe('game.py')
    expect(addressLabel('https://drive.google.com/uc?export=download&id=1')).toBe('Google Drive file')
  })

  it('shows old URL-named filesystems readably, and marks temporary ones', () => {
    expect(filesystemLabel({ name: 'https://x.test/files/project.zip' })).toBe('project.zip')
    expect(filesystemLabel({ name: 'main.py', temporary: { session: 's' } })).toBe('main.py (temporary)')
  })
})
