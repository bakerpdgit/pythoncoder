import { useEffect, useState, type RefObject } from 'react'

interface LearningTutorial {
  name: string
  github: string
}

interface Props {
  menuRef: RefObject<HTMLDivElement>
  isOpen: boolean
  onToggleOpen: () => void
  onOpenTutorial: (githubUrl: string) => void
}

function isTutorialCatalog(value: unknown): value is LearningTutorial[] {
  return Array.isArray(value) && value.every(item =>
    typeof item === 'object' && item !== null
    && typeof (item as LearningTutorial).name === 'string'
    && typeof (item as LearningTutorial).github === 'string')
}

function repositoryLabel(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/+|\/+$/g, '')
  } catch {
    return url
  }
}

export function LearningMenu({ menuRef, isOpen, onToggleOpen, onOpenTutorial }: Props) {
  const [tutorials, setTutorials] = useState<LearningTutorial[]>([])
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const loadCatalog = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}learning-tutorials.json`, {
          cache: 'no-cache',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const catalog: unknown = await response.json()
        if (!isTutorialCatalog(catalog)) throw new Error('Invalid tutorial catalog')
        setTutorials(catalog)
        setLoadError('')
      } catch (error) {
        if (controller.signal.aborted) return
        setLoadError(error instanceof Error ? error.message : String(error))
      }
    }
    void loadCatalog()
    return () => controller.abort()
  }, [])

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={onToggleOpen}
        aria-haspopup="true"
        aria-expanded={isOpen ? 'true' : 'false'}
        className={`flex items-center gap-2 rounded border px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-emerald-400 ${isOpen ? 'border-emerald-500/70' : 'border-slate-600'}`}
        title="Open a learning tutorial"
      >
        <svg className="h-4 w-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5s3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18s-3.332.477-4.5 1.253" />
        </svg>
        Learning
      </button>

      {isOpen && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-lg border border-slate-600 bg-slate-800 p-2 shadow-2xl">
          <div className="px-2 pb-2 text-[11px] uppercase tracking-wider text-slate-500">Learning tutorials</div>
          {loadError ? (
            <div className="rounded-md border border-red-500/30 bg-red-950/20 px-3 py-2 text-xs text-red-200">
              Could not load the tutorial list: {loadError}
            </div>
          ) : tutorials.length === 0 ? (
            <div className="px-2 py-3 text-xs text-slate-500">Loading tutorials…</div>
          ) : (
            <div className="space-y-1">
              {tutorials.map(tutorial => (
                <button
                  key={tutorial.github}
                  type="button"
                  onClick={() => onOpenTutorial(tutorial.github)}
                  className="group flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-slate-900/70"
                  title={`Open ${tutorial.name}`}
                >
                  <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-emerald-500/10 text-emerald-300">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-200 group-hover:text-emerald-300">{tutorial.name}</span>
                    <span className="block truncate text-[11px] text-slate-500">{repositoryLabel(tutorial.github)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-1 border-t border-slate-700 px-2 pt-2 text-[11px] text-slate-500">
            Tutorials are loaded live from their GitHub repositories.
          </div>
        </div>
      )}
    </div>
  )
}
