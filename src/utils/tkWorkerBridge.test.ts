import { describe, expect, it, vi } from 'vitest'
import { TkWorkerBridge } from './tkWorkerBridge'
import type { TkRenderer } from './tkinterRenderer'
import type { TraceChannel } from './traceChannel'

/**
 * The page's side of a turtle drawing from the trace worker: drawing applied
 * in order (held until the window exists), questions answered from the
 * renderer, and events handed over in parts when a reply has a size limit.
 */

function fakeChannel(replyLimit = Number.POSITIVE_INFINITY) {
  const replies: string[] = []
  const applied: number[] = []
  let queued = 0
  const channel = {
    replyLimit,
    sendReply: (text: string) => { replies.push(text); return true },
    tkApplied: (seq: number) => { applied.push(seq) },
    tkEventsQueued: () => { queued += 1 },
  } as unknown as TraceChannel
  return { channel, replies, applied, queued: () => queued }
}

function fakeRenderer(events: unknown[] = []) {
  const flushed: string[] = []
  let pending = [...events]
  const renderer = {
    flush: (ops: string) => { flushed.push(ops) },
    query: (q: string) => JSON.stringify({ asked: JSON.parse(q) }),
    poll: () => {
      const out = pending
      pending = []
      return out.length ? JSON.stringify(out) : ''
    },
    dialog: vi.fn(async () => '"yes"'),
    cancelDialogs: vi.fn(),
  } as unknown as TkRenderer
  return { renderer, flushed, queue: (...more: unknown[]) => { pending.push(...more) } }
}

describe('TkWorkerBridge', () => {
  it('holds drawing and questions until the window exists, then hands them over in order', () => {
    const { channel, replies, applied } = fakeChannel()
    const { renderer, flushed } = fakeRenderer()
    const drawn: string[] = []
    const bridge = new TkWorkerBridge(channel, ops => drawn.push(ops))
    bridge.ops(1, '[["a"]]')
    bridge.request(JSON.stringify({ k: 'query', q: '{"q":"geom","w":3}' }))
    bridge.ops(2, '[["b"]]')
    expect(replies).toEqual([])
    bridge.attach(renderer)
    expect(flushed).toEqual(['[["a"]]', '[["b"]]'])
    expect(applied).toEqual([1, 2])
    expect(drawn).toEqual(['[["a"]]', '[["b"]]'])
    expect(JSON.parse(replies[0])).toEqual({ asked: { q: 'geom', w: 3 } })
  })

  it('tells the worker each time an event is queued, and hands every event over with its tally', () => {
    const { channel, replies, queued } = fakeChannel()
    const { renderer, queue } = fakeRenderer()
    const bridge = new TkWorkerBridge(channel)
    bridge.attach(renderer)
    queue({ t: 'key', k: 'press' }, { t: 'key', k: 'release' })
    bridge.eventQueued()
    bridge.eventQueued()
    expect(queued()).toBe(2)
    bridge.request(JSON.stringify({ k: 'poll' }))
    expect(JSON.parse(replies[0])).toEqual({ events: [{ t: 'key', k: 'press' }, { t: 'key', k: 'release' }], more: false, n: 2 })
  })

  it('hands a long queue over in parts when a reply has a size limit', () => {
    const { channel, replies } = fakeChannel(200)
    const many = Array.from({ length: 20 }, (_, i) => ({ t: 'mouse', k: 'press', w: 7, i }))
    const { renderer } = fakeRenderer(many)
    const bridge = new TkWorkerBridge(channel)
    bridge.attach(renderer)
    const got: unknown[] = []
    for (let turn = 0; turn < 20; turn++) {
      bridge.request(JSON.stringify({ k: 'poll' }))
      const reply = JSON.parse(replies[replies.length - 1])
      expect(new TextEncoder().encode(replies[replies.length - 1]).length).toBeLessThanOrEqual(200)
      got.push(...reply.events)
      if (!reply.more) break
    }
    expect(got).toEqual(many)
  })

  it('answers a dialog when the student does, and not at all once the run is over', async () => {
    const { channel, replies } = fakeChannel()
    const { renderer } = fakeRenderer()
    const bridge = new TkWorkerBridge(channel)
    bridge.attach(renderer)
    bridge.request(JSON.stringify({ k: 'dialog', spec: '{"kind":"message"}' }))
    await Promise.resolve()
    await Promise.resolve()
    expect(replies).toEqual(['"yes"'])

    bridge.request(JSON.stringify({ k: 'dialog', spec: '{}' }))
    bridge.end()
    await Promise.resolve()
    await Promise.resolve()
    expect(replies).toEqual(['"yes"'])
    expect(renderer.cancelDialogs).toHaveBeenCalled()
    bridge.ops(9, '[]')
    bridge.eventQueued()
  })
})
