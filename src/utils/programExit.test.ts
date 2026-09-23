import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { runProgramPython } from './programExit'

// Runs the generated wrapper under native Python, exactly as the runtimes run
// it under Pyodide: the student's source is compiled and exec'd by the one
// statement the wrapper is given.
const pythonAvailable = spawnSync('python', ['--version']).status === 0

function run(student: string) {
  const script = `user_code = ${JSON.stringify(student)}\n` +
    'code_obj = compile(user_code, "simulation.py", "exec")\n' +
    runProgramPython('exec(code_obj, {"__name__": "__main__"})') +
    'print("[host carried on]")\n'
  const result = spawnSync('python', ['-c', script], { encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

describe.skipIf(!pythonAvailable)('runProgramPython', () => {
  it.each([
    ['quit()', 'quit()'],
    ['exit()', 'exit()'],
    ['sys.exit()', 'import sys\nsys.exit()'],
    ['sys.exit(0)', 'import sys\nsys.exit(0)'],
    ['a non-zero status', 'import sys\nsys.exit(3)'],
  ])('ends quietly on %s', (_label, exitLine) => {
    const result = run(`print("before")\n${exitLine}\nprint("after")\n`)
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('before\n[host carried on]\n')
    expect(result.stderr).toBe('')
  })

  it('prints a message exit to stderr, as CPython does', () => {
    const result = run('import sys\nsys.exit("Goodbye")\n')
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('Goodbye\n')
    expect(result.stdout).toBe('[host carried on]\n')
  })

  it('ends quietly when quit() is called deep inside the program', () => {
    const result = run('def menu():\n    def play():\n        quit()\n    play()\nmenu()\nprint("after")\n')
    expect(result.stdout).toBe('[host carried on]\n')
    expect(result.stderr).toBe('')
  })

  it('still lets a real error escape', () => {
    const result = run('raise ValueError("broken")\n')
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('ValueError: broken')
    expect(result.stdout).toBe('')
  })

  it('does not swallow a stop signal that is not SystemExit', () => {
    const result = run('class Stop(BaseException): pass\nraise Stop()\n')
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Stop')
  })
})
