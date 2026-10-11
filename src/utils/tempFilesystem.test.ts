import { describe, expect, it } from 'vitest'
import { STALE_AFTER_MS, staleTemporaryFilesystems } from './tempFilesystem'

const fs = (id: string, session?: string) => ({ id, name: id, createdAt: 0, ...(session ? { temporary: { session } } : {}) })

describe('staleTemporaryFilesystems', () => {
  const now = 1_000_000
  it('keeps this tab\'s own, live tabs\' and ordinary filesystems', () => {
    const result = staleTemporaryFilesystems(
      [fs('plain'), fs('mine', 'me'), fs('live', 'other'), fs('gone', 'closed'), fs('never', 'unknown')],
      { me: now - STALE_AFTER_MS * 5, other: now - 1000, closed: now - STALE_AFTER_MS - 1 },
      now, 'me')
    expect(result.map(f => f.id)).toEqual(['gone', 'never'])
  })
})
