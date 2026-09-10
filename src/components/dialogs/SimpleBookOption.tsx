import { useState } from 'react'

// The "simple learning book" tick, and the round (i) that explains it.
//
// Shared by the Teacher Tools student-link dialog and the open-from-web wizards
// so the wording a teacher reads is the same wherever they meet the option.

export function SimpleBookCheckbox({ checked, onChange }: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const [showInfo, setShowInfo] = useState(false)
  return (
    <>
      <div className="mt-2 flex items-center gap-1.5">
        <label className="flex items-center gap-2 text-[11px] text-slate-400">
          <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
            className="accent-sky-500" />
          Simple learning book (no book.json)
        </label>
        <button type="button" onClick={() => setShowInfo(true)}
          aria-label="What is a simple learning book?"
          title="What is a simple learning book?"
          className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-slate-500 text-[10px] font-semibold text-slate-400 transition-colors hover:border-sky-400 hover:text-sky-300">
          i
        </button>
      </div>
      {showInfo && <SimpleBookInfoDialog onClose={() => setShowInfo(false)} />}
    </>
  )
}

function SimpleBookInfoDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="w-[460px] max-w-[95vw] rounded-lg border border-slate-600 bg-slate-800 p-5 text-xs shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="mb-2 text-sm font-bold text-white">Simple learning books</div>
        <p className="leading-relaxed text-slate-400">
          Any folder, repository, sub-folder of a repository or ZIP can be a learning book — no{' '}
          <code className="book-inline-code rounded px-1 font-mono">book.json</code> and no set-up.
          Number the exercises <code className="book-inline-code rounded px-1 font-mono">01.py</code>,{' '}
          <code className="book-inline-code rounded px-1 font-mono">02.py</code>, … and that is the book.
        </p>

        <div className="mt-3 rounded border border-slate-700 bg-slate-900/60 p-2.5 font-mono text-[11px] leading-relaxed text-slate-300">
          <div>01.py<span className="text-slate-500"> — exercise 01</span></div>
          <div>01.txt<span className="text-slate-500"> — its instructions</span></div>
          <div className="pl-4 text-slate-500">#! data.txt<span className="pl-2">← first line: put data.txt beside it</span></div>
          <div>02.py<span className="text-slate-500"> — exercise 02, no instructions</span></div>
          <div>data.txt<span className="text-slate-500"> — the file exercise 01 asked for</span></div>
        </div>

        <ul className="mt-3 space-y-1.5 leading-relaxed text-slate-400">
          <li>
            <span className="text-slate-200">Two digits, no gaps.</span> The book is read as{' '}
            <code className="book-inline-code rounded px-1 font-mono">01.py</code>,{' '}
            <code className="book-inline-code rounded px-1 font-mono">02.py</code>, … up to{' '}
            <code className="book-inline-code rounded px-1 font-mono">99.py</code>, and stops at the first
            number that is not there — so numbering 01, 02, 04 publishes two exercises. Nothing has to be
            listed, which is why a whole class can open books together without hitting a limit.
          </li>
          <li>
            <span className="text-slate-200">Instructions.</span> An optional{' '}
            <code className="book-inline-code rounded px-1 font-mono">01.txt</code>, shown as plain text
            under the heading <em>01 Instructions</em>. Without one the exercise says so.
          </li>
          <li>
            <span className="text-slate-200">Extra files.</span> Start{' '}
            <code className="book-inline-code rounded px-1 font-mono">01.txt</code> with one{' '}
            <code className="book-inline-code rounded px-1 font-mono">#! name</code> line per file to put in
            that exercise&apos;s file browser —{' '}
            <code className="book-inline-code rounded px-1 font-mono">#! data.txt</code> for data to read,{' '}
            <code className="book-inline-code rounded px-1 font-mono">#! utils.py</code> for a module to
            import. Those lines are never shown to the student.
          </li>
          <li>
            <span className="text-slate-200">Flat.</span> Only the folder itself is read; sub-folders are
            ignored. Point the link at a sub-folder to use that one instead.
          </li>
          <li>
            <span className="text-slate-200">No marking.</span> There is nowhere to write test cases, so
            every exercise is an example — it ticks off once the student runs it to the end. For tests,
            feedback and model solutions, author a full book in Teacher Tools.
          </li>
        </ul>

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose}
            className="rounded bg-sky-600 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-sky-500">
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
