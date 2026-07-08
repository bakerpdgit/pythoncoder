import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

// Promise-based replacements for window.confirm / window.prompt / window.alert,
// rendered as styled, theme-aware modal dialogs. Use via the useDialogs() hook.

type Tone = 'primary' | 'danger' | 'neutral'

export interface ChoiceButton {
  label: string
  value: string
  tone?: Tone
}

export interface ConfirmOptions {
  title?: string
  message: string
  detail?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export interface ChooseOptions {
  title?: string
  message: string
  detail?: string
  buttons: ChoiceButton[]
}

export interface PromptOptions {
  title?: string
  message?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
}

export interface AlertOptions {
  title?: string
  message: string
  detail?: string
  confirmLabel?: string
}

export interface DialogApi {
  /** OK/Cancel. Resolves true on confirm, false on cancel/dismiss. */
  confirm(options: ConfirmOptions): Promise<boolean>
  /** Arbitrary buttons. Resolves the chosen button's value, or null if dismissed. */
  choose(options: ChooseOptions): Promise<string | null>
  /** Text input. Resolves the entered string, or null if cancelled/dismissed. */
  prompt(options: PromptOptions): Promise<string | null>
  /** Single OK acknowledgement. */
  alert(options: AlertOptions): Promise<void>
}

interface BaseReq { id: number; title?: string; detail?: string }
interface ConfirmReq extends BaseReq { kind: 'confirm'; message: string; confirmLabel: string; cancelLabel: string; danger: boolean; resolve: (v: boolean) => void }
interface ChooseReq extends BaseReq { kind: 'choose'; message: string; buttons: ChoiceButton[]; resolve: (v: string | null) => void }
interface PromptReq extends BaseReq { kind: 'prompt'; message?: string; defaultValue: string; placeholder?: string; confirmLabel: string; cancelLabel: string; resolve: (v: string | null) => void }
interface AlertReq extends BaseReq { kind: 'alert'; message: string; confirmLabel: string; resolve: () => void }
type DialogReq = ConfirmReq | ChooseReq | PromptReq | AlertReq

const DialogContext = createContext<DialogApi | null>(null)

export function useDialogs(): DialogApi {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialogs must be used within a DialogProvider')
  return ctx
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DialogReq[]>([])
  const idRef = useRef(0)

  const enqueue = useCallback((make: (id: number) => DialogReq) => {
    setQueue(q => [...q, make(++idRef.current)])
  }, [])

  const api = useMemo<DialogApi>(() => ({
    confirm: (o) => new Promise<boolean>(resolve => enqueue(id => ({
      id, kind: 'confirm', title: o.title, detail: o.detail, message: o.message,
      confirmLabel: o.confirmLabel ?? 'OK', cancelLabel: o.cancelLabel ?? 'Cancel', danger: o.danger ?? false, resolve,
    }))),
    choose: (o) => new Promise<string | null>(resolve => enqueue(id => ({
      id, kind: 'choose', title: o.title, detail: o.detail, message: o.message, buttons: o.buttons, resolve,
    }))),
    prompt: (o) => new Promise<string | null>(resolve => enqueue(id => ({
      id, kind: 'prompt', title: o.title, detail: undefined, message: o.message, defaultValue: o.defaultValue ?? '',
      placeholder: o.placeholder, confirmLabel: o.confirmLabel ?? 'OK', cancelLabel: o.cancelLabel ?? 'Cancel', resolve,
    }))),
    alert: (o) => new Promise<void>(resolve => enqueue(id => ({
      id, kind: 'alert', title: o.title, detail: o.detail, message: o.message, confirmLabel: o.confirmLabel ?? 'OK', resolve,
    }))),
  }), [enqueue])

  const current = queue[0] ?? null
  const dismiss = useCallback(() => setQueue(q => q.slice(1)), [])

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current && <DialogHost key={current.id} req={current} onDone={dismiss} />}
    </DialogContext.Provider>
  )
}

function toneClasses(tone: Tone): string {
  switch (tone) {
    case 'danger': return 'bg-red-600 hover:bg-red-500 text-white'
    case 'neutral': return 'border border-slate-600 text-slate-300 hover:bg-slate-700'
    default: return 'bg-sky-600 hover:bg-sky-500 text-white'
  }
}

function DialogHost({ req, onDone }: { req: DialogReq; onDone: () => void }) {
  const [value, setValue] = useState(req.kind === 'prompt' ? req.defaultValue : '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (req.kind === 'prompt') {
      // Focus and select the seeded text on open.
      const t = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
      return () => clearTimeout(t)
    }
  }, [req.kind])

  const finishConfirm = (v: boolean) => { if (req.kind === 'confirm') req.resolve(v); onDone() }
  const finishChoose = (v: string | null) => { if (req.kind === 'choose') req.resolve(v); onDone() }
  const finishPrompt = (v: string | null) => { if (req.kind === 'prompt') req.resolve(v); onDone() }
  const finishAlert = () => { if (req.kind === 'alert') req.resolve(); onDone() }

  const cancel = () => {
    switch (req.kind) {
      case 'confirm': finishConfirm(false); break
      case 'choose': finishChoose(null); break
      case 'prompt': finishPrompt(null); break
      case 'alert': finishAlert(); break
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); cancel() }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onMouseDown={cancel} onKeyDown={onKeyDown}>
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-full max-w-sm mx-4 p-6"
        onMouseDown={e => e.stopPropagation()}>
        {req.title && <div className="text-white text-sm font-bold mb-2">{req.title}</div>}
        <p className="text-slate-200 text-sm whitespace-pre-wrap">{req.message}</p>
        {req.detail && <p className="text-slate-400 text-xs mt-2 whitespace-pre-wrap">{req.detail}</p>}

        {req.kind === 'prompt' && (
          <input ref={inputRef} value={value} placeholder={req.placeholder}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); finishPrompt(value) } }}
            className="w-full mt-4 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-sky-400" />
        )}

        <div className="flex justify-end gap-3 mt-6 flex-wrap">
          {req.kind === 'confirm' && (
            <>
              <button type="button" onClick={() => finishConfirm(false)}
                className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition-colors">
                {req.cancelLabel}
              </button>
              <button type="button" onClick={() => finishConfirm(true)}
                className={`px-4 py-2 rounded text-sm font-semibold transition-colors ${toneClasses(req.danger ? 'danger' : 'primary')}`}>
                {req.confirmLabel}
              </button>
            </>
          )}
          {req.kind === 'choose' && req.buttons.map(b => (
            <button key={b.value} type="button" onClick={() => finishChoose(b.value)}
              className={`px-4 py-2 rounded text-sm font-semibold transition-colors ${toneClasses(b.tone ?? 'primary')}`}>
              {b.label}
            </button>
          ))}
          {req.kind === 'prompt' && (
            <>
              <button type="button" onClick={() => finishPrompt(null)}
                className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition-colors">
                {req.cancelLabel}
              </button>
              <button type="button" onClick={() => finishPrompt(value)}
                className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors">
                {req.confirmLabel}
              </button>
            </>
          )}
          {req.kind === 'alert' && (
            <button type="button" onClick={finishAlert}
              className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors">
              {req.confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
