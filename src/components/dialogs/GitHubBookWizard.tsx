import { useMemo, useState } from 'react'
import { getStoredGitHubToken, persistGitHubToken } from '../../utils/storage'
import {
  gitHubLocationLabel, gitHubRawUrl, isBookFileName, listUserRepos, parseGitHubLocation,
  type GitHubLocation, type GitHubRepoSummary,
} from '../../utils/githubRepo'
import { GitHubRepoBrowser, type RepoSelection } from './GitHubRepoBrowser'
import { SimpleBookCheckbox } from './SimpleBookOption'
import { WizardHeader, WizardFooter, ShareLinkRow, inputClass, secondaryBtnClass, type WizardProps } from './webWizardShared'

// Open a learning book from a public GitHub repo — either by pasting an address
// or by browsing a user's public repos. GitHub content is fetched directly from
// raw.githubusercontent.com (CORS *), so no proxy and no jsDelivr cache:
// teachers' updates show up immediately.
//
// A pasted *repository* address is not a book file, and used to be accepted
// anyway — producing a link that opened to a parse error. It now opens the repo
// browser so the actual book.json / ZIP gets picked, or (for a simple learning
// book) the folder itself.

export function GitHubBookWizard({ onBack, onOpen }: WizardProps) {
  const [mode, setMode] = useState<'url' | 'browse'>('url')
  const [token, setToken] = useState(getStoredGitHubToken())
  const [showToken, setShowToken] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [simple, setSimple] = useState(false)
  const [selection, setSelection] = useState<RepoSelection | null>(null)

  // URL mode
  const [url, setUrl] = useState('')
  const [submittedUrl, setSubmittedUrl] = useState('')

  // Browse mode
  const [username, setUsername] = useState('')
  const [repos, setRepos] = useState<GitHubRepoSummary[] | null>(null)
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepoSummary | null>(null)

  const saveToken = (t: string) => { setToken(t); persistGitHubToken(t) }

  const loadRepos = async () => {
    const user = username.trim()
    if (!user) return
    setBusy(true); setError(''); setRepos(null); setSelectedRepo(null); setSelection(null)
    try {
      const list = await listUserRepos(user, token)
      setRepos(list)
      if (list.length === 0) setError('No public repositories found for that user.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const submitUrl = () => {
    const pasted = url.trim()
    setSelection(null)
    setSubmittedUrl(pasted)
    setError('')
    if (!pasted) return
    if (!parseGitHubLocation(pasted)) {
      setError('That is not a GitHub address. For another host, go back and choose “Other public URL”.')
    }
  }

  // The address the browser starts at: the pasted repository/folder, or the repo
  // chosen from the user's list. A pasted *file* address needs no browsing.
  const browseStart = useMemo<GitHubLocation | null>(() => {
    if (mode === 'browse') {
      if (!selectedRepo) return null
      const [owner, repo] = selectedRepo.full_name.split('/')
      return { owner, repo, branch: selectedRepo.default_branch, path: '', isFile: false }
    }
    const location = submittedUrl ? parseGitHubLocation(submittedUrl) : null
    return location && !location.isFile ? location : null
  }, [mode, selectedRepo, submittedUrl])

  const pastedFile = mode === 'url' && submittedUrl ? parseGitHubLocation(submittedUrl) : null
  const pastedFileUrl = pastedFile?.isFile ? gitHubRawUrl(pastedFile, pastedFile.path) : null

  // A file address is usable as it is; a browsed choice has to match what the
  // teacher said they were opening.
  const resourceUrl = pastedFileUrl ?? (
    selection && (simple ? selection.kind === 'folder' : selection.kind !== 'folder') ? selection.url : null)

  const mismatch = !resourceUrl && (
    (pastedFile?.isFile && !simple && !isBookFileName(pastedFile.path.split('/').pop() ?? ''))
      ? 'That file is not a book.json or a ZIP.'
      : selection && simple ? 'Choose a folder — a simple learning book has no book.json to point at.'
      : selection ? 'Choose a book.json or a ZIP, or tick “simple learning book” to use a folder as it is.'
      : '')

  return (
    <div>
      <WizardHeader title="Open from GitHub"
        subtitle="Load a learning book from a public GitHub repository. Content is read straight from GitHub (raw), so updates you push are picked up immediately." />

      {/* Mode tabs */}
      <div className="flex gap-1 mb-3">
        {(['url', 'browse'] as const).map(m => (
          <button key={m} type="button" onClick={() => { setMode(m); setError(''); setSelection(null) }}
            className={`px-3 py-1 rounded text-xs transition-colors ${mode === m ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
            {m === 'url' ? 'Paste a URL' : 'Browse a user'}
          </button>
        ))}
      </div>

      {mode === 'url' ? (
        <div className="flex gap-2">
          <input autoFocus type="url" value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitUrl() }}
            placeholder="https://github.com/user/repo — or a link to a book.json"
            className={inputClass} />
          <button type="button" onClick={submitUrl} disabled={!url.trim()} className={secondaryBtnClass}>
            Look inside
          </button>
        </div>
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
                <button key={r.full_name} type="button"
                  onClick={() => { setSelectedRepo(r); setSelection(null); setError('') }}
                  className={`w-full text-left px-2 py-1.5 text-xs transition-colors ${selectedRepo?.full_name === r.full_name ? 'bg-slate-700 text-emerald-400' : 'text-slate-300 hover:bg-slate-700'}`}>
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <SimpleBookCheckbox checked={simple} onChange={setSimple} />

      {browseStart && (
        <GitHubRepoBrowser start={browseStart} token={token} allowFolder={simple}
          selected={selection} onSelect={setSelection} />
      )}

      {pastedFileUrl && (
        <div className="mt-2 truncate font-mono text-[11px] text-emerald-300" title={gitHubLocationLabel(pastedFile!)}>
          {gitHubLocationLabel(pastedFile!)}
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
      {!error && mismatch && <div className="dialog-warning-text text-amber-300 text-[11px] mt-2">{mismatch}</div>}
      {resourceUrl && <ShareLinkRow resourceUrl={resourceUrl} options={{ simple }} />}

      <WizardFooter onBack={onBack} busy={busy}
        onOpen={() => resourceUrl && onOpen(resourceUrl, { simple })}
        openLabel="Open book" openDisabled={!resourceUrl} />
    </div>
  )
}
