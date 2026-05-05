import { useState } from 'react'

interface Props {
  name: string
  path: string
  url: string
  onRefresh: () => Promise<void>
  onClose: () => void
}

export function HtmlPreviewDialog({ name, path, url, onRefresh, onClose }: Props) {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleOpenInNewTab = () => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-[90vh] w-[94vw] max-w-7xl flex-col overflow-hidden rounded-lg border border-slate-600 bg-slate-800 shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-700 bg-slate-900 px-4 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-200">{name}</div>
            <div className="truncate text-[11px] text-slate-500">{path}</div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <button
              type="button"
              title="Refresh preview"
              aria-label="Refresh preview"
              disabled={isRefreshing}
              onClick={() => void handleRefresh()}
              className="rounded border border-slate-600 p-1.5 text-slate-300 transition-colors hover:border-sky-400 hover:text-white disabled:opacity-50"
            >
              <svg className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v6h6M20 20v-6h-6M5.64 18.36A9 9 0 0018.36 5.64M18.36 5.64A9 9 0 015.64 18.36" />
              </svg>
            </button>
            <button
              type="button"
              title="Open in new tab"
              aria-label="Open in new tab"
              onClick={handleOpenInNewTab}
              className="rounded border border-slate-600 p-1.5 text-slate-300 transition-colors hover:border-sky-400 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 3h7v7M21 3l-9 9M5 7v12h12" />
              </svg>
            </button>
            <button
              type="button"
              title="Close preview"
              aria-label="Close preview"
              onClick={onClose}
              className="rounded border border-slate-600 p-1.5 text-slate-300 transition-colors hover:border-red-400 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <iframe
          key={url}
          title={`Preview: ${name}`}
          src={url}
          className="min-h-0 flex-1 border-0 bg-white"
        />
      </div>
    </div>
  )
}
