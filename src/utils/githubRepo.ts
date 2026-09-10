// ── Reading a public GitHub repository ─────────────────────────────────────
//
// Teachers paste repository addresses, not file addresses: `.../girlscodingclub`
// rather than `.../girlscodingclub/blob/main/book.json`. A repository address is
// not something the app can fetch — the old behaviour was to hand it to the book
// loader anyway, which fetched GitHub's HTML page and reported "Cannot parse
// book.json", or to build a student link that simply never worked.
//
// So a repository address is treated as somewhere to *look*: this module parses
// it, lists directories, and the pickers built on top let the teacher choose the
// book.json / ZIP inside (or, for a simple learning book, the folder itself).
//
// File *contents* always come from raw.githubusercontent.com via bookSource, so
// only directory listings go through the API here.

import { fetchResourceText } from './bookSource'

export interface GitHubLocation {
  owner: string
  repo: string
  /** null when the address named no branch — resolve it with `resolveBranch`. */
  branch: string | null
  /** Directory or file path within the repo; '' is the repository root. */
  path: string
  /** Whether the address named a file (`/blob/…`, `raw.githubusercontent.com`). */
  isFile: boolean
}

export interface GitHubEntry {
  name: string
  /** Full path within the repository. */
  path: string
  type: 'file' | 'dir'
}

/**
 * Parse a github.com or raw.githubusercontent.com address.
 *
 * Returns null for anything else, which is the signal to treat the address as a
 * plain URL to fetch rather than a repository to browse.
 */
export function parseGitHubLocation(rawUrl: string): GitHubLocation | null {
  let url: URL
  try { url = new URL(rawUrl.trim()) } catch { return null }
  const host = url.hostname.toLowerCase()
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)

  if (host === 'raw.githubusercontent.com') {
    const [owner, repo, branch, ...rest] = segments
    if (!owner || !repo || !branch) return null
    return { owner, repo: stripGitSuffix(repo), branch, path: rest.join('/'), isFile: rest.length > 0 }
  }

  if (host !== 'github.com' && host !== 'www.github.com') return null
  const [owner, rawRepo, kind, branch, ...rest] = segments
  if (!owner || !rawRepo) return null
  const repo = stripGitSuffix(rawRepo)
  if (!kind) return { owner, repo, branch: null, path: '', isFile: false }
  if (kind !== 'tree' && kind !== 'blob' && kind !== 'raw') return null
  if (!branch) return { owner, repo, branch: null, path: '', isFile: false }
  return { owner, repo, branch, path: rest.join('/'), isFile: kind !== 'tree' }
}

function stripGitSuffix(repo: string): string {
  return repo.replace(/\.git$/i, '')
}

/** The github.com address a location came from (or would come from). */
export function gitHubLocationUrl(loc: GitHubLocation): string {
  const branch = loc.branch ?? 'HEAD'
  if (!loc.path) return `https://github.com/${loc.owner}/${loc.repo}/tree/${branch}`
  const kind = loc.isFile ? 'blob' : 'tree'
  return `https://github.com/${loc.owner}/${loc.repo}/${kind}/${branch}/${loc.path}`
}

/** The raw.githubusercontent.com address of one file in a repository. */
export function gitHubRawUrl(loc: GitHubLocation, path: string): string {
  const clean = path.replace(/^\/+/, '')
  return `https://raw.githubusercontent.com/${loc.owner}/${loc.repo}/${loc.branch ?? 'HEAD'}/${clean}`
}

/** `owner/repo`, or `owner/repo/sub/dir` — what a picker shows as the location. */
export function gitHubLocationLabel(loc: GitHubLocation): string {
  return [`${loc.owner}/${loc.repo}`, loc.path].filter(Boolean).join('/')
}

export function gitHubParentPath(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? '' : path.slice(0, cut)
}

// ── API access ──────────────────────────────────────────────────────────────

export class GitHubRateLimitError extends Error {
  constructor() {
    super('GitHub is rate limiting this network. Add a Personal Access Token to raise the limit, or try again in a few minutes.')
    this.name = 'GitHubRateLimitError'
  }
}

async function ghFetch<T>(path: string, token: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`
  const resp = await fetch(`https://api.github.com${path}`, { headers })
  if (resp.status === 403 || resp.status === 429) {
    if (resp.headers.get('x-ratelimit-remaining') === '0') throw new GitHubRateLimitError()
    throw new Error(`GitHub API error: HTTP ${resp.status}`)
  }
  if (resp.status === 404) throw new Error('Not found. Check the username / repository is public.')
  if (!resp.ok) throw new Error(`GitHub API error: HTTP ${resp.status}`)
  return resp.json() as Promise<T>
}

export interface GitHubRepoSummary { name: string; full_name: string; default_branch: string }

export function listUserRepos(username: string, token: string): Promise<GitHubRepoSummary[]> {
  return ghFetch<GitHubRepoSummary[]>(
    `/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`, token)
}

/**
 * Fill in a location's branch when the address did not name one.
 *
 * Everything else here can fall back to jsDelivr, but that needs a concrete
 * branch too, so a rate-limited API leaves 'main' as the best guess — wrong only
 * for the shrinking number of repos still on 'master', where the listing then
 * fails with a clear "not found" rather than silently browsing the wrong tree.
 */
export async function resolveBranch(loc: GitHubLocation, token: string): Promise<GitHubLocation> {
  if (loc.branch) return loc
  try {
    const repo = await ghFetch<{ default_branch: string }>(`/repos/${loc.owner}/${loc.repo}`, token)
    return { ...loc, branch: repo.default_branch || 'main' }
  } catch (e) {
    if (e instanceof GitHubRateLimitError) return { ...loc, branch: 'main' }
    throw e
  }
}

interface ContentsEntry { name: string; path: string; type: string }

/**
 * List one directory of a repository.
 *
 * GitHub's own API is authoritative and sees pushes immediately, but it allows
 * only ~60 unauthenticated requests an hour *per IP* — and a school NATs a whole
 * cohort behind one address, so a class opening a student link together would
 * exhaust it. jsDelivr's data API has no such limit and serves the same tree, at
 * the cost of a cache that can lag a push by a few hours, which makes it the
 * right fallback rather than the first choice.
 */
export async function listDirectory(loc: GitHubLocation, token: string): Promise<GitHubEntry[]> {
  const path = loc.path ? `/${loc.path.split('/').map(encodeURIComponent).join('/')}` : ''
  try {
    const contents = await ghFetch<ContentsEntry[] | ContentsEntry>(
      `/repos/${loc.owner}/${loc.repo}/contents${path}?ref=${encodeURIComponent(loc.branch ?? 'HEAD')}`, token)
    if (!Array.isArray(contents)) throw new Error(`${loc.path || '/'} is a file, not a folder.`)
    return contents
      .filter(entry => entry.type === 'file' || entry.type === 'dir')
      .map(entry => ({ name: entry.name, path: entry.path, type: entry.type === 'dir' ? 'dir' as const : 'file' as const }))
      .sort(compareEntries)
  } catch (e) {
    if (!(e instanceof GitHubRateLimitError)) throw e
    return listDirectoryViaJsDelivr(loc)
  }
}

interface JsDelivrNode { type: string; name: string; files?: JsDelivrNode[] }

async function listDirectoryViaJsDelivr(loc: GitHubLocation): Promise<GitHubEntry[]> {
  const version = encodeURIComponent(loc.branch ?? 'HEAD')
  const url = `https://data.jsdelivr.com/v1/packages/gh/${loc.owner}/${loc.repo}@${version}?structure=tree`
  let tree: JsDelivrNode[]
  try {
    const payload = JSON.parse(await fetchResourceText(url)) as { files?: JsDelivrNode[] }
    tree = payload.files ?? []
  } catch {
    throw new GitHubRateLimitError()
  }
  for (const segment of loc.path.split('/').filter(Boolean)) {
    const node = tree.find(n => n.name === segment && n.type === 'directory')
    if (!node) return []
    tree = node.files ?? []
  }
  return tree
    .map(node => ({
      name: node.name,
      path: [loc.path, node.name].filter(Boolean).join('/'),
      type: node.type === 'directory' ? 'dir' as const : 'file' as const,
    }))
    .sort(compareEntries)
}

function compareEntries(a: GitHubEntry, b: GitHubEntry): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Whether an entry is something a learning book can be opened from directly.
 * Matched exactly as `isBookUrl` routes it, so anything offered here is
 * something the book loader will in fact treat as a manifest.
 */
export function isBookFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('book.json') || lower.endsWith('.zip')
}
