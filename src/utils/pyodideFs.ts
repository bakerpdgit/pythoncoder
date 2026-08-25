// ── Pyodide filesystem boundaries ──────────────────────────────────────────
//
// User files are mounted at their virtual-filesystem paths under `/`, and the
// working directory is usually `/` too. After a run we walk the working
// directory to pick up whatever the program created or changed — but Pyodide's
// own Emscripten filesystem is rooted there as well, so an unguarded walk
// sweeps its entire standard library (a ~2 MB `/lib/python313.zip`) into the
// user's filesystem, on every single run.

/**
 * Directories Pyodide owns. Nothing under these belongs to the user, so they
 * are never synced back.
 */
export const PYODIDE_SYSTEM_DIRS = [
  '/bin',
  '/dev',
  '/etc',
  '/home',
  '/lib',
  '/proc',
  '/sys',
  '/tmp',
  '/usr',
] as const

/**
 * The system directories to skip for this run.
 *
 * A directory we actually mounted files into is the user's, not Pyodide's —
 * a learning book is free to contain a folder called `lib` — so it is left in.
 */
export function pyodideSkipDirs(mountedPaths: Iterable<string>): Set<string> {
  const skip = new Set<string>(PYODIDE_SYSTEM_DIRS)
  for (const path of mountedPaths) {
    const topLevel = `/${path.replace(/^\//, '').split('/')[0]}`
    skip.delete(topLevel)
  }
  return skip
}
