import { describe, it, expect, vi } from 'vitest'
import { stopAndAwaitRuntimeRelease } from './runtimeRelease'

// A controllable clock/scheduler: `wait` advances time instantly so the tests
// exercise the polling loop without real delays.
const makeHarness = (locked: boolean) => {
  let time = 0
  const state = { locked, stops: 0, waits: 0 }
  return {
    state,
    deps: {
      isLocked: () => state.locked,
      stop: () => { state.stops += 1 },
      wait: async (ms: number) => { state.waits += 1; time += ms },
      now: () => time,
    },
  }
}

describe('stopAndAwaitRuntimeRelease', () => {
  it('resolves immediately without stopping when nothing is running', async () => {
    const { state, deps } = makeHarness(false)
    await expect(stopAndAwaitRuntimeRelease(deps)).resolves.toBe(true)
    expect(state.stops).toBe(0)
    expect(state.waits).toBe(0)
  })

  it('stops a running program and resolves once it releases', async () => {
    const { state, deps } = makeHarness(true)
    // Release on the second poll, as a worker acknowledging a stop would.
    let polls = 0
    const isLocked = () => {
      polls += 1
      if (polls > 3) state.locked = false
      return state.locked
    }
    await expect(stopAndAwaitRuntimeRelease({ ...deps, isLocked })).resolves.toBe(true)
    expect(state.stops).toBe(1)
  })

  it('requests the stop only once while waiting', async () => {
    const { state, deps } = makeHarness(true)
    let polls = 0
    const isLocked = () => { polls += 1; if (polls > 5) state.locked = false; return state.locked }
    await stopAndAwaitRuntimeRelease({ ...deps, isLocked })
    expect(state.stops).toBe(1)
  })

  it('gives up rather than waiting forever on a wedged runtime', async () => {
    const { state, deps } = makeHarness(true)
    await expect(stopAndAwaitRuntimeRelease({ ...deps, timeoutMs: 200, pollMs: 50 }))
      .resolves.toBe(false)
    expect(state.stops).toBe(1)
    expect(state.waits).toBe(4)
  })

  it('does not poll when the stop takes effect synchronously', async () => {
    const state = { locked: true }
    const wait = vi.fn(async () => {})
    await expect(stopAndAwaitRuntimeRelease({
      isLocked: () => state.locked,
      stop: () => { state.locked = false },
      wait,
      now: () => 0,
    })).resolves.toBe(true)
    expect(wait).not.toHaveBeenCalled()
  })
})
