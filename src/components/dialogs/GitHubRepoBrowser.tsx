import { useCallback, useEffect, useState } from 'react'
import {
  gitHubLocationLabel, gitHubLocationUrl, gitHubParentPath, gitHubRawUrl, isBookFileName,
  listDirectory, resolveBranch, type GitHubEntry, type GitHubLocation,
} from '../../utils/githubRepo'

// Browse a public GitHub repository and pick the thing a learning book actually
// lives in.
//
// Teachers paste the address of the repository, not of a file inside it. Handing
// that straight to the book loader is what produced "Cannot parse book.json from
// https://github.com/…" and student links that opened to nothing, so a
// repository address now opens this browser instead: click into folders, choose
// a `book.json` or a book ZIP — or, for a simple learning book, choose a folder.

export interface RepoSelection {
  /** What to open or link to: a raw file address, or a folder's github.com address. */
  url: string
  kind: 'book' | 'zip' | 'folder'
  /** Repo-relative path, for display. */
  label: string
}

interface Props {
  /** Where to start browsing. Its branch is resolved here if the address omitted one. */
  start: GitHubLocation
  token: string
  /**
   * Offer the folder itself as a choice. A simple learning book *is* a folder
   * of `.py` files, so there is no manifest file to point at.
   */
  allowFolder?: boolean
  selected: RepoSelection | null
  onSelect: (selection: RepoSelection | null) => void
}

export function GitHubRepoBrowser({ start, token, allowFolder, selected, onSelect }: Props) {
  const [location, setLocation] = useState<GitHubLocation | null>(null)
  const [entries, setEntries] = useState<GitHubEntry[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const browse = useCallback(async (next: GitHubLocation) => {
    setBusy(true); setError(''); setEntries(null)
    try {
      const resolved = await resolveBranch(next, token)
      setLocation(resolved)
      setEntries(await listDirectory(resolved, token))
    } catch (e) {
      setLocation(next)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [token])

  // Re-browse whenever the caller points somewhere else. Keyed on the address
  // rather than the object so a re-render with an equal location is not a move.
  const startUrl = gitHubLocationUrl(start)
  useEffect(() => {
    onSelect(null)
    void browse(start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startUrl, browse])

  const here = location ?? start
  const atStart = here.path === start.path
  const folderSelection: RepoSelection = {
    url: gitHubLocationUrl(here), kind: 'folder', label: gitHubLocationLabel(here),
  }
  const isFolderSelected = selected?.kind === 'folder' && selected.url === folderSelection.url

  return (
    <div className="mt-2 rounded border border-slate-700 bg-slate-900/40">
      <div className="flex items-center gap-2 border-b border-slate-700 px-2 py-1.5">
        <button type="button" disabled={atStart || busy}
          onClick={() => void browse({ ...here, path: gitHubParentPath(here.path) })}
          title="Up one folder"
          className="text-slate-400 hover:text-slate-100 disabled:opacity-30 disabled:hover:text-slate-400">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12l6-6M5 12l6 6" />
          </svg>
        </button>
        <span className="flex-1 min-w-0 truncate font-mono text-[11px] text-slate-400" title={gitHubLocationLabel(here)}>
          {gitHubLocationLabel(here)}
        </span>
        {busy && <span className="flex-shrink-0 text-[10px] text-slate-500">loading…</span>}
      </div>

      {allowFolder && (
        <button type="button" onClick={() => onSelect(folderSelection)}
          className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors ${isFolderSelected ? 'bg-sky-500/20 text-emerald-300' : 'text-slate-300 hover:bg-slate-500/10'}`}>
          <svg className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          <span className="truncate">Use this folder as the book</span>
        </button>
      )}

      {error && <div className="px-2 py-1.5 text-[11px] text-red-400">{error}</div>}

      <div className="max-h-44 overflow-y-auto divide-y divide-slate-800">
        {entries?.length === 0 && !error && (
          <div className="px-2 py-1.5 text-[11px] text-slate-500">This folder is empty.</div>
        )}
        {entries?.map(entry => {
          if (entry.type === 'dir') {
            return (
              <button key={entry.path} type="button" onClick={() => void browse({ ...here, path: entry.path })}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-slate-300 transition-colors hover:bg-slate-500/10">
                <svg className="w-3.5 h-3.5 flex-shrink-0 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="flex-1 truncate font-mono text-[11px]">{entry.name}</span>
                <span className="flex-shrink-0 text-slate-600">›</span>
              </button>
            )
          }
          const selectable = isBookFileName(entry.name)
          const isSelected = selected?.url === gitHubRawUrl(here, entry.path)
          if (!selectable) {
            return (
              <div key={entry.path} className="px-2 py-1.5 font-mono text-[11px] text-slate-600">{entry.name}</div>
            )
          }
          return (
            <button key={entry.path} type="button"
              onClick={() => onSelect({
                url: gitHubRawUrl(here, entry.path),
                kind: entry.name.toLowerCase().endsWith('.zip') ? 'zip' : 'book',
                label: entry.path,
              })}
              className={`w-full px-2 py-1.5 text-left font-mono text-[11px] transition-colors ${isSelected ? 'bg-sky-500/20 text-emerald-300' : 'text-slate-300 hover:bg-slate-500/10'}`}>
              {entry.name}
            </button>
          )
        })}
      </div>

      {!allowFolder && entries && !entries.some(e => e.type === 'file' && isBookFileName(e.name)) && !error && (
        <div className="border-t border-slate-700 px-2 py-1.5 text-[11px] text-slate-500">
          No <code className="font-mono">book.json</code> or ZIP here — open a folder above, or tick
          &ldquo;simple learning book&rdquo; to use a folder of <code className="font-mono">.py</code> files as it is.
        </div>
      )}
    </div>
  )
}
