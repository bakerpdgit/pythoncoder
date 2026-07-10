import { useState } from 'react'
import Editor from '@monaco-editor/react'
import { JsonViewer } from '@textea/json-viewer'
import type { BookManifest } from '../../types'

interface Props {
  manifest: BookManifest
  theme: 'dark' | 'light'
  onSave: (manifest: BookManifest) => void
  onClose: () => void
}

type Mode = 'visual' | 'source'

// Immutably set a value at a path within a plain JSON object.
function setByPath(obj: unknown, path: Array<string | number>, value: unknown): unknown {
  if (path.length === 0) return value
  const clone: unknown = Array.isArray(obj) ? [...obj] : { ...(obj as Record<string, unknown>) }
  const holder = clone as Record<string | number, unknown>
  const [head, ...rest] = path
  holder[head] = rest.length === 0 ? value : setByPath(holder[head], rest, value)
  return clone
}

// Advanced editor for the whole book.json: a structured (point-and-click) tree
// and a raw JSON source view (Monaco with validation), kept in sync.
export function BookJsonEditor({ manifest, theme, onSave, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('visual')
  const [obj, setObj] = useState<BookManifest>(() => structuredClone(manifest))
  const [text, setText] = useState(() => JSON.stringify(manifest, null, 2))
  const [error, setError] = useState('')

  const switchMode = (next: Mode) => {
    if (next === mode) return
    if (next === 'source') {
      setText(JSON.stringify(obj, null, 2))
    } else {
      try { setObj(JSON.parse(text) as BookManifest); setError('') }
      catch (e) { setError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`); return }
    }
    setMode(next)
  }

  const handleSave = () => {
    let result: BookManifest
    if (mode === 'source') {
      try { result = JSON.parse(text) as BookManifest }
      catch (e) { setError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`); return }
    } else {
      result = obj
    }
    if (!result || !Array.isArray(result.children)) { setError('A book must have a "children" array.'); return }
    onSave(result)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6" onMouseDown={onClose}>
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh]"
        onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700">
          <span className="text-sm font-bold text-white">Advanced book.json editor</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded overflow-hidden border border-slate-600 text-[11px]">
              <button type="button" onClick={() => switchMode('visual')}
                className={`px-2.5 py-1 ${mode === 'visual' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Visual</button>
              <button type="button" onClick={() => switchMode('source')}
                className={`px-2.5 py-1 ${mode === 'source' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Source</button>
            </div>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-3 bg-slate-950/40">
          {mode === 'visual' ? (
            <JsonViewer
              value={obj}
              theme={theme}
              rootName="book"
              displayDataTypes={false}
              editable
              onChange={(path, _old, next) => setObj(prev => setByPath(prev, path as Array<string | number>, next) as BookManifest)}
              style={{ backgroundColor: 'transparent', fontSize: 12 }}
            />
          ) : (
            <div className="h-[55vh] border border-slate-700 rounded overflow-hidden">
              <Editor
                height="100%"
                language="json"
                theme={theme === 'light' ? 'vs' : 'vs-dark'}
                value={text}
                onChange={v => { setText(v ?? ''); setError('') }}
                options={{ minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, tabSize: 2 }}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-700">
          <span className="text-[11px] text-red-400">{error}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="px-3 py-1.5 rounded border border-slate-600 text-slate-300 text-xs hover:bg-slate-700 transition-colors">Cancel</button>
            <button type="button" onClick={handleSave}
              className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors">Save book.json</button>
          </div>
        </div>
      </div>
    </div>
  )
}
