import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { TKINTER_MAIN_THREAD_BOOTSTRAP, TKINTER_WORKER_BOOTSTRAP, codeUsesP5, codeUsesTkinter, detectP5, detectTkinter, tkFilesForTesting } from './tkinter'
import { TKINTER_SHIM_FILES } from './tkinterSources'

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

describe('p5 detection', () => {
  it.each(['from p5 import *', 'import p5', 'from pyp5js import *', 'import math, p5'])('spots %s, and counts it as a tkinter program', source => {
    // A sketch is drawn in a window of Coder's tkinter, so every runtime
    // decision that asks about tkinter has to say yes to it too.
    expect(codeUsesP5(source)).toBe(true)
    expect(codeUsesTkinter(source)).toBe(true)
  })

  it.each(['# from p5 import *', 'import p5js', 'print("import p5")'])('ignores %s', source => {
    expect(codeUsesP5(source)).toBe(false)
  })

  it('finds a sketch kept in a module the program imports', () => {
    expect(detectP5('import shapes', [file('/shapes.py', 'from p5 import *\n')])).toBe(true)
    expect(detectP5('print(1)', [file('/notes.txt', 'from p5 import *')])).toBe(false)
  })

  it('ships p5 with the package, and sends it to the tester for p5 tests and sketches', async () => {
    expect(Object.keys(TKINTER_SHIM_FILES)).toEqual(expect.arrayContaining(['p5/__init__.py', 'pyp5js.py']))
    expect(await tkFilesForTesting('print(1)', [], [{ out: [{ typ: 'p5', filename: 'sol.py' }] }])).not.toBeNull()
    expect(await tkFilesForTesting('from p5 import *', [])).not.toBeNull()
    expect(await tkFilesForTesting('print(1)', [], [{ out: 'hi' }])).toBeNull()
  })
})

describe.skipIf(!pythonAvailable)('the tkinter bootstrap', () => {
  it('compiles the worker bootstrap too', () => {
    const result = spawnSync('python', ['-c', 'import sys; compile(sys.stdin.read(), "<bootstrap>", "exec"); print("ok")'], { input: TKINTER_WORKER_BOOTSTRAP, encoding: 'utf8' })
    expect(result.stderr).toBe('')
    expect(result.stdout.trim()).toBe('ok')
  })

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
