import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describeWorkerScript, forgetBlobCopies, prepareBlobBoot, startWorker, type WorkerScript } from './workerBoot'

/**
 * Starting a worker from a copy when the browser will not start it from its
 * address. A real worker is e2e's business (transport.spec.ts); what is pinned
 * here is which constructor is called with what, and what a failed fetch says.
 */

class FakeWorker {
  constructor(public url: string, public options?: WorkerOptions) {}
}

const response = (body: string, init: { status?: number; headers?: Record<string, string> } = {}) =>
  new Response(body, { status: init.status ?? 200, headers: init.headers })

/** jsdom's Blob cannot be read back, so the copy's source is kept where a test can see it. */
class FakeBlob {
  constructor(public parts: string[], public options?: BlobPropertyBag) {}
}

let blobs: FakeBlob[]
let script: WorkerScript

beforeEach(() => {
  blobs = []
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('Blob', FakeBlob)
  // jsdom has no object URLs; all that matters is that each copy gets one.
  URL.createObjectURL = vi.fn((blob: unknown) => { blobs.push(blob as FakeBlob); return `blob:copy-${blobs.length}` }) as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn()
  script = { url: '/assets/workers/tracer.worker-abc.js', create: () => new FakeWorker('direct') as unknown as Worker }
})

afterEach(() => {
  forgetBlobCopies()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('startWorker', () => {
  it('starts the worker as built until a copy exists, whatever is asked', () => {
    expect((startWorker(script, 'direct') as unknown as FakeWorker).url).toBe('direct')
    // Asked for a copy that was never made: the built one, not a crash.
    expect((startWorker(script, 'blob') as unknown as FakeWorker).url).toBe('direct')
  })

  it('starts a production worker from a copy of its whole script', async () => {
    const fetched = vi.fn(async () => response('self.onmessage = () => {}'))
    vi.stubGlobal('fetch', fetched)
    expect(await prepareBlobBoot([script], false)).toBeNull()

    const worker = startWorker(script, 'blob') as unknown as FakeWorker
    expect(worker.url).toBe('blob:copy-1')
    expect(worker.options).toBeUndefined()
    expect(blobs[0].parts.join('')).toBe('self.onmessage = () => {}')
    expect(blobs[0].options).toEqual({ type: 'text/javascript' })
    // Still the built one when the ordinary way is asked for.
    expect((startWorker(script, 'direct') as unknown as FakeWorker).url).toBe('direct')
  })

  it('starts a dev-server worker from a module that imports the real one', async () => {
    const fetched = vi.fn()
    vi.stubGlobal('fetch', fetched)
    expect(await prepareBlobBoot([script], true)).toBeNull()

    const worker = startWorker(script, 'blob') as unknown as FakeWorker
    expect(worker.options).toEqual({ type: 'module' })
    // A module worker imports other modules by address, so it cannot be copied as text.
    expect(blobs[0].parts.join('')).toBe(`import "${new URL(script.url, window.location.href).href}"`)
    expect(fetched).not.toHaveBeenCalled()
  })

  it('copies each script once', async () => {
    const fetched = vi.fn(async () => response('code'))
    vi.stubGlobal('fetch', fetched)
    await prepareBlobBoot([script], false)
    await prepareBlobBoot([script], false)
    expect(fetched).toHaveBeenCalledTimes(1)
  })
})

describe('prepareBlobBoot, when the script cannot be had', () => {
  it('says so when the fetch is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('nope', { status: 403 })))
    expect(await prepareBlobBoot([script], false)).toMatch(/HTTP 403/)
    expect((startWorker(script, 'blob') as unknown as FakeWorker).url).toBe('direct')
  })
  it('says so when the fetch fails outright', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Load failed') }))
    expect(await prepareBlobBoot([script], false)).toMatch(/Load failed/)
  })
  it('does not make a worker out of an index page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('<!doctype html><html></html>')))
    expect(await prepareBlobBoot([script], false)).toMatch(/web page/)
    expect(blobs).toHaveLength(0)
  })
})

describe('describeWorkerScript', () => {
  it('reports what a failed worker load keeps to itself: status, type and policy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('code', {
      headers: { 'content-type': 'application/javascript', 'cross-origin-embedder-policy': 'require-corp' },
    })))
    expect(await describeWorkerScript(script.url)).toBe('the worker script answers HTTP 200, application/javascript, embedder policy require-corp')
  })
  it('says when there is no policy, and when there is no answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('code', { headers: { 'content-type': 'text/javascript' } })))
    expect(await describeWorkerScript(script.url)).toMatch(/embedder policy none/)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Load failed') }))
    expect(await describeWorkerScript(script.url)).toBe('the worker script cannot be fetched: Load failed')
  })
})
