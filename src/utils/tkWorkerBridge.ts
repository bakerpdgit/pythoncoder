/**
 * The page's side of a tkinter program — a turtle, usually — drawing from the
 * trace worker.
 *
 * The worker's tkinter host (TKINTER_WORKER_BOOTSTRAP in utils/tkinter.ts)
 * posts its drawing as `tk_ops` batches and asks its questions as
 * `tk_request`s, blocking until they are answered over the run's
 * TraceChannel: a widget's size, the clicks and keys queued since it last
 * asked, a message box's answer. This applies the one to the same TkRenderer a
 * main-thread run draws with and answers the other from it.
 *
 * The renderer is made asynchronously (it waits for the Display pane), while
 * the worker may start drawing at once, so anything that arrives first is
 * held and handed over in order when it is attached.
 */

import type { TkRenderer } from './tkinterRenderer'
import type { TraceChannel } from './traceChannel'

/** Room kept in a reply for its envelope: `{"events":[...],"more":false,"n":123}`. */
const POLL_ENVELOPE_BYTES = 64

type Pending = { kind: 'ops'; seq: number; ops: string } | { kind: 'request'; body: string }

export class TkWorkerBridge {
  private renderer: TkRenderer | null = null
  private pending: Pending[] = []
  /** Events taken from the renderer that did not fit into a reply yet. */
  private backlog: unknown[] = []
  /** How many events the worker has been told about (its tally, sent with each poll reply). */
  private queued = 0
  private ended = false
  private readonly encoder = new TextEncoder()

  constructor(
    private readonly channel: TraceChannel,
    /** Called with each batch of drawing once applied (for "the Display pane changed"). */
    private readonly onDrawing?: (ops: string) => void,
  ) {}

  /** The renderer is ready: everything held for it is handed over, in order. */
  attach(renderer: TkRenderer): void {
    this.renderer = renderer
    for (const item of this.pending.splice(0)) {
      if (item.kind === 'ops') this.applyOps(item.seq, item.ops)
      else this.answer(item.body)
    }
  }

  /** TkRendererOptions.onEvent: the student did something the worker should collect. */
  eventQueued(): void {
    if (this.ended) return
    this.queued += 1
    this.channel.tkEventsQueued()
  }

  /** A `tk_ops` message: a batch of drawing. */
  ops(seq: number, ops: string): void {
    if (this.ended) return
    if (!this.renderer) {
      this.pending.push({ kind: 'ops', seq, ops })
      return
    }
    this.applyOps(seq, ops)
  }

  /** A `tk_request` message: the worker is blocked until this is answered. */
  request(body: string): void {
    if (this.ended) return
    if (!this.renderer) {
      this.pending.push({ kind: 'request', body })
      return
    }
    this.answer(body)
  }

  /** The run is over: drop anything still to come, and close any open message box. */
  end(): void {
    this.ended = true
    this.pending = []
    this.backlog = []
    this.renderer?.cancelDialogs()
  }

  private applyOps(seq: number, ops: string) {
    this.renderer!.flush(ops)
    this.channel.tkApplied(seq)
    this.onDrawing?.(ops)
  }

  private answer(body: string) {
    const renderer = this.renderer!
    let question: { k?: unknown; q?: unknown; spec?: unknown }
    try {
      question = JSON.parse(body)
    } catch {
      this.channel.sendReply('null')
      return
    }
    switch (question.k) {
      case 'query':
        this.channel.sendReply(renderer.query(String(question.q ?? '{}')))
        break
      case 'poll':
        this.channel.sendReply(this.pollReply(renderer))
        break
      case 'dialog':
        // The worker waits as long as the student takes; a stop answers it instead.
        void renderer.dialog(String(question.spec ?? '{}')).then(answer => {
          if (!this.ended) this.channel.sendReply(answer)
        })
        break
      default:
        this.channel.sendReply('null')
    }
  }

  /**
   * Every event queued so far — or, through shared memory, as many whole
   * events as fit, with `more` set so the worker comes back for the rest.
   * `n` is the page's tally, which a worker on held requests cannot read for
   * itself as it can from shared memory.
   */
  private pollReply(renderer: TkRenderer): string {
    const raw = renderer.poll()
    if (raw) {
      try { this.backlog.push(...(JSON.parse(raw) as unknown[])) } catch { /* nothing usable */ }
    }
    const limit = this.channel.replyLimit - POLL_ENVELOPE_BYTES
    const events: unknown[] = []
    let size = 0
    while (this.backlog.length) {
      const bytes = this.encoder.encode(JSON.stringify(this.backlog[0])).length + 1
      if (events.length && size + bytes > limit) break
      events.push(this.backlog.shift())
      size += bytes
    }
    return JSON.stringify({ events, more: this.backlog.length > 0, n: this.queued })
  }
}
