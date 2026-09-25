import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  MAIN_THREAD_INPUT_BOOTSTRAP, mainThreadInputSummary, promptWithRecentOutput, rememberRecentOutput,
} from './mainThreadInput'

describe('promptWithRecentOutput', () => {
  it('puts the latest output above the question', () => {
    expect(promptWithRecentOutput('Welcome to the quiz\nRound 1\n', 'Name? '))
      .toBe('Welcome to the quiz\nRound 1\n\nName?')
  })

  it('is just the question when nothing has been printed', () => {
    expect(promptWithRecentOutput('', 'Name? ')).toBe('Name?')
  })

  it('is just the output when input() was given no prompt', () => {
    expect(promptWithRecentOutput('What is 6 x 7?\n', '')).toBe('What is 6 x 7?')
  })

  it('keeps only the last lines', () => {
    const output = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n')
    const message = promptWithRecentOutput(output, 'Next?', 3)
    expect(message).toBe('line 28\nline 29\nline 30\n\nNext?')
  })

  it('trims a very long tail from the front, and says so', () => {
    const message = promptWithRecentOutput('x'.repeat(5000), 'Go?', 12, 100)
    expect(message.startsWith('…')).toBe(true)
    expect(message.length).toBe(100 + '\n\nGo?'.length)
  })

  it('treats Windows line endings like any other', () => {
    expect(promptWithRecentOutput('a\r\nb\r\n', 'c')).toBe('a\nb\n\nc')
  })
})

describe('rememberRecentOutput', () => {
  it('appends, and keeps only the most recent characters', () => {
    expect(rememberRecentOutput('abc', 'def', 4)).toBe('cdef')
  })

  it('drops terminal colour codes, which a pop-up would show literally', () => {
    expect(rememberRecentOutput('', '\x1b[31mred\x1b[0m\n')).toBe('red\n')
  })
})

describe('mainThreadInputSummary', () => {
  it('says where input() is answered', () => {
    expect(mainThreadInputSummary(true)).toMatch(/console/)
    expect(mainThreadInputSummary(false)).toMatch(/pop-up/)
  })
})

// The bootstrap under native Python, with pyodide.ffi stood in for: it must use
// the console (JSPI) path exactly when run_sync can work, and fall back to the
// pop-up otherwise.
const python = ['python3', 'python'].find(cmd => spawnSync(cmd, ['--version']).status === 0)

function runBootstrap(options: { ffi: 'jspi' | 'no-jspi' | 'missing'; stop?: boolean; program: string }) {
  const fakeFfi = options.ffi === 'missing' ? '' : `
import sys, types
pyodide = types.ModuleType("pyodide")
ffi = types.ModuleType("pyodide.ffi")
ffi.can_run_sync = lambda: ${options.ffi === 'jspi' ? 'True' : 'False'}
def run_sync(awaitable):
    print("[run_sync]", awaitable)
    return awaitable.answer
ffi.run_sync = run_sync
pyodide.ffi = ffi
sys.modules["pyodide"] = pyodide
sys.modules["pyodide.ffi"] = ffi
`
  const script = `${fakeFfi}
class FakePromise:
    def __init__(self, prompt):
        self.answer = "console:" + prompt
    def __repr__(self):
        return "<promise>"
def js_input_async(prompt):
    return FakePromise(prompt)
def js_input_prompt(prompt):
    print("[window.prompt]", prompt)
    return "popup:" + prompt
def js_should_stop_main_thread():
    return ${options.stop ? 'True' : 'False'}
${MAIN_THREAD_INPUT_BOOTSTRAP}
try:
${options.program.split('\n').map(line => '    ' + line).join('\n')}
except SystemExit:
    print("[SystemExit]")
`
  const result = spawnSync(python!, ['-c', script], { encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

describe.skipIf(!python)('MAIN_THREAD_INPUT_BOOTSTRAP', () => {
  it('answers input() from the console when Python can be suspended', () => {
    const result = runBootstrap({ ffi: 'jspi', program: 'print(repr(input("Name? ")))' })
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe("[run_sync] <promise>\n'console:Name? '\n")
  })

  it('falls back to the pop-up when it cannot', () => {
    const result = runBootstrap({ ffi: 'no-jspi', program: 'print(repr(input("Name? ")))' })
    expect(result.stdout).toBe("[window.prompt] Name? \n'popup:Name? '\n")
  })

  it('falls back to the pop-up on a Pyodide with no run_sync at all', () => {
    const result = runBootstrap({ ffi: 'missing', program: 'print(repr(input("Age? ")))' })
    expect(result.stdout).toBe("[window.prompt] Age? \n'popup:Age? '\n")
  })

  it('ends the program like quit() when Stop is pressed during input()', () => {
    const result = runBootstrap({ ffi: 'jspi', stop: true, program: 'input("Name? ")\nprint("never")' })
    expect(result.stdout).toBe('[run_sync] <promise>\n[SystemExit]\n')
  })

  it('accepts input() with no prompt and non-string prompts, as CPython does', () => {
    const result = runBootstrap({ ffi: 'jspi', program: 'print(repr(input()))\nprint(repr(input(42)))' })
    expect(result.stdout).toBe("[run_sync] <promise>\n'console:'\n[run_sync] <promise>\n'console:42'\n")
  })
})
