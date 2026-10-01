// The trace worker's second way of waiting for the page.
//
// Normally the worker blocks on a SharedArrayBuffer (Atomics.wait) while the
// student decides to Step, or types an answer to input(). That needs the page
// to be cross-origin isolated, and it needs the browser's shared memory to
// actually behave. Where either fails, the worker falls back to what Python
// Sponge always did: a *synchronous* XMLHttpRequest to an address that does not
// exist. This service worker catches it and simply does not answer until the
// page posts the reply. To the worker the request is a blocking call; no
// shared memory or isolation is involved.
//
// Nothing here is a source of truth. The page owns every answer and all state,
// and this is a relay that can be killed by the browser at any moment:
//   - a held request is released with 204 after HOLD_MS, and the worker asks
//     again, so no single request outlives the browser's patience;
//   - a request for a session this instance has never heard of tells the page
//     ("coder-sync-resync"), which posts its state and any unanswered reply
//     again.
//
// It deliberately touches nothing outside SYNC_PREFIX: every other request
// returns from the fetch handler untouched and is the browser's as usual.
// The protocol's other half is src/utils/traceSyncProtocol.ts.

const SYNC_PREFIX = '/__coder_sync__/'
const HOLD_MS = 20000
const SESSION_IDLE_MS = 10 * 60 * 1000

/** id -> { replies: Map<seq, body>, waiters: Map<seq, resolve>, state, touched } */
const sessions = new Map()

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

function json(body, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      // How the worker tells an answer from this service worker apart from a
      // server that answers any unknown address with its index page.
      'X-Coder-Sync': '1',
    },
  })
}

function forgetIdleSessions() {
  const cutoff = Date.now() - SESSION_IDLE_MS
  for (const [id, session] of sessions) {
    if (session.touched < cutoff && session.waiters.size === 0) sessions.delete(id)
  }
}

/** The session, and whether this instance is hearing of it for the first time. */
function sessionFor(id) {
  let session = sessions.get(id)
  const isNew = !session
  if (!session) {
    forgetIdleSessions()
    session = { replies: new Map(), waiters: new Map(), state: { stop: false, keys: [] }, touched: 0 }
    sessions.set(id, session)
  }
  session.touched = Date.now()
  return { session, isNew }
}

async function tellPages(message) {
  const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const page of pages) page.postMessage(message)
}

self.addEventListener('message', event => {
  const data = event.data
  if (!data || typeof data.type !== 'string') return
  // A hard reload leaves the page uncontrolled by a service worker that is
  // already active, and activation — the only other claim — has been and gone.
  if (data.type === 'coder-sync-claim') {
    event.waitUntil(self.clients.claim())
    return
  }
  if (typeof data.session !== 'string') return
  if (data.type === 'coder-sync-close') {
    const session = sessions.get(data.session)
    if (session) for (const release of session.waiters.values()) release(json({ closed: true }, 410))
    sessions.delete(data.session)
    return
  }
  const { session } = sessionFor(data.session)
  if (data.type === 'coder-sync-state') {
    session.state = { stop: Boolean(data.state?.stop), keys: Array.isArray(data.state?.keys) ? data.state.keys : [] }
  } else if (data.type === 'coder-sync-reply') {
    const release = session.waiters.get(data.seq)
    if (release) {
      session.waiters.delete(data.seq)
      release(json(data.body))
    } else {
      // The page answered before the worker asked — a fixed input, or a Run
      // that continues past every line — so keep it for when it does.
      session.replies.set(data.seq, data.body)
    }
  }
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SYNC_PREFIX)) return
  const op = url.pathname.slice(SYNC_PREFIX.length)
  const id = url.searchParams.get('s') ?? ''

  if (op === 'ping') {
    event.respondWith(json({ ok: true }))
    return
  }
  if (!id) {
    event.respondWith(json({ error: 'no session' }, 400))
    return
  }
  const { session, isNew } = sessionFor(id)
  if (isNew) void tellPages({ type: 'coder-sync-resync', session: id })

  if (op === 'poll') {
    event.respondWith(json(session.state))
  } else if (op === 'sleep') {
    const ms = Math.max(0, Math.min(Number(url.searchParams.get('ms')) || 0, HOLD_MS))
    event.respondWith(new Promise(resolve => setTimeout(() => resolve(json(session.state)), ms)))
  } else if (op === 'wait') {
    const seq = Number(url.searchParams.get('q'))
    if (session.replies.has(seq)) {
      const body = session.replies.get(seq)
      session.replies.delete(seq)
      event.respondWith(json(body))
      return
    }
    // The handshake at the start of a run asks to be held for less, so a page
    // that never answers is noticed in seconds.
    const hold = Math.max(1, Math.min(Number(url.searchParams.get('hold')) || HOLD_MS, HOLD_MS))
    event.respondWith(new Promise(resolve => {
      // A second request for the same turn replaces the first, which is then
      // released as "ask again" so nothing is left hanging.
      session.waiters.get(seq)?.(json(null, 204))
      session.waiters.set(seq, resolve)
      setTimeout(() => {
        if (session.waiters.get(seq) !== resolve) return
        session.waiters.delete(seq)
        resolve(json(null, 204))
      }, hold)
    }))
  } else {
    event.respondWith(json({ error: 'unknown request' }, 404))
  }
})
