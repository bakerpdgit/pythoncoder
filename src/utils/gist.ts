// ── GitHub Gists ────────────────────────────────────────────────────────────
//
// A gist is the shortest way to put one file somewhere public: paste, name it,
// Create gist. No repository, no upload. So it is the GitHub route offered for
// sharing a single file.
//
// The link handed out points at the gist's *unpinned* raw address
// (`/raw/<file>`), which always serves the newest revision: a student who
// fixes the gist does not need a new link. Listing a user's gists goes through
// the API (rate limited per IP), but only the sharer ever does that — opening
// the link fetches gist.githubusercontent.com directly.

import { ghFetch } from './githubRepo'

export interface GistLocation {
  /** Null when the address named only the gist's id. */
  user: string | null
  id: string
  /** The file a raw address named, if it named one. */
  file: string | null
}

const GIST_ID = /^[0-9a-f]{20,40}$/i

/** Parse a gist.github.com or gist.githubusercontent.com address. */
export function parseGistLocation(rawUrl: string): GistLocation | null {
  let url: URL
  try { url = new URL(rawUrl.trim()) } catch { return null }
  const host = url.hostname.toLowerCase()
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)

  if (host === 'gist.githubusercontent.com') {
    const [user, id, raw, ...rest] = segments
    if (!user || !id || !GIST_ID.test(id) || raw !== 'raw') return null
    // `/raw/<file>` or `/raw/<revision>/<file>`.
    const file = rest.length ? rest[rest.length - 1] : null
    return { user, id, file }
  }

  if (host !== 'gist.github.com') return null
  if (segments.length === 1 && GIST_ID.test(segments[0])) return { user: null, id: segments[0], file: null }
  const [user, id] = segments
  if (!user || !id || !GIST_ID.test(id)) return null
  return { user, id, file: null }
}

/** The always-latest raw address of one file in a gist. */
export function gistRawUrl(user: string, id: string, file: string): string {
  return `https://gist.githubusercontent.com/${user}/${id}/raw/${encodeURIComponent(file)}`
}

export interface GistSummary {
  id: string
  user: string
  description: string
  files: string[]
  updatedAt: string
}

interface ApiGist {
  id: string
  description: string | null
  owner?: { login?: string } | null
  files?: Record<string, { filename?: string }>
  updated_at?: string
}

function toSummary(gist: ApiGist, fallbackUser: string): GistSummary {
  return {
    id: gist.id,
    user: gist.owner?.login ?? fallbackUser,
    description: gist.description ?? '',
    files: Object.values(gist.files ?? {}).map((f, i) => f.filename ?? Object.keys(gist.files ?? {})[i]),
    updatedAt: gist.updated_at ?? '',
  }
}

/** A user's public gists, newest first. */
export async function listUserGists(username: string, token: string): Promise<GistSummary[]> {
  const gists = await ghFetch<ApiGist[]>(
    `/users/${encodeURIComponent(username)}/gists?per_page=100`, token)
  return gists.map(g => toSummary(g, username))
}

/** One gist, by id — what a pasted gist address needs to name its files. */
export async function getGist(id: string, token: string): Promise<GistSummary> {
  return toSummary(await ghFetch<ApiGist>(`/gists/${encodeURIComponent(id)}`, token), '')
}
