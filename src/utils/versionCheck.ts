// Polls /version.json after page load. When the deployed version differs from
// the version baked into the running bundle, returns true so the UI can prompt
// a reload. Vite injects __APP_VERSION__ at build time via define.

declare const __APP_VERSION__: string

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export function getBootVersion(): string {
  try { return __APP_VERSION__ } catch { return '' }
}

async function fetchDeployedVersion(): Promise<string | null> {
  try {
    const url = `/version.json?t=${Date.now()}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    return typeof data?.version === 'string' ? data.version : null
  } catch {
    return null
  }
}

export function startVersionPolling(onUpdate: () => void): () => void {
  const boot = getBootVersion()
  if (!boot) return () => { /* nothing to compare against */ }
  let stopped = false
  let timeoutId: number | undefined

  const tick = async () => {
    if (stopped) return
    const deployed = await fetchDeployedVersion()
    if (!stopped && deployed && deployed !== boot) {
      onUpdate()
      return
    }
    if (!stopped) timeoutId = window.setTimeout(tick, POLL_INTERVAL_MS)
  }

  // First check shortly after load so users see an early notification, then on interval.
  timeoutId = window.setTimeout(tick, 30 * 1000)

  // Also re-check whenever the tab regains focus.
  const onFocus = () => { void tick() }
  window.addEventListener('focus', onFocus)

  return () => {
    stopped = true
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    window.removeEventListener('focus', onFocus)
  }
}
