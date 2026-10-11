import { useState } from 'react'
import { getGist, gistRawUrl, listUserGists, parseGistLocation, type GistSummary } from '../../../utils/gist'
import { gitHubRawUrl, parseGitHubLocation } from '../../../utils/githubRepo'
import { inputClass, secondaryBtnClass } from '../webWizardShared'

// Point the wizard at the gist the student has just made: paste its address,
// or find it among their gists by GitHub username. A github.com file address
// is taken too, for code that already lives in a repository.

export interface HostedChoice {
  url: string
  /** What the wizard shows as chosen. */
  label: string
}

interface Props {
  token: string
  selected: HostedChoice | null
  onSelect: (choice: HostedChoice | null) => void
}

export function GistFindStep({ token, selected, onSelect }: Props) {
  const [mode, setMode] = useState<'paste' | 'browse'>('paste')
  const [address, setAddress] = useState('')
  const [username, setUsername] = useState('')
  const [gists, setGists] = useState<GistSummary[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const pickFrom = (gist: GistSummary, user: string) => {
    const code = gist.files.filter(f => f.toLowerCase().endsWith('.py'))
    const candidates = code.length ? code : gist.files
    if (candidates.length === 1) {
      onSelect({ url: gistRawUrl(user, gist.id, candidates[0]), label: `${user}'s gist: ${candidates[0]}` })
    } else {
      setGists([{ ...gist, user }])
      setMode('browse')
    }
  }

  const usePasted = async () => {
    const text = address.trim()
    onSelect(null); setError('')
    if (!text) return
    const gist = parseGistLocation(text)
    if (gist?.user && gist.file) {
      onSelect({ url: gistRawUrl(gist.user, gist.id, gist.file), label: `${gist.user}'s gist: ${gist.file}` })
      return
    }
    if (gist) {
      setBusy(true)
      try {
        const found = await getGist(gist.id, token)
        pickFrom(found, found.user || gist.user || '')
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally { setBusy(false) }
      return
    }
    const repoFile = parseGitHubLocation(text)
    if (repoFile?.isFile) {
      onSelect({ url: gitHubRawUrl(repoFile, repoFile.path), label: `${repoFile.owner}/${repoFile.repo}: ${repoFile.path}` })
      return
    }
    setError('That is not a gist address. It should start https://gist.github.com/')
  }

  const loadGists = async () => {
    const user = username.trim()
    if (!user) return
    setBusy(true); setError(''); setGists(null); onSelect(null)
    try {
      const list = await listUserGists(user, token)
      setGists(list)
      if (list.length === 0) setError('No public gists found for that user. A secret gist is not listed — paste its address instead.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="flex gap-1 mb-3">
        {(['paste', 'browse'] as const).map(m => (
          <button key={m} type="button" onClick={() => { setMode(m); setError('') }}
            className={`px-3 py-1 rounded text-xs transition-colors ${mode === m ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
            {m === 'paste' ? 'Paste its address' : 'Find it by username'}
          </button>
        ))}
      </div>

      {mode === 'paste' ? (
        <div className="flex gap-2">
          <input autoFocus type="url" value={address} onChange={e => setAddress(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void usePasted() }}
            placeholder="https://gist.github.com/you/1a2b3c…" className={inputClass} aria-label="Gist address" />
          <button type="button" onClick={() => void usePasted()} disabled={busy || !address.trim()} className={secondaryBtnClass}>
            Use this
          </button>
        </div>
      ) : (
        <div>
          <div className="flex gap-2">
            <input autoFocus type="text" value={username} onChange={e => setUsername(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void loadGists() }}
              placeholder="GitHub username" className={inputClass} aria-label="GitHub username" />
            <button type="button" onClick={() => void loadGists()} disabled={busy || !username.trim()} className={secondaryBtnClass}>
              List gists
            </button>
          </div>
          {gists && gists.length > 0 && (
            <div className="mt-2 max-h-44 overflow-y-auto rounded border border-slate-700 divide-y divide-slate-800">
              {gists.map(gist => (
                <div key={gist.id} className="px-2 py-1.5">
                  {gist.description && <div className="text-[11px] text-slate-400 truncate">{gist.description}</div>}
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {gist.files.map(file => {
                      const url = gistRawUrl(gist.user, gist.id, file)
                      return (
                        <button key={file} type="button"
                          onClick={() => onSelect({ url, label: `${gist.user}'s gist: ${file}` })}
                          className={`px-2 py-0.5 rounded font-mono text-[11px] transition-colors ${selected?.url === url ? 'bg-sky-500/20 text-emerald-300' : 'bg-slate-900/60 text-slate-300 hover:bg-slate-500/20'}`}>
                          {file}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {busy && <div className="text-[11px] text-slate-500 mt-2">Looking…</div>}
      {error && <div className="text-red-400 text-[11px] mt-2">{error}</div>}
      {selected && (
        <div className="mt-2 truncate font-mono text-[11px] text-emerald-300" title={selected.url}>
          ✓ {selected.label}
        </div>
      )}
    </div>
  )
}
