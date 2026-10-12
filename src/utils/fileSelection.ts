// Selecting several entries in the File System panel, as a file explorer does:
// a plain click selects one, Ctrl/Cmd+click adds or removes one, Shift+click
// selects a run from the last plain or Ctrl click (the anchor). A selection
// lives in one folder — the one on screen — so its entries are siblings.

export interface FileSelection {
  /** Ids of the selected entries. */
  ids: ReadonlySet<string>
  /** Where a Shift+click range starts; null when nothing has been clicked. */
  anchor: string | null
}

export const EMPTY_SELECTION: FileSelection = { ids: new Set(), anchor: null }

/**
 * The selection after a click on `target`. `order` is the ids as listed, which
 * is what a Shift range runs along. Ctrl+Shift adds the range to what is
 * already selected rather than replacing it.
 */
export function clickSelection(
  current: FileSelection,
  order: readonly string[],
  target: string,
  mods: { ctrl?: boolean; shift?: boolean },
): FileSelection {
  if (mods.shift) {
    const anchor = current.anchor && order.includes(current.anchor) ? current.anchor : target
    const from = order.indexOf(anchor)
    const to = order.indexOf(target)
    const range = from < 0 || to < 0 ? [target] : order.slice(Math.min(from, to), Math.max(from, to) + 1)
    const ids = new Set(mods.ctrl ? current.ids : [])
    for (const id of range) ids.add(id)
    // The anchor stays put, so a second Shift+click re-measures from it.
    return { ids, anchor }
  }
  if (mods.ctrl) {
    const ids = new Set(current.ids)
    if (ids.has(target)) ids.delete(target)
    else ids.add(target)
    return { ids, anchor: target }
  }
  return { ids: new Set([target]), anchor: target }
}

/** Keep only ids that are still listed — after a reload, a delete, a rename. */
export function pruneSelection(current: FileSelection, order: readonly string[]): FileSelection {
  const listed = new Set(order)
  const kept = [...current.ids].filter(id => listed.has(id))
  if (kept.length === current.ids.size && (current.anchor === null || listed.has(current.anchor))) return current
  return { ids: new Set(kept), anchor: current.anchor && listed.has(current.anchor) ? current.anchor : null }
}

/** Is `path` one of `roots`, or inside one of them? */
export function isWithin(path: string, roots: readonly string[]): boolean {
  return roots.some(root => root === '/' || path === root || path.startsWith(root + '/'))
}

/**
 * The files under a selection, re-rooted at the folder the selection sits in —
 * as a ZIP of selected files holds them at its top, whatever folder they came
 * from. `base` is that folder; `roots` the selected files and folders.
 */
export function selectionFiles(
  files: Iterable<[string, ArrayBuffer]>,
  roots: readonly string[],
  base: string,
): Map<string, ArrayBuffer> {
  const out = new Map<string, ArrayBuffer>()
  for (const [path, content] of files) {
    if (isWithin(path, roots)) out.set(rebasePath(path, base), content)
  }
  return out
}

/** `/proj/data/x.csv` seen from `/proj` is `/data/x.csv`; a path outside `base` is left alone. */
export function rebasePath(path: string, base: string): string {
  return base !== '/' && path.startsWith(base + '/') ? path.slice(base.length) : path
}

/**
 * How far to move a box (a menu) so it sits inside `bounds`, `margin` pixels
 * clear of each edge. The left/top edge wins when the box is bigger than the
 * space, so a menu's first items are always reachable.
 */
export function nudgeInside(
  box: { left: number; top: number; right: number; bottom: number },
  bounds: { left: number; top: number; right: number; bottom: number },
  margin = 4,
): { dx: number; dy: number } {
  const axis = (lo: number, hi: number, min: number, max: number) => {
    if (hi > max - margin) {
      const shift = max - margin - hi
      return lo + shift < min + margin ? min + margin - lo : shift
    }
    return lo < min + margin ? min + margin - lo : 0
  }
  return {
    dx: axis(box.left, box.right, bounds.left, bounds.right),
    dy: axis(box.top, box.bottom, bounds.top, bounds.bottom),
  }
}
