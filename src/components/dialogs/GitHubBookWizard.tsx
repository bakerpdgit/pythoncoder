import { useState } from 'react'
import { getStoredGitHubToken, persistGitHubToken } from '../../utils/storage'
import { WizardHeader, WizardFooter, ShareLinkRow, inputClass, secondaryBtnClass, type WizardProps } from './webWizardShared'

// Open a learning book from a public GitHub repo — either by pasting a URL to a
// book.json / book ZIP, or by browsing a user's public repos. GitHub content is
// fetched directly from raw.githubusercontent.com (CORS *), so no proxy and no
// jsDelivr cache — teachers' updates show up immediately.

interface Repo { name: string; full_name: string; default_branch: string }
interface TreeEntry { path: string; type: string }

async function ghFetch<T>(path: string, token: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`
  const resp = await fetch(`https://api.github.com${path}`, { headers })
  if (resp.status === 403 && resp.headers.get('x-ratelimit-remaining') === '0') {
    throw new Error('GitHub API rate limit reached. Add a Personal Access Token below to raise the limit.')
  }
  if (resp.status === 404) throw new Error('Not found. Check the username / repository is public.')
  if (!resp.ok) throw new Error(`GitHub API error: HTTP ${resp.status}`)
  return resp.json() as Promise<T>
}

function rawUrl(fullName: string, branch: string, path: string): string {
  return `https://raw.githubusercontent.com/${fullName}/${branch}/${path}`
}

export function GitHubBookWizard({ onBack, onOpen }: WizardProps) {
  const [mode, setMode] = useState<'url' | 'browse'>('url')
  const [token, setToken] = useState(getStoredGitHubToken())
  const [showToken, setShowToken] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // URL mode
  const [url, setUrl] = useState('')

  // Browse mode
  const [username, setUsername] = useState('')
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null)
  const [candidates, setCandidates] = useState<string[] | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const saveToken = (t: string) => { setToken(t); persistGitHubToken(t) }

  const loadRepos = async () => {
    const user = username.trim()
    if (!user) return
    setBusy(true); setError(''); setRepos(null); setSelectedRepo(null); setCandidates(null); setSelectedFile(null)
    try {
      const list = await ghFetch<Repo[]>(`/users/${encodeURIComponent(user)}/repos?per_page=100&sort=updated`, token)
      setRepos(list)
      if (list.length === 0) setError('No public repositories found for that user.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const loadCandidates = async (repo: Repo) => {
    setBusy(true); setError(''); setSelectedRepo(repo); setCandidates(null); setSelectedFile(null)
    try {
      const tree = await ghFetch<{ tree: TreeEntry[] }>(
        `/repos/${repo.full_name}/git/trees/${repo.default_branch}?recursive=1`, token)
      const found = tree.tree
        .filter(t => t.type === 'blob' &&
          (t.path.toLowerCase().endsWith('book.json') || t.path.toLowerCase().endsWith('.zip')))
        .map(t => t.path)
        .sort((a, b) => a.localeCompare(b))
      setCandidates(found)
      if (found.length === 0) setError('No book.json or .zip found in that repository.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const selectedResourceUrl =
    mode === 'url'
      ? (/^https?:\/\//i.test(url.trim()) ? url.trim() : null)
      : (selectedRepo && selectedFile ? rawUrl(selectedRepo.full_name, selectedRepo.default_branch, selectedFile) : null)

  return (
    <div>
      <WizardHeader title="Open from GitHub"
        subtitle="Load a learning book from a public GitHub repository. Content is read straight from GitHub (raw), so updates you push are picked up immediately." />

      {/* Mode tabs */}
      <div className="flex gap-1 mb-3">
        {(['url', 'browse'] as const).map(m => (
          <button key={m} type="button" onClick={() => { setMode(m); setError('') }}
            className={`px-3 py-1 rounded text-xs transition-colors ${mode === m ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
            {m === 'url' ? 'Paste a URL' : 'Browse a user'}
          </button>
        ))}
      </div>

      {mode === 'url' ? (
        <input autoFocus type="url" value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://github.com/user/repo/blob/main/book.json"
          className={inputClass} />
      ) : (
        <div>
          <div className="flex gap-2">
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void loadRepos() }}
              placeholder="GitHub username" className={inputClass} />
            <button type="button" onClick={() => void loadRepos()} disabled={busy || !username.trim()}
              className={secondaryBtnClass}>List repos</button>
          </div>

          {repos && (
            <div className="mt-2 max-h-32 overflow-y-auto rounded border border-slate-700 divide-y divide-slate-800">
              {repos.map(r => (
                <button key={r.full_name} type="button" onClick={() => void loadCandidates(r)}
                  className={`w-full text-left px-2 py-1.5 text-xs transition-colors ${selectedRepo?.full_name === r.full_name ? 'bg-slate-700 text-emerald-400' : 'text-slate-300 hover:bg-slate-700'}`}>
                  {r.name}
                </button>
              ))}
            </div>
          )}

          {candidates && candidates.length > 0 && (
            <div className="mt-2">
              <div className="text-[11px] text-slate-400 mb-1">Choose a book file:</div>
              <div className="max-h-32 overflow-y-auto rounded border border-slate-700 divide-y divide-slate-800">
                {candidates.map(p => (
                  <button key={p} type="button" onClick={() => setSelectedFile(p)}
                    className={`w-full text-left px-2 py-1.5 text-xs font-mono transition-colors ${selectedFile === p ? 'bg-slate-700 text-emerald-400' : 'text-slate-300 hover:bg-slate-700'}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Optional token */}
      <div className="mt-3">
        <button type="button" onClick={() => setShowToken(o => !o)}
          className="text-[11px] text-slate-400 hover:text-slate-200 underline decoration-dotted">
          {showToken ? 'Hide' : 'Optional: add a Personal Access Token (higher rate limit)'}
        </button>
        {showToken && (
          <div className="mt-1">
            <input type="password" value={token} onChange={e => saveToken(e.target.value)}
              placeholder="ghp_… (stored in this browser only)" className={inputClass} />
            <div className="text-[10px] text-slate-500 mt-1">
              A classic or fine-grained token with public read access raises the limit from ~60 to 5000 requests/hour.
            </div>
          </div>
        )}
      </div>

      {error && <div className="text-red-400 text-[11px] mt-2">{error}</div>}
      {selectedResourceUrl && <ShareLinkRow resourceUrl={selectedResourceUrl} />}

      <WizardFooter onBack={onBack} busy={busy}
        onOpen={() => selectedResourceUrl && onOpen(selectedResourceUrl)}
        openLabel="Open book" openDisabled={!selectedResourceUrl} />
    </div>
  )
}
