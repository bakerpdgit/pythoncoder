export interface RuntimeStartClaim<TSource> {
  token: number
  source: TSource
}

export interface RuntimeSourceLockState {
  isRunning: boolean
  hasWorker: boolean
  isStarting: boolean
}

export const isRuntimeSourceLocked = (state: RuntimeSourceLockState): boolean =>
  state.isRunning || state.hasWorker || state.isStarting

/**
 * Synchronously claims an asynchronous runtime start and invalidates stale
 * continuations after cancellation. The caller still owns source comparison so
 * this utility stays independent of React and application state.
 */
export class RuntimeStartGuard<TSource> {
  private nextToken = 1
  private activeToken: number | null = null

  get isStarting(): boolean {
    return this.activeToken !== null
  }

  begin(source: TSource): RuntimeStartClaim<TSource> | null {
    if (this.activeToken !== null) return null
    const claim = { token: this.nextToken++, source }
    this.activeToken = claim.token
    return claim
  }

  isCurrent(
    claim: RuntimeStartClaim<TSource>,
    currentSource: TSource,
    sourcesEqual: (left: TSource, right: TSource) => boolean,
  ): boolean {
    return this.activeToken === claim.token && sourcesEqual(claim.source, currentSource)
  }

  finish(claim: RuntimeStartClaim<TSource>): void {
    if (this.activeToken === claim.token) this.activeToken = null
  }

  cancel(): void {
    this.activeToken = null
  }
}
