// ── What filesystems are called ─────────────────────────────────────────────
//
// A filesystem's name is what the student sees in the File System panel. Some
// names are not for people: book activities (`__book__:`), book sources being
// edited (`__booksrc__:`), and — from before filesystems carried their source
// separately — the full address of whatever they were loaded from.

import type { VFSFilesystem } from '../types'

const RESERVED_PREFIXES = ['__book__:', '__booksrc__:', '__temp__']

/** Why a name cannot be used for a new filesystem, or null when it can. */
export function validateFilesystemName(name: string, existingNames: Iterable<string>): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Give it a name.'
  if (trimmed.length > 80) return 'That name is too long (80 characters at most).'
  if (RESERVED_PREFIXES.some(prefix => trimmed.startsWith(prefix))) return 'That name is reserved by Coder.'
  const lower = trimmed.toLowerCase()
  for (const existing of existingNames) {
    if (existing.trim().toLowerCase() === lower) return 'You already have a filesystem with that name.'
  }
  return null
}

/** `base`, or `base (2)`, `base (3)`, … — the first one not already taken. */
export function uniqueFilesystemName(base: string, existingNames: Iterable<string>): string {
  const taken = new Set([...existingNames].map(n => n.trim().toLowerCase()))
  const clean = base.trim() || 'Shared code'
  if (!taken.has(clean.toLowerCase())) return clean
  for (let i = 2; ; i++) {
    const candidate = `${clean} (${i})`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

/** The last meaningful part of an address: a repo, a folder, a file. */
export function addressLabel(url: string): string {
  try {
    const parsed = new URL(url)
    if (/(^|\.)google\.com$/.test(parsed.hostname)) return 'Google Drive file'
    const parts = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    // github.com/owner/repo/tree/branch/… — skip the tree/branch noise.
    const tree = parts.indexOf('tree')
    const meaningful = tree > 1 && parts.length > tree + 2 ? parts.slice(tree + 2) : tree > 1 ? parts.slice(0, tree) : parts
    return meaningful[meaningful.length - 1] ?? parsed.hostname
  } catch {
    return url
  }
}

/** What the panel shows for a filesystem. */
export function filesystemLabel(fs: Pick<VFSFilesystem, 'name' | 'temporary'>): string {
  const name = /^https?:\/\//i.test(fs.name) ? addressLabel(fs.name) : fs.name
  return fs.temporary ? `${name} (temporary)` : name
}
