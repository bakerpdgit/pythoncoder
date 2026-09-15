import { describe, expect, it } from 'vitest'
import { detectPlottingLibs, detectSpongeLibs } from './codeAnalysis'
import { findImports, programPythonFiles } from './importGraph'

const file = (path: string, source: string) => ({
  path,
  content: new TextEncoder().encode(source).buffer as ArrayBuffer,
})
const paths = (files: Array<{ path: string }>) => files.map(f => f.path).sort()

describe('findImports', () => {
  it('reads every module out of a plain import list', () => {
    expect(findImports('import os, a.b as c,  d\n')).toEqual([
      { module: 'os', level: 0, names: [] },
      { module: 'a.b', level: 0, names: [] },
      { module: 'd', level: 0, names: [] },
    ])
  })

  it('reads from-imports, including a parenthesised list across lines', () => {
    expect(findImports('from pkg.sub import (\n  one,  # first\n  two as second,\n)\n')).toEqual([
      { module: 'pkg.sub', level: 0, names: ['one', 'two'] },
    ])
  })

  it('keeps the level of a relative import', () => {
    expect(findImports('from . import sibling\nfrom ..parent.mod import *\n')).toEqual([
      { module: '', level: 1, names: ['sibling'] },
      { module: 'parent.mod', level: 2, names: ['*'] },
    ])
  })

  it('finds imports that are not at the start of a line', () => {
    const refs = findImports('x = 1; import after_semicolon\nif fancy: import charts\n')
    expect(refs.map(r => r.module)).toEqual(['after_semicolon', 'charts'])
  })

  it('finds imports hidden inside blocks and functions', () => {
    const refs = findImports('try:\n    import optional\nexcept ImportError:\n    pass\n\ndef draw():\n    from ui import canvas\n')
    expect(refs.map(r => r.module)).toEqual(['optional', 'ui'])
  })
})

describe('programPythonFiles', () => {
  it('leaves out a file in the same filesystem that the program never imports', () => {
    // The reported case: Hello, World! loaded matplotlib because a sibling plots.
    const files = [
      file('/main.py', 'print("Hello, World!")'),
      file('/demo.py', 'import matplotlib.pyplot as plt\nplt.show()'),
    ]
    const reached = programPythonFiles('print("Hello, World!")', '/main.py', files)
    expect(reached).toEqual([])
    expect(detectPlottingLibs('print("Hello, World!")', reached))
      .toEqual({ matplotlib: false, plotly: false, seaborn: false })
  })

  it('follows imports through as many modules as the program chains', () => {
    const files = [
      file('/report.py', 'import charts'),
      file('/charts.py', 'from styles import theme'),
      file('/styles.py', 'import seaborn as sns\ntheme = 1'),
      file('/unrelated.py', 'import plotly.express as px'),
    ]
    const reached = programPythonFiles('import report', '/main.py', files)
    expect(paths(reached)).toEqual(['/charts.py', '/report.py', '/styles.py'])
    expect(detectPlottingLibs('import report', reached))
      .toEqual({ matplotlib: true, plotly: false, seaborn: true })
  })

  it('still finds drawing done in an imported module, but not in a sibling', () => {
    const files = [
      file('/UI.py', 'from sys import stdctx\nstdctx.fill_rect(0, 0, 10, 10)'),
      file('/jukebox.py', 'from sys import stdaud'),
    ]
    const reached = programPythonFiles('import UI', '/main.py', files)
    expect(detectSpongeLibs('import UI', reached)).toEqual({ usesStdctx: true, usesStdaud: false })
  })

  it('runs every package __init__ on the way to a submodule', () => {
    const files = [
      file('/shapes/__init__.py', ''),
      file('/shapes/solid/__init__.py', ''),
      file('/shapes/solid/cube.py', ''),
      file('/shapes/flat.py', ''),
    ]
    expect(paths(programPythonFiles('import shapes.solid.cube', null, files)))
      .toEqual(['/shapes/__init__.py', '/shapes/solid/__init__.py', '/shapes/solid/cube.py'])
  })

  it('treats a name imported from a package as a possible submodule', () => {
    const files = [file('/shapes/__init__.py', ''), file('/shapes/flat.py', ''), file('/shapes/round.py', '')]
    expect(paths(programPythonFiles('from shapes import flat', null, files)))
      .toEqual(['/shapes/__init__.py', '/shapes/flat.py'])
  })

  it('takes every submodule of a package that is star-imported', () => {
    const files = [file('/shapes/__init__.py', ''), file('/shapes/flat.py', ''), file('/other.py', '')]
    expect(paths(programPythonFiles('from shapes import *', null, files)))
      .toEqual(['/shapes/__init__.py', '/shapes/flat.py'])
  })

  it('resolves relative imports against the importing module', () => {
    const files = [
      file('/game/__init__.py', 'from .engine import loop'),
      file('/game/engine.py', 'from ..assets import sprites\nfrom . import physics'),
      file('/game/physics.py', ''),
      file('/assets/sprites.py', ''),
      file('/assets/unused.py', ''),
    ]
    expect(paths(programPythonFiles('import game', '/main.py', files)))
      .toEqual(['/assets/sprites.py', '/game/__init__.py', '/game/engine.py', '/game/physics.py'])
  })

  it('looks beside the file being run and in the working directory', () => {
    const files = [
      file('/lesson/helper.py', ''),
      file('/shared.py', ''),
      file('/work/scratch.py', ''),
    ]
    expect(paths(programPythonFiles('import helper, shared, scratch', '/lesson/main.py', files, '/work')))
      .toEqual(['/lesson/helper.py', '/shared.py', '/work/scratch.py'])
  })

  it('does not loop on modules that import each other', () => {
    const files = [file('/a.py', 'import b'), file('/b.py', 'import a')]
    expect(paths(programPythonFiles('import a', '/main.py', files))).toEqual(['/a.py', '/b.py'])
  })

  it('never returns the file being run, even when something imports it back', () => {
    const files = [file('/main.py', 'import helper'), file('/helper.py', 'import main')]
    expect(paths(programPythonFiles('import helper', '/main.py', files))).toEqual(['/helper.py'])
  })

  it('falls back to every file when an import could be one no pattern can see', () => {
    const files = [
      file('/main.py', ''),
      file('/loader.py', 'import importlib\nmod = importlib.import_module(name)'),
      file('/plugin.py', 'import matplotlib'),
    ]
    expect(paths(programPythonFiles('import loader', '/main.py', files))).toEqual(['/loader.py', '/plugin.py'])
    expect(paths(programPythonFiles('__import__("plugin")', '/main.py', files))).toEqual(['/loader.py', '/plugin.py'])
    expect(paths(programPythonFiles('import sys\nsys.path.append("lib")', '/main.py', files)))
      .toEqual(['/loader.py', '/plugin.py'])
  })

  it('ignores files that are not Python', () => {
    const files = [file('/data.txt', 'import matplotlib'), file('/helper.py', '')]
    expect(paths(programPythonFiles('import data, helper', '/main.py', files))).toEqual(['/helper.py'])
  })
})
