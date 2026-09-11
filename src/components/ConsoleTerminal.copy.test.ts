import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from './ConsoleTerminal'

// The console is an xterm terminal: it owns its own selection and scrollback, so
// neither the browser's Copy nor a page text selection can reach it. Getting an
// error message out of the page therefore depends entirely on this helper, and
// on a school network the modern clipboard API is exactly the sort of thing that
// comes back "denied" — hence the older execCommand route behind it.

const originalExecCommand = document.execCommand

afterEach(() => {
  vi.unstubAllGlobals()
  document.execCommand = originalExecCommand
})

function stubClipboard(writeText: () => Promise<void>) {
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
}

describe('copyTextToClipboard', () => {
  it('uses the clipboard API when it is allowed', async () => {
    const writeText = vi.fn(async () => undefined)
    stubClipboard(writeText)
    expect(await copyTextToClipboard('hello')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('falls back to execCommand when the clipboard API is refused', async () => {
    stubClipboard(async () => { throw new Error('Write permission denied') })
    const exec = vi.fn(() => true)
    document.execCommand = exec as unknown as typeof document.execCommand
    expect(await copyTextToClipboard('hello')).toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
  })

  it('leaves no textarea behind when it falls back', async () => {
    stubClipboard(async () => { throw new Error('denied') })
    document.execCommand = (() => true) as unknown as typeof document.execCommand
    const before = document.querySelectorAll('textarea').length
    await copyTextToClipboard('hello')
    expect(document.querySelectorAll('textarea').length).toBe(before)
  })

  it('reports failure rather than pretending, so the button does not lie', async () => {
    stubClipboard(async () => { throw new Error('denied') })
    document.execCommand = (() => false) as unknown as typeof document.execCommand
    expect(await copyTextToClipboard('hello')).toBe(false)
  })

  it('does nothing for empty text', async () => {
    const writeText = vi.fn(async () => undefined)
    stubClipboard(writeText)
    expect(await copyTextToClipboard('')).toBe(false)
    expect(writeText).not.toHaveBeenCalled()
  })
})
