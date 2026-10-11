import { useMemo, useState } from 'react'
import {
  gitHubLocationLabel, gitHubRawUrl, listUserRepos, parseGitHubLocation,
  type GitHubLocation, type GitHubRepoSummary,
} from '../../utils/githubRepo'
import { driveDirectUrl } from '../../utils/sharedResource'
import { getStoredGitHubToken, persistGitHubToken } from '../../utils/storage'
import { GitHubRepoBrowser, type RepoSelection } from './GitHubRepoBrowser'
import { inputClass, secondaryBtnClass } from './webWizardShared'

// Find something online to open or link to: a GitHub repository, folder or ZIP
// (pasted, or browsed by username), a Google Drive file, or any other address.
//
// It only finds. What the address holds — a learning book, a simple learning
// book or plain files — is decided afterwards from its contents
// (`detectResourceKind`), so nothing here asks.

export interface FoundResource {
  url: string
  /** What the finder shows as chosen. */
  label: string
}

export type ResourceSource = 'github' | 'drive' | 'other'

interface Props {
  selected: FoundResource | null
  onSelect: (found: FoundResource | null) => void
  /** Which tabs to offer, first one open. Default: all three. */
  sources?: ResourceSource[]
  /** A line under the Drive tab's box, e.g. that only a ZIP will do. */
  driveNote?: string
}

const SOURCE_LABELS: Record<ResourceSource, string> = {
  github: 'GitHub',
  drive: 'Google Drive',
  other: 'Another address',
}

export function ResourceFinder({ selected, onSelect, sources = ['github', 'drive', 'other'], driveNote }: Props) {
  const [source, setSource] = useState<ResourceSource>(sources[0])
  const switchTo = (next: ResourceSource) => { setSource(next); onSelect(null) }
  return (
    <div>
      {sources.length > 1 && (
        <div className="flex gap-1 mb-3" role="tablist" aria-label="Where it is">
          {sources.map(s => (
            <button key={s} type="button" role="tab" aria-selected={source === s} onClick={() => switchTo(s)}
              className={`px-3 py-1 rounded text-xs transition-colors ${source === s ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
              {SOURCE_LABELS[s]}
            </button>
          ))}
        </div>
      )}
      {source === 'github' && <GitHubFinder selected={selected} onSelect={onSelect} />}
      {source === 'drive' && <DriveFinder onSelect={onSelect} note={driveNote} />}
      {source === 'other' && <AddressFinder onSelect={onSelect} />}
      {selected && (
        <div className="mt-2 truncate font-mono text-[11px] text-emerald-300" title={selected.url}>
          ✓ {selected.label}
        </div>
      )}
    </div>
  )
}

function GitHubFinder({ selected, onSelect }: { selected: FoundResource | null; onSelect: (found: FoundResource | null) => void }) {
  const [mode, setMode] = useState<'browse' | 'paste'>('browse')
  const [token, setToken] = useState(getStoredGitHubToken())
  const [showToken, setShowToken] = useState(false)
  const [username, setUsername] = useState('')
  const [repos, setRepos] = useState<GitHubRepoSummary[] | null>(null)
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepoSummary | null>(null)
  const [address, setAddress] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [selection, setSelection] = useState<RepoSelection | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const choose = (next: RepoSelection | null) => {
    setSelection(next)
    onSelect(next ? { url: next.url, label: next.kind === 'folder' ? next.label : `${next.label} (ZIP)` } : null)
  }

  const loadRepos = async () => {
    const user = username.trim()
    if (!user) return
    setBusy(true); setError(''); setRepos(null); setSelectedRepo(null); choose(null)
    try {
      const list = await listUserRepos(user, token)
      setRepos(list)
      if (list.length === 0) setError('No public repositories found for that user. Check the repository is Public.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  const submitAddress = () => {
    const text = address.trim()
    setSubmitted(text); setError(''); choose(null)
    if (!text) return
    const loc = parseGitHubLocation(text)
    if (!loc) { setError('That is not a GitHub address. It should start https://github.com/'); return }
    if (loc.isFile) onSelect({ url: gitHubRawUrl(loc, loc.path), label: gitHubLocationLabel(loc) })
  }

  const pasted = mode === 'paste' && submitted ? parseGitHubLocation(submitted) : null
  const browseStart = useMemo<GitHubLocation | null>(() => {
    if (mode === 'browse') {
      if (!selectedRepo) return null
      const [owner, repo] = selectedRepo.full_name.split('/')
      return { owner, repo, branch: selectedRepo.default_branch, path: '', isFile: false }
    }
    return pasted && !pasted.isFile ? pasted : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedRepo, submitted])

  return (
    <div>
      <div className="flex gap-1 mb-2">
        {(['browse', 'paste'] as const).map(m => (
          <button key={m} type="button" onClick={() => { setMode(m); setError(''); choose(null) }}
            className={`px-2 py-0.5 rounded text-[11px] transition-colors ${mode === m ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {m === 'browse' ? 'Find by username' : 'Paste an address'}
          </button>
        ))}
      </div>

      {mode === 'browse' ? (
        <div>
          <div className="flex gap-2">
            <input autoFocus type="text" value={username} onChange={e => setUsername(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void loadRepos() }}
              placeholder="GitHub username" className={inputClass} aria-label="GitHub username" />
            <button type="button" onClick={() => void loadRepos()} disabled={busy || !username.trim()} className={secondaryBtnClass}>
              List repos
            </button>
          </div>
          {repos && repos.length > 0 && (
            <div className="mt-2 max-h-28 overflow-y-auto rounded border border-slate-700 divide-y divide-slate-800">
              {repos.map(r => (
                <button key={r.full_name} type="button"
                  onClick={() => { setSelectedRepo(r); choose(null); setError('') }}
                  className={`w-full text-left px-2 py-1.5 text-xs transition-colors ${selectedRepo?.full_name === r.full_name ? 'bg-slate-700 text-emerald-400' : 'text-slate-300 hover:bg-slate-700'}`}>
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <input autoFocus type="url" value={address} onChange={e => setAddress(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitAddress() }}
            placeholder="https://github.com/you/repo — a repository, folder or file" className={inputClass} aria-label="GitHub address" />
          <button type="button" onClick={submitAddress} disabled={!address.trim()} className={secondaryBtnClass}>
            Look inside
          </button>
        </div>
      )}

      {browseStart && <GitHubRepoBrowser start={browseStart} token={token} selected={selection} onSelect={choose} />}
      {busy && <div className="text-[11px] text-slate-500 mt-2">Looking…</div>}
      {error && <div className="text-red-400 text-[11px] mt-2">{error}</div>}
      {!selected && browseStart && !error && (
        <div className="text-[11px] text-slate-500 mt-1">Open folders to look inside. Choose a folder, or a ZIP.</div>
      )}

      <div className="mt-2">
        <button type="button" onClick={() => setShowToken(o => !o)}
          className="text-[11px] text-slate-400 hover:text-slate-200 underline decoration-dotted">
          {showToken ? 'Hide' : 'Optional: add a Personal Access Token (higher rate limit)'}
        </button>
        {showToken && (
          <div className="mt-1">
            <input type="password" value={token} onChange={e => { setToken(e.target.value); persistGitHubToken(e.target.value) }}
              placeholder="ghp_… (stored in this browser only)" className={inputClass} />
            <div className="text-[10px] text-slate-500 mt-1">
              A token with public read access raises the limit from ~60 to 5000 requests an hour.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DriveFinder({ onSelect, note }: { onSelect: (found: FoundResource | null) => void; note?: string }) {
  const [address, setAddress] = useState('')
  const direct = driveDirectUrl(address)
  return (
    <div>
      <input autoFocus type="url" value={address} aria-label="Google Drive link"
        onChange={e => {
          setAddress(e.target.value)
          const next = driveDirectUrl(e.target.value)
          onSelect(next ? { url: next, label: 'Google Drive file' } : null)
        }}
        placeholder="https://drive.google.com/file/d/.../view?usp=sharing" className={inputClass} />
      {address.trim() && !direct && (
        <div className="dialog-warning-text text-amber-400 text-[11px] mt-1">
          That does not look like a Google Drive file link. Use <strong>Copy link</strong> in Drive&apos;s Share box.
        </div>
      )}
      <div className="text-[11px] text-slate-500 mt-1">
        {note ?? 'The file must be shared with “Anyone with the link”. A folder on Drive cannot be opened — share a ZIP of it.'}
      </div>
    </div>
  )
}

function AddressFinder({ onSelect }: { onSelect: (found: FoundResource | null) => void }) {
  const [address, setAddress] = useState('')
  const trimmed = address.trim()
  const valid = /^https:\/\/\S+$/i.test(trimmed)
  return (
    <div>
      <input autoFocus type="url" value={address} aria-label="Address"
        onChange={e => {
          setAddress(e.target.value)
          const next = e.target.value.trim()
          onSelect(/^https:\/\/\S+$/i.test(next) ? { url: next, label: next } : null)
        }}
        placeholder="https://… a ZIP, a book.json or a file" className={inputClass} />
      {trimmed && !valid && (
        <div className="dialog-warning-text text-amber-400 text-[11px] mt-1">The address must start https://</div>
      )}
      <div className="text-[11px] text-slate-500 mt-1">
        Fetched through this site&apos;s proxy if the host does not allow it directly.
      </div>
    </div>
  )
}
