import { describe, expect, it } from 'vitest'
import { isPyodideFatalError, isPyodideUsable, pyodideCrashRetryNote } from './pyodideCrash'

/** Stands in for WebAssembly's own trap error. */
class RuntimeError extends Error {}

describe('isPyodideFatalError', () => {
  it('recognises the error Pyodide marks as fatal', () => {
    const error = Object.assign(new RuntimeError('memory access out of bounds'), { pyodide_fatal_error: true })
    expect(isPyodideFatalError(error)).toBe(true)
  })

  it('recognises every later use of a dead Pyodide', () => {
    expect(isPyodideFatalError(new Error('Pyodide already fatally failed and can no longer be used.'))).toBe(true)
    // The worker posts errors as strings.
    expect(isPyodideFatalError('Error: Pyodide already fatally failed and can no longer be used.')).toBe(true)
  })

  it('leaves an ordinary Python error alone', () => {
    expect(isPyodideFatalError(new Error('Traceback (most recent call last):\nZeroDivisionError: division by zero'))).toBe(false)
    expect(isPyodideFatalError(null)).toBe(false)
  })
})

describe('isPyodideUsable', () => {
  it('is true while Python still runs', () => {
    expect(isPyodideUsable({ runPython: () => undefined })).toBe(true)
  })

  it('is false once every public property throws', () => {
    const dead = {}
    Object.defineProperty(dead, 'runPython', { get: () => { throw new Error('Pyodide already fatally failed') } })
    expect(isPyodideUsable(dead)).toBe(false)
  })

  it('is false with no Pyodide at all', () => {
    expect(isPyodideUsable(null)).toBe(false)
  })
})

describe('pyodideCrashRetryNote', () => {
  it('names the first line of the crash', () => {
    const note = pyodideCrashRetryNote('\nRuntimeError: memory access out of bounds\n    at wasm-function[123]')
    expect(note).toContain('[INFO] The crash was: RuntimeError: memory access out of bounds')
    expect(note).not.toContain('wasm-function')
  })
})
