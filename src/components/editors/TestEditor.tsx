import { useState } from 'react'
import type { BookTestCase, BookTestOutputReq } from '../../types'

interface Props {
  tests: BookTestCase[]
  onChange: (tests: BookTestCase[]) => void
  onRunTests?: () => void
  isRunning?: boolean
}

const REQ_TYPES: Array<{ value: string; label: string }> = [
  { value: '+', label: 'output contains (+)' },
  { value: '-', label: "output doesn't contain (-)" },
  { value: 'c+', label: 'code contains (c+)' },
  { value: 'c-', label: "code doesn't contain (c-)" },
  { value: 'f+', label: 'file contains (f+)' },
  { value: 'f-', label: "file doesn't contain (f-)" },
  { value: 's+', label: 'statement result contains (s+)' },
  { value: 's-', label: "statement result doesn't (s-)" },
  { value: 't', label: 'turtle (t)' },
]

// Convert a test case's `in` to a display string (one input per line).
function inToText(input: BookTestCase['in']): string {
  if (Array.isArray(input)) return input.map(String).join('\n')
  return input === undefined ? '' : String(input)
}
// Store the textarea value back: single line → string, multi-line → array.
function textToIn(text: string): BookTestCase['in'] {
  if (text === '') return ''
  const lines = text.split('\n')
  return lines.length <= 1 ? lines[0] : lines
}

// Build a clean requirement, omitting default fields so serialized output stays tidy.
function cleanReq(r: BookTestOutputReq): BookTestOutputReq {
  const out: BookTestOutputReq = { pattern: r.pattern ?? '' }
  if (r.typ && r.typ !== '+') out.typ = r.typ
  if (r.ignore) out.ignore = r.ignore
  if (r.count !== undefined && String(r.count) !== '' && Number(r.count) !== -1) out.count = r.count
  if ((r.typ === 'f+' || r.typ === 'f-' || r.typ === 't') && r.filename) out.filename = r.filename
  if ((r.typ === 's+' || r.typ === 's-') && r.statement) out.statement = r.statement
  return out
}

function IgnoreToggle({ flags, onChange }: { flags: string; onChange: (f: string) => void }) {
  const toggle = (ch: string) => {
    const has = flags.includes(ch)
    const set = new Set(flags.split(''))
    if (has) set.delete(ch); else set.add(ch)
    // Serialize in fixed w→c→p order.
    onChange(['w', 'c', 'p'].filter(c => set.has(c)).join(''))
  }
  const btn = (ch: string, label: string, title: string) => (
    <button type="button" title={title} onClick={() => toggle(ch)}
      className={`px-1 py-0.5 text-[10px] rounded border ${flags.includes(ch) ? 'bg-sky-500/25 border-sky-500 text-sky-200' : 'border-slate-600 text-slate-400 hover:text-slate-200'}`}>
      {label}
    </button>
  )
  return (
    <div className="flex items-center gap-0.5">
      {btn('w', '␣', 'Ignore whitespace')}
      {btn('c', 'Aa', 'Ignore case')}
      {btn('p', '!', 'Ignore punctuation')}
    </div>
  )
}

function AdvancedRow({ req, onChange, onDelete }: { req: BookTestOutputReq; onChange: (r: BookTestOutputReq) => void; onDelete: () => void }) {
  const typ = req.typ ?? '+'
  const needsFilename = typ === 'f+' || typ === 'f-' || typ === 't'
  const needsStatement = typ === 's+' || typ === 's-'
  return (
    <div className="flex flex-col gap-1 p-1.5 rounded border border-slate-700 bg-slate-900/40">
      <div className="flex items-center gap-1">
        <select aria-label="Requirement type" value={typ} onChange={e => onChange({ ...req, typ: e.target.value })}
          className="bg-slate-800 border border-slate-600 rounded text-[11px] text-slate-200 px-1 py-0.5">
          {REQ_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button type="button" title="Remove requirement" onClick={onDelete}
          className="ml-auto text-slate-500 hover:text-red-400 p-0.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <input aria-label="Pattern (regex)" value={req.pattern ?? ''} placeholder="pattern (regex)"
        onChange={e => onChange({ ...req, pattern: e.target.value })}
        className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-400" />
      {needsFilename && (
        <input aria-label="Filename" value={req.filename ?? ''} placeholder="filename"
          onChange={e => onChange({ ...req, filename: e.target.value })}
          className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-400" />
      )}
      {needsStatement && (
        <input aria-label="Statement" value={req.statement ?? ''} placeholder="statement e.g. add(2,3)"
          onChange={e => onChange({ ...req, statement: e.target.value })}
          className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-400" />
      )}
      <div className="flex items-center gap-2">
        <IgnoreToggle flags={req.ignore ?? ''} onChange={f => onChange({ ...req, ignore: f })} />
        <label className="flex items-center gap-1 text-[10px] text-slate-400">
          count
          <input aria-label="Count" type="number" value={req.count ?? ''} placeholder="any"
            onChange={e => onChange({ ...req, count: e.target.value === '' ? undefined : Number(e.target.value) })}
            className="w-12 bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-[11px] text-slate-200 focus:outline-none" />
        </label>
      </div>
    </div>
  )
}

function TestCaseCard({ tc, index, onChange, onDelete }: { tc: BookTestCase; index: number; onChange: (tc: BookTestCase) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(true)
  const isAdvanced = Array.isArray(tc.out)
  const reqs = (isAdvanced ? tc.out : []) as BookTestOutputReq[]

  const setMode = (advanced: boolean) => {
    if (advanced === isAdvanced) return
    if (advanced) {
      const patt = typeof tc.out === 'string' ? tc.out : ''
      onChange({ ...tc, out: patt ? [{ pattern: patt }] : [] })
    } else {
      const first = reqs[0]?.pattern ?? ''
      onChange({ ...tc, out: first })
    }
  }

  return (
    <div className="rounded border border-slate-700 bg-slate-800/40">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button type="button" onClick={() => setOpen(o => !o)} className="text-slate-500 hover:text-slate-300">
          <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
        </button>
        <span className="text-[11px] font-semibold text-slate-300">Test {index + 1}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <label className="flex items-center gap-1 text-[10px] text-slate-400">
            <input type="checkbox" checked={tc.reveal !== false} onChange={e => onChange({ ...tc, reveal: e.target.checked })} />
            reveal
          </label>
          <div className="flex items-center rounded overflow-hidden border border-slate-700 text-[10px]">
            <button type="button" onClick={() => setMode(false)} className={`px-1.5 py-0.5 ${!isAdvanced ? 'bg-slate-600 text-white' : 'text-slate-400'}`}>Simple</button>
            <button type="button" onClick={() => setMode(true)} className={`px-1.5 py-0.5 ${isAdvanced ? 'bg-slate-600 text-white' : 'text-slate-400'}`}>Advanced</button>
          </div>
          <button type="button" title="Delete test" onClick={onDelete} className="text-slate-500 hover:text-red-400 p-0.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="px-2 pb-2 space-y-1.5">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">Input (one per line)</div>
            <textarea value={inToText(tc.in)} onChange={e => onChange({ ...tc, in: textToIn(e.target.value) })}
              aria-label="Test input" rows={2}
              className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-[11px] font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-400 resize-y" />
          </div>
          {!isAdvanced ? (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5" title="Each line matched separately. .* is a wildcard within a line.">Expected output (.* = wildcard)</div>
              <textarea value={typeof tc.out === 'string' ? tc.out : ''} onChange={e => onChange({ ...tc, out: e.target.value })}
                aria-label="Expected output" rows={3}
                className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-[11px] font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-400 resize-y" />
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Requirements (all must pass)</div>
              {reqs.map((r, ri) => (
                <AdvancedRow key={ri} req={r}
                  onChange={nr => { const next = [...reqs]; next[ri] = cleanReq(nr); onChange({ ...tc, out: next }) }}
                  onDelete={() => { const next = reqs.filter((_, i) => i !== ri); onChange({ ...tc, out: next }) }} />
              ))}
              <button type="button" onClick={() => onChange({ ...tc, out: [...reqs, { pattern: '' }] })}
                className="text-[11px] text-sky-400 hover:text-sky-300">+ Add requirement</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Fresh test-case editor tabbed alongside the console in book edit mode.
export function TestEditor({ tests, onChange, onRunTests, isRunning }: Props) {
  return (
    <div className="h-full overflow-y-auto p-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-400">{tests.length} test case{tests.length === 1 ? '' : 's'}</span>
        {onRunTests && (
          <button type="button" onClick={onRunTests} disabled={isRunning || tests.length === 0}
            className="text-[11px] bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-2 py-0.5 rounded font-semibold">
            {isRunning ? 'Running…' : 'Run tests'}
          </button>
        )}
      </div>
      {tests.map((tc, i) => (
        <TestCaseCard key={i} tc={tc} index={i}
          onChange={ntc => { const next = [...tests]; next[i] = ntc; onChange(next) }}
          onDelete={() => onChange(tests.filter((_, idx) => idx !== i))} />
      ))}
      <button type="button" onClick={() => onChange([...tests, { in: '', out: '' }])}
        className="w-full text-[11px] text-sky-400 hover:text-sky-300 border border-dashed border-slate-700 rounded py-1.5">
        + Add test case
      </button>
    </div>
  )
}
