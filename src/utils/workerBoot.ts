/**
 * Starting a worker a second way, when the browser will not start it the first.
 *
 * `new Worker(<address>)` asks the browser to fetch the script as a *worker*,
 * and a browser can refuse that fetch for reasons of its own — the script's
 * embedder policy against the page's, its MIME type, a filter in between — and
 * says only that it failed: a bare `error` event, no message. Safari did
 * exactly this to every worker on an isolated page.
 *
 * The same script fetched by the page as ordinary data is a different request,
 * and a worker made from a `blob:` copy of it involves no worker fetch at all:
 * the copy has no response headers to object to, and a blob worker takes its
 * policies (and its service worker) from the page that made it. So a worker
 * that never starts is tried again from a copy.
 *
 * The fetch is also the diagnosis. Whatever the browser would not say about
 * the worker load, it will say about this one: the status, the type, the
 * policy header (`describeWorkerScript`).
 */

export type WorkerBoot = 'direct' | 'blob'

export interface WorkerScript {
  /** Vite's own constructor for it: `new Worker(<the script's address>)`. */
  create: () => Worker
  /** That address (`?worker&url`). */
  url: string
}

interface BlobCopy {
  blobUrl: string
  isModule: boolean
}

const copies = new Map<string, BlobCopy>()

const absolute = (url: string) => new URL(url, window.location.href).href

/** An index page served in place of a script nobody has. */
const looksLikeWebPage = (text: string) => /^\s*<(!doctype|html)\b/i.test(text)

/**
 * Make a blob copy of each script, ready for `startWorker(…, 'blob')`.
 * Resolves to null, or to why it could not be done.
 *
 * `asModule` is the dev server, whose workers are ES modules importing other
 * modules by address: those cannot be copied as text, so the blob holds a
 * single `import` of the real script instead. A production worker is one
 * self-contained classic script and is copied whole.
 */
export async function prepareBlobBoot(scripts: WorkerScript[], asModule: boolean): Promise<string | null> {
  for (const script of scripts) {
    if (copies.has(script.url)) continue
    const address = absolute(script.url)
    let source: string
    if (asModule) {
      source = `import ${JSON.stringify(address)}`
    } else {
      try {
        const response = await fetch(address)
        if (!response.ok) return `The worker script could not be fetched as data either (HTTP ${response.status}).`
        source = await response.text()
      } catch (error) {
        return `The worker script could not be fetched as data either: ${error instanceof Error ? error.message : String(error)}`
      }
      if (looksLikeWebPage(source)) return 'The worker script\'s address answered with a web page.'
    }
    copies.set(script.url, {
      blobUrl: URL.createObjectURL(new Blob([source], { type: 'text/javascript' })),
      isModule: asModule,
    })
  }
  return null
}

/** Start the worker: from its copy if `boot` says so and one has been made, otherwise as Vite built it. */
export function startWorker(script: WorkerScript, boot: WorkerBoot): Worker {
  const copy = boot === 'blob' ? copies.get(script.url) : undefined
  if (!copy) return script.create()
  return copy.isModule ? new Worker(copy.blobUrl, { type: 'module' }) : new Worker(copy.blobUrl)
}

/**
 * What this browser gets when it asks for the worker script, in a line — the
 * things a failed worker load does not report.
 */
export async function describeWorkerScript(url: string): Promise<string> {
  try {
    const response = await fetch(absolute(url))
    const type = response.headers.get('content-type') ?? 'no type'
    const policy = response.headers.get('cross-origin-embedder-policy') ?? 'none'
    return `the worker script answers HTTP ${response.status}, ${type}, embedder policy ${policy}`
  } catch (error) {
    return `the worker script cannot be fetched: ${error instanceof Error ? error.message : String(error)}`
  }
}

/** For tests: forget every copy made. */
export function forgetBlobCopies(): void {
  for (const copy of copies.values()) URL.revokeObjectURL(copy.blobUrl)
  copies.clear()
}
