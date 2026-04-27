import type { AppSettings, TurtleMode } from '../../types'

interface Props {
  isOpen: boolean
  settings: AppSettings
  onClose: () => void
  onSettingsChange: (settings: AppSettings) => void
}

const TURTLE_OPTIONS: { value: TurtleMode; label: string; desc: string }[] = [
  {
    value: 'pyo-js-turtle',
    label: 'Canvas (pyo-js-turtle)',
    desc: 'Renders to an HTML5 canvas with animation. Runs on the main thread. Best for interactive programs using screen.onkeypress() and screen.mainloop().',
  },
  {
    value: 'basthon-svg',
    label: 'SVG (Raspberry Pi / Basthon)',
    desc: 'Records drawing commands as SVG. Works in both Trace Run and Run modes. Step-by-step trace shows the drawing build up live. No interactive keyboard support.',
  },
]

export const SettingsDialog = ({ isOpen, settings, onClose, onSettingsChange }: Props) => {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-600 bg-slate-800 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-400 hover:border-slate-400 hover:text-slate-200"
          >
            Close
          </button>
        </div>

        <div className="p-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
            Turtle Graphics Mode
          </div>
          <p className="mb-4 text-xs text-slate-400 leading-relaxed">
            When your code contains <code className="rounded bg-slate-700 px-1 text-emerald-300">import turtle</code>, choose how it is executed.
          </p>
          <div className="flex flex-col gap-3">
            {TURTLE_OPTIONS.map(opt => {
              const active = settings.turtleMode === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onSettingsChange({ ...settings, turtleMode: opt.value })}
                  className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                    active
                      ? 'border-emerald-500 bg-emerald-900/20'
                      : 'border-slate-600 bg-slate-900/40 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-3 w-3 rounded-full border-2 flex-shrink-0 ${
                      active ? 'border-emerald-400 bg-emerald-400' : 'border-slate-500 bg-transparent'
                    }`} />
                    <span className={`text-sm font-semibold ${active ? 'text-emerald-300' : 'text-slate-200'}`}>
                      {opt.label}
                    </span>
                  </div>
                  <p className="mt-1.5 pl-5 text-xs text-slate-400 leading-relaxed">{opt.desc}</p>
                </button>
              )
            })}
          </div>
          <p className="mt-4 text-[11px] text-slate-500 leading-relaxed">
            In Canvas mode, <code className="rounded bg-slate-700 px-1 text-sky-300">screen.mainloop()</code> runs
            an async event loop automatically — no code changes needed. Animation speed follows{' '}
            <code className="rounded bg-slate-700 px-1 text-sky-300">turtle.speed()</code>.
          </p>
        </div>
      </div>
    </div>
  )
}
