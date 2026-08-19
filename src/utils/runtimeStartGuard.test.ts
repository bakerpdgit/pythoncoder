import { describe, expect, it } from 'vitest'
import { isRuntimeSourceLocked, RuntimeStartGuard } from './runtimeStartGuard'

interface Source {
  filesystemId: string
  path: string
  code: string
}

const sameSource = (left: Source, right: Source) =>
  left.filesystemId === right.filesystemId && left.path === right.path && left.code === right.code

describe('RuntimeStartGuard', () => {
  const source = { filesystemId: 'default', path: '/main.py', code: 'print(1)' }

  it('claims synchronously and rejects a duplicate start', () => {
    const guard = new RuntimeStartGuard<Source>()
    const claim = guard.begin(source)

    expect(claim).not.toBeNull()
    expect(guard.isStarting).toBe(true)
    expect(guard.begin(source)).toBeNull()
  })

  it('rejects a continuation when its source changed during an await', () => {
    const guard = new RuntimeStartGuard<Source>()
    const claim = guard.begin(source)!

    expect(guard.isCurrent(claim, { ...source, path: '/other.py' }, sameSource)).toBe(false)
    expect(guard.isCurrent(claim, { ...source, code: 'print(2)' }, sameSource)).toBe(false)
  })

  it('invalidates cancelled claims and permits a fresh token', () => {
    const guard = new RuntimeStartGuard<Source>()
    const stale = guard.begin(source)!
    guard.cancel()
    const fresh = guard.begin(source)!

    expect(fresh.token).not.toBe(stale.token)
    expect(guard.isCurrent(stale, source, sameSource)).toBe(false)
    expect(guard.isCurrent(fresh, source, sameSource)).toBe(true)
    guard.finish(fresh)
    expect(guard.isStarting).toBe(false)
  })
})

describe('isRuntimeSourceLocked', () => {
  it.each([
    { isRunning: true, hasWorker: false, isStarting: false },
    { isRunning: false, hasWorker: true, isStarting: false },
    { isRunning: false, hasWorker: false, isStarting: true },
  ])('locks programmatic code replacement for active and preparing runtimes', state => {
    expect(isRuntimeSourceLocked(state)).toBe(true)
  })

  it('allows code replacement only while fully idle', () => {
    expect(isRuntimeSourceLocked({ isRunning: false, hasWorker: false, isStarting: false })).toBe(false)
  })
})
