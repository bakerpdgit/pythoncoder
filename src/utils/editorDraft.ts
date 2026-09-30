/**
 * A backup of the editor's unsaved changes, one per filesystem.
 *
 * Only one file is ever open, and switching files or filesystems already asks
 * about unsaved changes, so the only way to lose them is for the page itself to
 * go — the browser closed, the tab crashed, the laptop lid shut on a dying
 * battery. The app therefore keeps what the editor holds, whenever it differs
 * from the saved file, and offers it back the next time that filesystem (a
 * book activity's, or the student's own) is opened.
 *
 * It lives in localStorage, keyed by filesystem id, and deliberately not as a
 * hidden file inside the virtual filesystem: a file there would be mounted into
 * every run, swept into "download as zip", mirrored onto a connected folder's
 * disk, and would need hiding from every listing. localStorage is also
 * synchronous, which is what lets `pagehide` write the last keystrokes as the
 * tab closes — an IndexedDB write started then may never finish.
 */

const DRAFT_KEY_PREFIX = 'pythoncoder-draft:'

/** Anything bigger is not a student's program; skip it rather than fill the quota. */
export const MAX_DRAFT_LENGTH = 1_000_000

export interface EditorDraft {
  /** The open file's path inside the filesystem. */
  path: string
  /** What the editor held, unsaved. */
  content: string
  /** When it was written (ms since the epoch). */
  savedAt: number
}

const draftKey = (fsId: string) => `${DRAFT_KEY_PREFIX}${fsId}`

export function readDraft(fsId: string): EditorDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(fsId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<EditorDraft>
    if (typeof parsed?.path !== 'string' || typeof parsed.content !== 'string' || typeof parsed.savedAt !== 'number') return null
    return { path: parsed.path, content: parsed.content, savedAt: parsed.savedAt }
  } catch {
    return null
  }
}

export function writeDraft(fsId: string, draft: EditorDraft): void {
  if (draft.content.length > MAX_DRAFT_LENGTH) return
  try { localStorage.setItem(draftKey(fsId), JSON.stringify(draft)) } catch { /* quota or storage blocked */ }
}

export function clearDraft(fsId: string): void {
  try { localStorage.removeItem(draftKey(fsId)) } catch { /* ignore */ }
}

/** "today at 14:32", "yesterday at 09:05", or a date for anything older. */
export function describeDraftTime(savedAt: number, now: number = Date.now()): string {
  const when = new Date(savedAt)
  const time = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const dayMs = 24 * 60 * 60 * 1000
  if (savedAt >= startOfToday.getTime()) return `today at ${time}`
  if (savedAt >= startOfToday.getTime() - dayMs) return `yesterday at ${time}`
  return `on ${when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} at ${time}`
}
