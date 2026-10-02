import { beforeEach, describe, expect, it } from 'vitest'
import {
  decideFallback, fallbackNote, initialWorkerPlan, recallWorkerPlan, rememberWorkerPlan, workerUnavailableMessage,
} from './runtimeFallback'

const tab = (over: Partial<Parameters<typeof initialWorkerPlan>[0]> = {}) =>
  initialWorkerPlan({ hasSharedMemory: true, serviceWorkerSupported: true, forced: null, remembered: null, ...over })

describe('initialWorkerPlan', () => {
  it('prefers shared memory where the page is isolated', () => {
    expect(tab()).toBe('sab')
  })
  it('uses the service worker in a tab that is not isolated — it is not left without the worker', () => {
    expect(tab({ hasSharedMemory: false })).toBe('xhr')
  })
  it('has no worker at all only when neither is on offer', () => {
    expect(tab({ hasSharedMemory: false, serviceWorkerSupported: false })).toBe('none')
  })
  it('starts where this tab already fell back to, rather than failing the same way again', () => {
    expect(tab({ remembered: 'xhr' })).toBe('xhr')
    expect(tab({ remembered: 'none' })).toBe('none')
  })
  it('lets the address pick a rung, over what was remembered', () => {
    expect(tab({ forced: 'xhr', remembered: 'none' })).toBe('xhr')
    expect(tab({ forced: 'none' })).toBe('none')
  })
  it('ignores a rung this tab cannot use, whoever asked for it', () => {
    expect(tab({ hasSharedMemory: false, forced: 'sab' })).toBe('xhr')
    expect(tab({ serviceWorkerSupported: false, remembered: 'xhr' })).toBe('sab')
    expect(tab({ forced: 'nonsense' })).toBe('sab')
  })
})

describe('decideFallback', () => {
  const context = { serviceWorkerSupported: true, workerFailures: 0 }

  it('answers a failed shared-memory transport with the other transport', () => {
    expect(decideFallback('sab', 'transport', context)).toEqual({ plan: 'xhr', rerunOn: 'xhr' })
  })
  it('has only the main thread left once the service worker fails too', () => {
    expect(decideFallback('xhr', 'transport', context)).toEqual({ plan: 'none', rerunOn: 'main-thread' })
    expect(decideFallback('sab', 'transport', { ...context, serviceWorkerSupported: false }))
      .toEqual({ plan: 'none', rerunOn: 'main-thread' })
  })
  it('tries the other transport after a crash on shared memory too: nobody can rule it out on an iPad', () => {
    for (const failure of ['start', 'crash'] as const) {
      expect(decideFallback('sab', failure, context)).toEqual({ plan: 'xhr', rerunOn: 'xhr' })
      expect(decideFallback('sab', failure, { ...context, serviceWorkerSupported: false }).rerunOn).toBe('main-thread')
    }
  })
  it('does not, when Pyodide would not load: that is the same download either way', () => {
    expect(decideFallback('sab', 'load', context)).toEqual({ plan: 'sab', rerunOn: 'main-thread' })
  })
  it('goes to the main thread once the worker fails on the service worker as well', () => {
    for (const failure of ['load', 'start', 'crash'] as const) {
      expect(decideFallback('xhr', failure, context).rerunOn).toBe('main-thread')
    }
  })
  it('keeps the rung when the browser would not start the worker, and starts it from a copy', () => {
    // The worker never ran, so nothing about how it waits has been learnt.
    expect(decideFallback('sab', 'boot', context)).toEqual({ plan: 'sab', rerunOn: 'sab', boot: 'blob' })
    expect(decideFallback('xhr', 'boot', context)).toEqual({ plan: 'xhr', rerunOn: 'xhr', boot: 'blob' })
  })
  it('gives the worker one more chance before giving up on it: a dropped connection looks the same', () => {
    expect(decideFallback('sab', 'load', { ...context, workerFailures: 0 }).plan).toBe('sab')
    expect(decideFallback('sab', 'load', { ...context, workerFailures: 1 }).plan).toBe('none')
    expect(decideFallback('xhr', 'crash', { ...context, workerFailures: 0 }).plan).toBe('xhr')
    expect(decideFallback('xhr', 'crash', { ...context, workerFailures: 1 }).plan).toBe('none')
  })
})

describe('fallbackNote', () => {
  it('says the program was started again, and what went wrong, when the transport changed', () => {
    const note = fallbackNote('sab', { plan: 'xhr', rerunOn: 'xhr' }, 'no answer\n[while checking the link to the page]')
    expect(note).toMatch(/shared memory/)
    expect(note).toMatch(/switched to a service worker/)
    // One line, so it survives being copied out of the console in one piece.
    expect(note.split('\n')).toHaveLength(2)
    expect(note).toContain('What went wrong: no answer [while checking the link to the page]')
  })
  it('says what the main thread cannot do, and whether the worker will be tried again', () => {
    const once = fallbackNote('sab', { plan: 'sab', rerunOn: 'main-thread' }, 'Failed to load Pyodide in the worker.')
    expect(once).toMatch(/main thread instead/)
    expect(once).toMatch(/without stepping/)
    expect(once).toMatch(/tried again on your next run/)
    const settled = fallbackNote('sab', { plan: 'none', rerunOn: 'main-thread' }, 'Failed to load Pyodide in the worker.')
    expect(settled).toMatch(/keep running there in this tab/)
  })
  it('says the worker was started from a copy, and what the browser was sent', () => {
    const note = fallbackNote('xhr', { plan: 'xhr', rerunOn: 'xhr', boot: 'blob' },
      'Worker failed to start: unknown worker error [the worker script answers HTTP 200, application/javascript, embedder policy none; page isolated: no]')
    expect(note).toMatch(/started from a copy/)
    expect(note).not.toMatch(/switched to/)
    expect(note).toContain('embedder policy none')
  })
  it('never leaves the reason blank', () => {
    expect(fallbackNote('xhr', { plan: 'none', rerunOn: 'main-thread' }, '  ')).toContain('What went wrong: unknown error')
  })
})

describe('workerUnavailableMessage', () => {
  it('quotes the first line of the reason only, without doubling its full stop', () => {
    expect(workerUnavailableMessage('RangeError: Maximum call stack size exceeded.\n[while loading Pyodide]'))
      .toBe('The step-by-step runner was tried in this browser and could not start (RangeError: Maximum call stack size exceeded).')
  })
})

describe('remembering the rung', () => {
  beforeEach(() => sessionStorage.clear())

  it('keeps it for the tab, with why', () => {
    rememberWorkerPlan({ plan: 'xhr', reason: 'no answer' }, 'build-1')
    expect(recallWorkerPlan('build-1')).toEqual({ plan: 'xhr', reason: 'no answer' })
  })
  it('forgets it when asked to try again', () => {
    rememberWorkerPlan({ plan: 'none', reason: 'x' }, 'build-1')
    rememberWorkerPlan(null, 'build-1')
    expect(recallWorkerPlan('build-1')).toBeNull()
  })
  it('does not carry it into a newer build: the reload that brings the fix must not keep the fallback', () => {
    rememberWorkerPlan({ plan: 'none', reason: 'Worker failed to start' }, 'build-1')
    expect(recallWorkerPlan('build-2')).toBeNull()
    // Nor does something remembered before builds were recorded at all.
    sessionStorage.setItem('coder_worker_plan', JSON.stringify({ plan: 'none', reason: 'old' }))
    expect(recallWorkerPlan('build-2')).toBeNull()
  })
  it('treats anything unreadable as nothing remembered', () => {
    sessionStorage.setItem('coder_worker_plan', '{not json')
    expect(recallWorkerPlan('build-1')).toBeNull()
    sessionStorage.setItem('coder_worker_plan', JSON.stringify({ plan: 'warp', version: 'build-1' }))
    expect(recallWorkerPlan('build-1')).toBeNull()
  })
})
