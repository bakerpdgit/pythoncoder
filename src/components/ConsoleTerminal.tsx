import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { InputRequest } from '../types'

export interface ConsoleTerminalHandle {
  write: (text: string) => void
  clear: () => void
  focus: () => void
  /** What the user has highlighted, or '' when nothing is selected. */
  getSelection: () => string
  /** Everything the terminal holds, scrollback included, trailing blanks trimmed. */
  getAllText: () => string
}

/**
 * Put text on the clipboard.
 *
 * `navigator.clipboard` needs a secure context and can be refused outright, so
 * the old `execCommand` route stays as a fallback — students on a school
 * network are exactly the people most likely to hit a blocked permission.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch { /* fall through */ }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

interface Props {
  inputRequest: InputRequest | null
  onInput: (value: string) => void
  onStop: () => void
  fontSize: number
  theme: 'dark' | 'light'
}

const DARK_THEME = {
  background: '#0f172a',
  foreground: '#cbd5e1',
  cursor: '#f8fafc',
  cursorAccent: '#0f172a',
  selectionBackground: '#065f46',
  selectionForeground: '#f1f5f9',
  black: '#1e293b',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#cbd5e1',
  brightBlack: '#475569',
  brightRed: '#fb7185',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#f1f5f9',
}

const LIGHT_THEME = {
  background: '#f8fbff',
  foreground: '#1e293b',
  cursor: '#0f172a',
  cursorAccent: '#f8fbff',
  selectionBackground: '#bbf7d0',
  selectionForeground: '#0f172a',
  black: '#1e293b',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#d97706',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#64748b',
  brightBlack: '#94a3b8',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#fbbf24',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#f1f5f9',
}

const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'

export const ConsoleTerminal = forwardRef<ConsoleTerminalHandle, Props>(
  ({ inputRequest, onInput, onStop, fontSize, theme }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const termRef = useRef<Terminal | null>(null)
    const fitAddonRef = useRef<FitAddon | null>(null)
    const inputBufferRef = useRef('')
    const pasteQueueRef = useRef<string[]>([])
    const inInputModeRef = useRef(false)
    const lastRequestIdRef = useRef<number | null>(null)
    const onInputRef = useRef(onInput)
    const onStopRef = useRef(onStop)

    useEffect(() => { onInputRef.current = onInput }, [onInput])
    useEffect(() => { onStopRef.current = onStop }, [onStop])

    const enterInputMode = useCallback(() => {
      inInputModeRef.current = true
      inputBufferRef.current = ''
      if (termRef.current) {
        termRef.current.write(SHOW_CURSOR)
        termRef.current.options.cursorBlink = true
      }
    }, [])

    const exitInputMode = useCallback(() => {
      inInputModeRef.current = false
      inputBufferRef.current = ''
      if (termRef.current) {
        termRef.current.options.cursorBlink = false
        termRef.current.write(HIDE_CURSOR)
      }
    }, [])

    const submitInput = useCallback((value: string) => {
      exitInputMode()
      termRef.current?.write('\r\n')
      onInputRef.current(value)
    }, [exitInputMode])

    useImperativeHandle(ref, () => ({
      write: (text: string) => {
        termRef.current?.write(text)
      },
      clear: () => {
        if (termRef.current) {
          // \x1b[2J = clear screen, \x1b[3J = clear scrollback, \x1b[H = cursor home
          termRef.current.write('\x1b[2J\x1b[3J\x1b[H')
          termRef.current.options.cursorBlink = false
          termRef.current.write(HIDE_CURSOR)
        }
        pasteQueueRef.current = []
        inInputModeRef.current = false
        inputBufferRef.current = ''
      },
      focus: () => {
        termRef.current?.focus()
      },
      getSelection: () => termRef.current?.getSelection() ?? '',
      getAllText: () => {
        const term = termRef.current
        if (!term) return ''
        const buffer = term.buffer.active
        const lines: string[] = []
        for (let i = 0; i < buffer.length; i++) {
          lines.push(buffer.getLine(i)?.translateToString(true) ?? '')
        }
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
        return lines.join('\n')
      },
    }), [])

    // Initialise xterm once
    useEffect(() => {
      if (!containerRef.current) return

      const term = new Terminal({
        fontFamily: '"Fira Code", "Cascadia Code", Consolas, "Courier New", monospace',
        fontSize,
        theme: theme === 'light' ? LIGHT_THEME : DARK_THEME,
        scrollback: 50000,
        convertEol: true,
        cursorBlink: false,
        cursorStyle: 'bar',
        allowProposedApi: true,
        rightClickSelectsWord: false,
        macOptionIsMeta: true,
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(containerRef.current)
      requestAnimationFrame(() => { try { fitAddon.fit() } catch { /* ignore */ } })
      term.write(HIDE_CURSOR)

      termRef.current = term
      fitAddonRef.current = fitAddon

      // Ctrl+C is two things in a terminal. With text selected it is Copy —
      // which is what a student pressing it expects, and there was previously no
      // way at all to get console output out of the page. With nothing selected
      // it keeps its terminal meaning and stops the running program.
      term.attachCustomKeyEventHandler(event => {
        if (event.type !== 'keydown') return true
        const isCopy = (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'c'
        if (!isCopy || !term.hasSelection()) return true
        void copyTextToClipboard(term.getSelection())
        term.clearSelection()
        return false
      })

      // ── User data handler (typing + paste) ──────────────────────────────────
      term.onData((data) => {
        if (!inInputModeRef.current) {
          if (data === '\x03') onStopRef.current()
          return
        }

        if (data === '\r') {
          submitInput(inputBufferRef.current)
        } else if (data === '\x7f') {
          if (inputBufferRef.current.length > 0) {
            inputBufferRef.current = inputBufferRef.current.slice(0, -1)
            term.write('\b \b')
          }
        } else if (data === '\x03') {
          term.write('^C\r\n')
          exitInputMode()
          onStopRef.current()
        } else if (data.length > 1 && !data.startsWith('\x1b')) {
          const normalised = data.replace(/\r\n|\r/g, '\n')
          const lines = normalised.split('\n')
          inputBufferRef.current += lines[0]
          term.write(lines[0])
          if (lines.length > 1) {
            const value = inputBufferRef.current
            const rest = lines.slice(1)
            if (rest[rest.length - 1] === '') rest.pop()
            pasteQueueRef.current.push(...rest)
            submitInput(value)
          }
        } else if (data >= ' ' || (data > '\x7f' && data < '\xff')) {
          inputBufferRef.current += data
          term.write(data)
        }
      })

      // ── Right-click paste ────────────────────────────────────────────────────
      const el = containerRef.current
      const handleContextMenu = async (e: MouseEvent) => {
        e.preventDefault()
        // xterm draws its own selection overlay, so the browser's own
        // right-click Copy never sees it. Offer the obvious thing instead.
        if (term.hasSelection()) {
          await copyTextToClipboard(term.getSelection())
          term.clearSelection()
          return
        }
        if (!inInputModeRef.current) return
        try {
          const text = await navigator.clipboard.readText()
          if (text) term.paste(text)
        } catch { /* clipboard access denied */ }
      }
      el.addEventListener('contextmenu', handleContextMenu)

      return () => {
        el.removeEventListener('contextmenu', handleContextMenu)
        term.dispose()
        termRef.current = null
        fitAddonRef.current = null
      }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Font size changes
    useEffect(() => {
      if (!termRef.current) return
      termRef.current.options.fontSize = fontSize
      try { fitAddonRef.current?.fit() } catch { /* ignore */ }
    }, [fontSize])

    // Theme changes
    useEffect(() => {
      if (!termRef.current) return
      termRef.current.options.theme = theme === 'light' ? LIGHT_THEME : DARK_THEME
    }, [theme])

    // Handle input requests
    useEffect(() => {
      if (!termRef.current) return

      if (inputRequest === null) {
        exitInputMode()
        lastRequestIdRef.current = null
        return
      }

      if (lastRequestIdRef.current === inputRequest.id) return
      lastRequestIdRef.current = inputRequest.id

      if (pasteQueueRef.current.length > 0) {
        const next = pasteQueueRef.current.shift()!
        if (inputRequest.prompt) termRef.current.write(inputRequest.prompt)
        termRef.current.write(next + '\r\n')
        setTimeout(() => onInputRef.current(next), 0)
        return
      }

      if (inputRequest.prompt) termRef.current.write(inputRequest.prompt)
      enterInputMode()
      termRef.current.focus()
    }, [inputRequest?.id]) // eslint-disable-line react-hooks/exhaustive-deps

    // Resize observer
    useEffect(() => {
      const el = containerRef.current
      if (!el) return
      const ro = new ResizeObserver(() => {
        try { fitAddonRef.current?.fit() } catch { /* ignore */ }
      })
      ro.observe(el)
      return () => ro.disconnect()
    }, [])

    const bgColor = theme === 'dark' ? '#0f172a' : '#f8fbff'
    return (
      <div className="console-terminal-wrapper" style={{ backgroundColor: bgColor }}>
        <div ref={containerRef} className="console-terminal-container" />
      </div>
    )
  }
)

ConsoleTerminal.displayName = 'ConsoleTerminal'
