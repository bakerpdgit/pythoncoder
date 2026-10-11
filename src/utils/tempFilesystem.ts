// ── Temporary filesystems ───────────────────────────────────────────────────
//
// Code opened from a link that carries it can be worked on "temporarily":
// nothing is kept once the tab closes. It still has to be a real filesystem —
// the editor, the runtimes and the file browser all read IndexedDB — so it is
// one, marked with the session of the tab that made it.
//
// A tab's session id lives in sessionStorage, which survives a reload of that
// tab and dies with it. While the tab is open it renews a heartbeat in
// localStorage; any temporary filesystem whose session has gone quiet is
// deleted the next time Coder starts, in whichever tab.

import type { VFSFilesystem } from '../types'

const SESSION_KEY = 'coder_session'
const BEATS_KEY = 'coder_session_beats'
export const HEARTBEAT_MS = 30_000
export const STALE_AFTER_MS = 120_000

let sessionId: string | null = null

/** This tab's session id, made on first use. */
export function currentSession(): string {
  if (sessionId) return sessionId
  try {
    sessionId = sessionStorage.getItem(SESSION_KEY)
    if (!sessionId) {
      sessionId = crypto.randomUUID()
      sessionStorage.setItem(SESSION_KEY, sessionId)
    }
  } catch {
    sessionId = sessionId ?? crypto.randomUUID()
  }
  return sessionId
}

function readBeats(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(BEATS_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {}
  } catch {
    return {}
  }
}

function beat(now = Date.now()): void {
  try {
    const beats = readBeats()
    beats[currentSession()] = now
    // Forget sessions long gone, so the record does not grow for ever.
    for (const [session, at] of Object.entries(beats)) if (now - at > STALE_AFTER_MS * 10) delete beats[session]
    localStorage.setItem(BEATS_KEY, JSON.stringify(beats))
  } catch { /* storage refused: temporary copies then live until the next purge */ }
}

/** Keep this tab's temporary filesystems alive. Returns the stop function. */
export function startSessionHeartbeat(): () => void {
  beat()
  const timer = window.setInterval(() => beat(), HEARTBEAT_MS)
  return () => window.clearInterval(timer)
}

/**
 * The temporary filesystems whose tab has gone: never this tab's own, and not
 * one whose tab beat within `STALE_AFTER_MS`.
 */
export function staleTemporaryFilesystems(
  filesystems: VFSFilesystem[], beats: Record<string, number>, now: number, thisSession: string,
): VFSFilesystem[] {
  return filesystems.filter(fs => {
    const session = fs.temporary?.session
    if (!session || session === thisSession) return false
    const last = beats[session]
    return last === undefined || now - last > STALE_AFTER_MS
  })
}

export function staleTemporaryFilesystemsNow(filesystems: VFSFilesystem[]): VFSFilesystem[] {
  return staleTemporaryFilesystems(filesystems, readBeats(), Date.now(), currentSession())
}
