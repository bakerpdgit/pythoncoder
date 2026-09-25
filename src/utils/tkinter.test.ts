import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { TKINTER_MAIN_THREAD_BOOTSTRAP, TKINTER_SHIM_FILES, codeUsesTkinter, detectTkinter } from './tkinter'

const pythonAvailable = spawnSync('python', ['--version']).status === 0
const file = (path: string, text: string) => ({ path, content: new TextEncoder().encode(text).buffer as ArrayBuffer })

describe('tkinter detection', () => {
  it.each([
    'import tkinter as tk',
    'from tkinter import *',
    'from tkinter import ttk, messagebox',
    'import tkinter.messagebox as mb',
    'import os, tkinter',
    '  import tkinter',
    'from Tkinter import *',
  ])('spots %s', source => {
    expect(codeUsesTkinter(`x = 1\n${source}\n`)).toBe(true)
  })

  it.each([
    '# import tkinter',
    'print("import tkinter")',
    'import tkinterish',
    'import turtle',
  ])('ignores %s', source => {
    expect(codeUsesTkinter(source)).toBe(false)
  })

  it('finds a GUI kept in a module the program imports', () => {
    expect(detectTkinter('import gui\ngui.run()', [file('/gui.py', 'import tkinter as tk\n'), file('/notes.txt', 'import tkinter')])).toBe(true)
    expect(detectTkinter('print(1)', [file('/data.txt', 'import tkinter')])).toBe(false)
  })

  it('ships every module the package imports', () => {
    const modules = Object.keys(TKINTER_SHIM_FILES)
    for (const [path, source] of Object.entries(TKINTER_SHIM_FILES)) {
      for (const m of source.matchAll(/^\s*from tkinter\.(\w+) import|^\s*import tkinter\.(\w+)/gm)) {
        expect(modules, `${path} imports tkinter.${m[1] ?? m[2]}`).toContain(`tkinter/${m[1] ?? m[2]}.py`)
      }
    }
  })
})

describe.skipIf(!pythonAvailable)('the tkinter bootstrap', () => {
  it('compiles, top-level await and all', () => {
    const script = [
      'import ast, sys',
      'src = sys.stdin.read()',
      'compile(src, "<bootstrap>", "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)',
      'print("ok")',
    ].join('\n')
    const result = spawnSync('python', ['-c', script], { input: TKINTER_MAIN_THREAD_BOOTSTRAP, encoding: 'utf8' })
    expect(result.stderr).toBe('')
    expect(result.stdout.trim()).toBe('ok')
  })
})
