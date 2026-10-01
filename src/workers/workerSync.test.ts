import { afterEach, describe, expect, it, vi } from 'vitest'
import { SyncChannelError, createSabSync, createXhrSync, watchSync } from './workerSync'
import { createSabChannel, createXhrChannel } from '../utils/traceChannel'
import { SYNC_MARK_HEADER, type SyncPageMessage } from '../utils/traceSyncProtocol'

/**
 * The worker's and the page's halves of each transport, joined directly: what
 * one writes the other must read back, which is the whole of the protocol.
 * Neither a worker nor a service worker is involved — those are e2e's.
 */

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('shared memory', () => {
  const pair = (withKeys = true) => {
    const channel = createSabChannel(withKeys ? 256 : null)
    const fields = channel.initFields() as { sab: SharedArrayBuffer; stdctxKeyBuffer: SharedArrayBuffer | null }
    return { channel, sync: createSabSync(fields.sab, fields.stdctxKeyBuffer) }
  }

  it('carries a debugger command, with breakpoints, conditions and watches', () => {
    const { channel, sync } = pair()
    // Answered before the worker begins to wait, as the page often does: the
    // changed value is the answer, and the wait returns at once.
    const answer = sync.waitCommand(() => {
      expect(channel.isWaiting('trace')).toBe(true)
      expect(channel.sendCommand(2, [{ line: 3, condition: '' }, { line: 7, condition: 'x > 1' }], ['total', 'len(items)'])).toBe(true)
    })
    expect(answer.cmd).toBe(2)
    expect([...answer.breakpoints]).toEqual([[3, ''], [7, 'x > 1']])
    expect(answer.watches).toEqual(['total', 'len(items)'])
    expect(answer.stop).toBe(false)
    expect(channel.isWaiting('trace')).toBe(false)
  })

  it('tells "no watches" from "watches never sent"', () => {
    const { channel, sync } = pair()
    // A stop wakes the worker without a command having been written.
    expect(sync.waitCommand(() => { channel.requestStop() })).toMatchObject({ watches: null, stop: true })
    const cleared = pair()
    expect(cleared.sync.waitCommand(() => { cleared.channel.sendCommand(1, [], []) }).watches).toEqual([])
  })

  it('carries an input() answer, and refuses one nobody asked for', () => {
    const { channel, sync } = pair()
    expect(channel.sendInput('too early')).toBe(false)
    expect(sync.waitInput(() => { expect(channel.sendInput('Ada Lovelace — ¡hola!')).toBe(true) }))
      .toEqual({ text: 'Ada Lovelace — ¡hola!', stop: false })
    // A command is not an answer to input(), nor the other way round.
    expect(sync.waitInput(() => {
      expect(channel.sendCommand(1, [], [])).toBe(false)
      channel.sendInput('x')
    }).text).toBe('x')
  })

  it('asks a trace to stop once, and the worker can see it', () => {
    const { channel, sync } = pair()
    expect(sync.stopRequested()).toBe(false)
    expect(channel.requestStop()).toBe(true)
    expect(channel.requestStop()).toBe(false)
    expect(sync.stopRequested()).toBe(true)
  })

  it('shares which keys are held down', () => {
    const { channel, sync } = pair()
    channel.setKey(65, true)
    expect(sync.keyDown(65)).toBe(true)
    channel.setKey(65, false)
    expect(sync.keyDown(65)).toBe(false)
    expect(sync.keyDown(9999)).toBe(false)
    expect(pair(false).sync.keyDown(65)).toBe(false)
  })

  it('passes the handshake when answered, and fails it when nothing arrives', () => {
    const { channel, sync } = pair()
    expect(() => sync.probe(() => channel.answerProbe())).not.toThrow()
    vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out')
    expect(() => pair().sync.probe(() => undefined)).toThrow(SyncChannelError)
  })
})

/** A service worker reduced to its essentials: the page's messages in, the worker's requests out. */
function fakeServiceWorker() {
  const replies = new Map<string, unknown>()
  const states = new Map<string, unknown>()
  const requests: string[] = []
  // What the next requests do instead of being answered normally.
  const script: Array<'release' | 'fail' | 'unmarked'> = []

  const postMessage = (message: SyncPageMessage) => {
    if (message.type === 'coder-sync-reply') replies.set(`${message.session}/${message.seq}`, message.body)
    if (message.type === 'coder-sync-state') states.set(message.session, message.state)
  }
  vi.stubGlobal('navigator', { serviceWorker: { controller: { postMessage }, addEventListener: vi.fn(), removeEventListener: vi.fn() } })

  class FakeXhr {
    status = 0
    responseText = ''
    private marked = true
    private url = new URL('http://localhost/')
    open(_method: string, url: string) { this.url = new URL(url) }
    getResponseHeader(name: string) { return name === SYNC_MARK_HEADER && this.marked ? '1' : null }
    send() {
      const op = this.url.pathname.split('/').pop() ?? ''
      requests.push(op)
      const next = script.shift()
      if (next === 'fail') throw new Error('NetworkError')
      if (next === 'unmarked') { this.marked = false; this.status = 200; this.responseText = '<!doctype html>'; return }
      if (op === 'ping') { this.status = 200; this.responseText = '{"ok":true}'; return }
      const session = this.url.searchParams.get('s') ?? ''
      if (op === 'poll' || op === 'sleep') {
        this.status = 200
        this.responseText = JSON.stringify(states.get(session) ?? { stop: false, keys: [] })
        return
      }
      const turn = `${session}/${this.url.searchParams.get('q')}`
      if (next === 'release' || !replies.has(turn)) { this.status = 204; return }
      this.status = 200
      this.responseText = JSON.stringify(replies.get(turn))
      replies.delete(turn)
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  return { requests, script }
}

/** A clock that only moves when asked, so nothing here really sleeps or spins. */
function fakeClock() {
  let now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  return {
    advance: (ms: number) => { now += ms },
    /** Every look at the clock moves it on, so a loop that waits on it ends. */
    tick: (step = 60) => vi.spyOn(performance, 'now').mockImplementation(() => (now += step)),
    freeze: () => vi.spyOn(performance, 'now').mockImplementation(() => now),
  }
}

describe('held requests', () => {
  const pair = () => {
    const channel = createXhrChannel()
    const { syncSession } = channel.initFields() as { syncSession: string }
    return { channel, sync: createXhrSync(syncSession, 'http://localhost') }
  }
  /** What tracer.worker.ts and App.tsx do between them: announce the wait, and have the page answer it. */
  const answering = (channel: ReturnType<typeof createXhrChannel>, kind: 'trace' | 'input' | 'probe', answer: () => void) =>
    (seq: number) => { channel.workerWaiting(kind, seq); answer() }

  it('carries a debugger command, with no limit on what it holds', () => {
    fakeServiceWorker()
    const { channel, sync } = pair()
    const condition = 'len(name) > 3 and ' + 'x'.repeat(2000)
    const answer = sync.waitCommand(answering(channel, 'trace', () => {
      expect(channel.isWaiting('trace')).toBe(true)
      channel.sendCommand(3, [{ line: 4, condition }], ['a'])
    }))
    expect(answer.cmd).toBe(3)
    expect(answer.breakpoints.get(4)).toBe(condition)
    expect(answer.watches).toEqual(['a'])
    expect(channel.isWaiting('trace')).toBe(false)
  })

  it('carries an input() answer, and refuses one nobody asked for', () => {
    fakeServiceWorker()
    const { channel, sync } = pair()
    expect(channel.sendInput('too early')).toBe(false)
    expect(sync.waitInput(answering(channel, 'input', () => { channel.sendInput('Ada') }))).toEqual({ text: 'Ada', stop: false })
  })

  it('asks again each time a held request is let go, for the same turn', () => {
    const { requests, script } = fakeServiceWorker()
    const { channel, sync } = pair()
    script.push('release', 'release')
    expect(sync.waitInput(answering(channel, 'input', () => { channel.sendInput('late') })).text).toBe('late')
    expect(requests).toEqual(['wait', 'wait', 'wait'])
  })

  it('wakes a waiting worker to stop it, and lets a running one find out by asking', () => {
    fakeServiceWorker()
    const clock = fakeClock()
    const { channel, sync } = pair()
    expect(sync.waitCommand(answering(channel, 'trace', () => { expect(channel.requestStop()).toBe(true) })))
      .toMatchObject({ stop: true, watches: null })
    expect(channel.requestStop()).toBe(false)

    const running = pair()
    expect(running.sync.stopRequested()).toBe(false)
    running.channel.requestStop()
    // Asked for at most every 200ms: a traced line must not cost a request.
    expect(running.sync.stopRequested()).toBe(false)
    clock.advance(250)
    expect(running.sync.stopRequested()).toBe(true)
  })

  it('learns the keys held down from a sleep, without asking separately', () => {
    const { requests } = fakeServiceWorker()
    const clock = fakeClock()
    const { channel, sync } = pair()
    channel.setKey(65, true)
    clock.tick(5)
    sync.sleep(100)
    requests.length = 0
    clock.freeze()
    expect(sync.keyDown(65)).toBe(true)
    expect(sync.keyDown(66)).toBe(false)
    expect(requests).toEqual([])
  })

  it('fails the handshake when the service worker is not the one answering', () => {
    const { script } = fakeServiceWorker()
    const { sync } = pair()
    // A server that returns its index page for any address it does not know.
    script.push('unmarked')
    expect(() => sync.probe(() => undefined)).toThrow(/not answering/)
  })

  it('fails the handshake when the page never answers it', () => {
    fakeServiceWorker()
    fakeClock().tick()
    const { sync } = pair()
    expect(() => sync.probe(() => undefined)).toThrow(/did not answer/)
  })

  it('gives up on a request that keeps failing, rather than spinning for ever', () => {
    const { script, requests } = fakeServiceWorker()
    fakeClock().tick()
    const { channel, sync } = pair()
    script.push('fail', 'fail', 'fail', 'fail', 'fail')
    expect(() => sync.waitInput(answering(channel, 'input', () => { channel.sendInput('x') }))).toThrow(SyncChannelError)
    expect(requests).toHaveLength(5)
  })

  it('rides out a request that fails once', () => {
    const { script } = fakeServiceWorker()
    fakeClock().tick()
    const { channel, sync } = pair()
    script.push('fail')
    expect(sync.waitInput(answering(channel, 'input', () => { channel.sendInput('x') })).text).toBe('x')
  })

  it('gives a restarted service worker the answer again', () => {
    fakeServiceWorker()
    const posted: SyncPageMessage[] = []
    const listeners: Array<(event: MessageEvent) => void> = []
    vi.stubGlobal('navigator', {
      serviceWorker: {
        controller: { postMessage: (message: SyncPageMessage) => posted.push(message) },
        addEventListener: (_type: string, listener: (event: MessageEvent) => void) => listeners.push(listener),
        removeEventListener: vi.fn(),
      },
    })
    const channel = createXhrChannel()
    const { syncSession } = channel.initFields() as { syncSession: string }
    channel.workerWaiting('input', 1)
    channel.sendInput('Ada')
    posted.length = 0
    listeners.forEach(listener => listener({ data: { type: 'coder-sync-resync', session: syncSession } } as MessageEvent))
    expect(posted.map(message => message.type)).toEqual(['coder-sync-state', 'coder-sync-reply'])
    expect(posted[1]).toMatchObject({ seq: 1, body: { text: 'Ada' } })
    // Someone else's session is nothing to do with this run.
    posted.length = 0
    listeners.forEach(listener => listener({ data: { type: 'coder-sync-resync', session: 'other' } } as MessageEvent))
    expect(posted).toEqual([])
  })
})

describe('watchSync', () => {
  it('reports a failure on its way past, and still throws it', () => {
    const channel = createSabChannel(null)
    const fields = channel.initFields() as { sab: SharedArrayBuffer }
    const seen: unknown[] = []
    const sync = watchSync(createSabSync(fields.sab, null), error => seen.push(error))
    vi.spyOn(Atomics, 'wait').mockImplementation(() => { throw new TypeError('Atomics.wait cannot be called in this context') })
    expect(() => sync.waitInput(() => undefined)).toThrow(TypeError)
    expect(String(seen[0])).toMatch(/cannot be called/)
    expect(sync.transport).toBe('sab')
  })
})
