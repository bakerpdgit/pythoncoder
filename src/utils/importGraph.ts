// ── Which of a filesystem's modules a run can actually reach ─────────────────
//
// Several decisions about a run are made by reading its source before it
// starts: whether it needs matplotlib's Agg backend, plotly or seaborn from PyPI,
// or the stdctx bootstrap. A program's drawing often lives in a module it
// imports (`import UI`), so the open file alone is not enough — but scanning
// every `.py` in the filesystem was too much: a sibling file that plots made
// "Hello, World!" load matplotlib, and one that imports seaborn sent it to PyPI.
//
// So the imports are followed instead, from the file being run through every
// module they reach. Getting this wrong in one direction only costs load time
// (the old behaviour); in the other it breaks the program. Everything here
// therefore errs towards including a file:
//
// - Import statements are found by pattern, not by parsing, so one inside an
//   `if`, a `try`, a function or even a docstring still counts.
// - A module is looked for beside the file being run, in the working directory,
//   at the root, and beside the module doing the importing.
// - A program that can import something no pattern can see — importlib,
//   `__import__`, exec, runpy — or that moves sys.path or its working
//   directory, gets every `.py` file, exactly as before.

export interface ProgramFile {
  path: string
  content: ArrayBuffer
}

/** One module reference from an import statement. */
export interface ImportRef {
  /** Dotted module name as written; empty for `from . import x`. */
  module: string
  /** Leading dots of a relative import; 0 for an absolute one. */
  level: number
  /** Names after `from … import`. Any of them may itself be a submodule. */
  names: string[]
}

// `import a.b as c, d` — at the start of a line, or after `;` or the `:` of a
// one-line compound statement (`if fancy: import charts`).
const IMPORT_STATEMENT = /(?:^|[;:])[ \t]*import[ \t]+([^;#\n]+)/gm
// `from ..a.b import (c, d)` — a parenthesised name list may span lines.
const FROM_STATEMENT = /(?:^|[;:])[ \t]*from(?:[ \t]+|(?=\.))(\.*)[ \t]*([\w.]*)[ \t]+import[ \t]*(\([^)]*\)|[^;#\n]+)/gm
const DYNAMIC_IMPORT = /\b(?:importlib|__import__|runpy|exec|chdir)\b|\bsys\s*\.\s*path\b/

export function findImports(source: string): ImportRef[] {
  const text = source.replace(/\r\n?/g, '\n').replace(/\\\n/g, ' ')
  const refs: ImportRef[] = []
  for (const match of text.matchAll(IMPORT_STATEMENT)) {
    for (const clause of match[1].split(',')) {
      const module = clause.trim().match(/^[A-Za-z_][\w.]*/)?.[0]
      if (module) refs.push({ module, level: 0, names: [] })
    }
  }
  for (const match of text.matchAll(FROM_STATEMENT)) {
    const names = match[3]
      .replace(/#[^\n]*/g, '')
      .replace(/[()]/g, '')
      .split(',')
      .map(clause => clause.trim().match(/^(?:\*|[A-Za-z_]\w*)/)?.[0])
      .filter((name): name is string => !!name)
    refs.push({ module: match[2].replace(/^\.+|\.+$/g, ''), level: match[1].length, names })
  }
  return refs
}

const normalisePath = (path: string): string => {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}

const parentDir = (path: string): string => {
  const slash = path.lastIndexOf('/')
  return slash <= 0 ? '/' : path.slice(0, slash)
}

const joinPath = (...parts: string[]): string => normalisePath(parts.join('/'))

/** Every file an import could be served from, whether or not it exists. */
function modulePaths(
  ref: ImportRef,
  importer: string | null,
  roots: string[],
  modules: Map<string, unknown>,
): string[] {
  let bases: string[]
  if (ref.level > 0 && importer) {
    let base = parentDir(importer)
    for (let i = 1; i < ref.level; i++) base = parentDir(base)
    bases = [base]
  } else {
    bases = [...new Set([...roots, ...(importer ? [parentDir(importer)] : [])])]
  }

  const parts = ref.module ? ref.module.split('.') : []
  const paths: string[] = []
  for (const base of bases) {
    // Importing a.b.c runs a/__init__.py and a/b/__init__.py on the way there.
    for (let i = 1; i <= parts.length; i++) {
      const module = joinPath(base, ...parts.slice(0, i))
      paths.push(`${module}.py`, joinPath(module, '__init__.py'))
    }
    const pkg = joinPath(base, ...parts)
    if (!parts.length) paths.push(joinPath(pkg, '__init__.py'))
    for (const name of ref.names) {
      if (name === '*') {
        // A star import also loads whichever submodules the package's __all__
        // names, which only running it would reveal: take them all.
        for (const path of modules.keys()) {
          if (parentDir(path) === pkg) paths.push(path)
        }
      } else {
        // `from pkg import name` may name a submodule rather than an attribute.
        const sub = joinPath(pkg, name)
        paths.push(`${sub}.py`, joinPath(sub, '__init__.py'))
      }
    }
  }
  return paths
}

/**
 * The `.py` files a program can import, directly or through other modules,
 * starting from the source being run. The entry file itself is left out — its
 * source is `entrySource`, which callers already have.
 */
export function programPythonFiles<F extends ProgramFile>(
  entrySource: string,
  entryPath: string | null | undefined,
  files: Iterable<F>,
  cwd = '/',
): F[] {
  const modules = new Map<string, F>()
  for (const file of files) {
    if (/\.py$/i.test(file.path)) modules.set(normalisePath(file.path), file)
  }
  const entry = entryPath ? normalisePath(entryPath) : null
  const everyModule = () => [...modules].filter(([path]) => path !== entry).map(([, file]) => file)

  const roots = [...new Set([entry ? parentDir(entry) : '/', normalisePath(cwd), '/'])]
  const reached = new Map<string, F>()
  const pending: Array<{ source: string; path: string | null }> = [{ source: entrySource, path: entry }]
  const decoder = new TextDecoder()

  while (pending.length) {
    const { source, path } = pending.pop()!
    if (DYNAMIC_IMPORT.test(source)) return everyModule()
    for (const ref of findImports(source)) {
      for (const candidate of modulePaths(ref, path, roots, modules)) {
        const file = modules.get(candidate)
        if (!file || candidate === entry || reached.has(candidate)) continue
        reached.set(candidate, file)
        pending.push({ source: decoder.decode(file.content), path: candidate })
      }
    }
  }
  return [...reached.values()]
}
