export type WorkerRunMode = 'trace' | 'run' | 'debug'

/**
 * Resolve the main execution button from the page URL. The value is
 * case-insensitive so teacher-facing links can use either `mode=Trace` or the
 * lower-case form used internally. Other query parameters, including a
 * learning-book URL, are deliberately ignored.
 */
export function getRunModeFromSearch(
  search: string,
  fallback: WorkerRunMode = 'debug',
): WorkerRunMode {
  const requested = new URLSearchParams(search).get('mode')?.trim().toLowerCase()
  return requested === 'trace' || requested === 'run' || requested === 'debug'
    ? requested
    : fallback
}

/**
 * Whether a URL-opened learning book should immediately enter its first
 * example. A bare `?showFirst` is treated as enabled for concise shared links.
 */
export function getShowFirstFromSearch(search: string): boolean {
  const params = new URLSearchParams(search)
  if (!params.has('showFirst')) return false

  const requested = params.get('showFirst')?.trim().toLowerCase() ?? ''
  return requested === '' || requested === '1' || requested === 'true' || requested === 'yes'
}
