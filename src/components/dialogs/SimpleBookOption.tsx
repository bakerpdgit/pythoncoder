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
          The Python files in it become the exercises, in name order.
        </p>

        <div className="mt-3 rounded border border-slate-700 bg-slate-900/60 p-2.5 font-mono text-[11px] leading-relaxed text-slate-300">
          <div>challenge01.py<span className="text-slate-500"> — exercise 1</span></div>
          <div>challenge01.txt<span className="text-slate-500"> — its instructions</span></div>
          <div>challenge01_data.txt<span className="text-slate-500"> — mounted as data.txt</span></div>
          <div>challenge02.py<span className="text-slate-500"> — exercise 2, no instructions</span></div>
        </div>

        <ul className="mt-3 space-y-1.5 leading-relaxed text-slate-400">
          <li>
            <span className="text-slate-200">Titles.</span> The file name without{' '}
            <code className="book-inline-code rounded px-1 font-mono">.py</code> — so{' '}
            <code className="book-inline-code rounded px-1 font-mono">challenge01.py</code> shows as{' '}
            <em>challenge01</em>. Ordering is name order, counting numbers properly (challenge2 before
            challenge10).
          </li>
          <li>
            <span className="text-slate-200">Instructions.</span> A{' '}
            <code className="book-inline-code rounded px-1 font-mono">.txt</code> with the same name,
            shown as plain text where the guide normally goes. Entirely optional.
          </li>
          <li>
            <span className="text-slate-200">Extra files.</span> Name them{' '}
            <code className="book-inline-code rounded px-1 font-mono">&lt;exercise&gt;_&lt;filename&gt;</code>
            {' '}— <code className="book-inline-code rounded px-1 font-mono">challenge01_data.txt</code> appears in
            that exercise&apos;s file browser as <code className="book-inline-code rounded px-1 font-mono">data.txt</code>,
            and <code className="book-inline-code rounded px-1 font-mono">challenge01_utils.py</code> as{' '}
            <code className="book-inline-code rounded px-1 font-mono">utils.py</code> for it to import.
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
