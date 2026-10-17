/**
 * Parsons problems (code reordering exercises).
 *
 * The grader is a native port of js-parsons' line-based one; the rest is
 * Coder's own. Everything here is pure and testable — no DOM.
 *
 * The authoring contract is Python Sponge's, so existing books keep working,
 * with two widenings:
 *   - a challenge declares `"typ": "parsons"`, and has no `tests`
 *   - a line ending `#distractor` is a wrong line (the marker is stripped)
 *   - `# start` … `# end` fences a *block* of movable lines; everything outside
 *     every block is fixed code. Any number of blocks (Sponge: one); a block's
 *     lines move only within it. A `# start` with no `# end` runs to the end of
 *     the file, and a file with no markers at all is one block.
 *   - `\n` inside a source line makes one fragment span several lines
 *   - blank lines inside a block are dropped
 *   - `"parsons": { "indent": "given" | "student" }` on the challenge says who
 *     sets indentation: the answer's own ("given"), or the student. Absent means
 *     "student", as Sponge did. An answer with nothing indented is always given.
 *
 * There is no separate bank: every fragment, distractors included, starts in its
 * block, shuffled, and the student strikes out the ones that do not belong.
 */

import { detectIndentUnit } from './indentation'

export type ParsonsIndentMode = 'given' | 'student'

export interface ParsonsLine {
  /** Stable id, numbered across the whole problem: p0, p1, … */
  id: string
  /** The fragment's code: `#distractor` stripped, the first line's indentation
   *  taken off, `\n` turned into real line breaks. */
  code: string
  /** The leading whitespace it was written with in the answer. */
  prefix: string
  /** Its nesting level within its block, relative to the block's base indent. */
  indent: number
  distractor: boolean
}

export interface ParsonsFixed {
  kind: 'fixed'
  /** Source lines, verbatim (marker lines excluded). */
  lines: string[]
}

export interface ParsonsBlock {
  kind: 'block'
  /** b0, b1, … in file order. */
  id: string
  /** The leading whitespace of the block's least indented answer line. */
  basePrefix: string
  /** The model answer, in order. */
  solution: ParsonsLine[]
  /** Every fragment of the block: the answer's lines then the distractors. */
  pool: ParsonsLine[]
}

export type ParsonsSegment = ParsonsFixed | ParsonsBlock

export interface ParsonsProblem {
  segments: ParsonsSegment[]
  blocks: ParsonsBlock[]
  /** Who sets indentation, after `canIndent` has had its say. */
  indentMode: ParsonsIndentMode
  /** False when no answer line is indented within its block. */
  canIndent: boolean
  /** One level of indentation as text, from the answer ('    ' when it has none). */
  indentUnit: string
}

/** Where each fragment of one block currently sits. */
export interface ParsonsBlockArrangement {
  /** Every fragment of the block, in the order shown. */
  order: string[]
  /** The fragments struck out — shown in place, left out of the program. */
  removed: string[]
  /** Student-set nesting levels (student indentation only). */
  indents: Record<string, number>
}

/** Where every fragment currently sits. Persisted per student. */
export interface ParsonsArrangement {
  v: 2
  blocks: Record<string, ParsonsBlockArrangement>
}

export type ParsonsFlag = 'correct' | 'incorrectPosition' | 'incorrectIndent'

export interface ParsonsFeedback {
  success: boolean
  messages: string[]
  /** Fragment id → how to highlight it. */
  flags: Record<string, ParsonsFlag>
}

const DISTRACTOR_RE = /\s*#\s*distractor\s*$/i
const START_RE = /^\s*#\s*start\b/i
const END_RE = /^\s*#\s*end\b/i

export const isParsonsMarker = (line: string) => START_RE.test(line) || END_RE.test(line)

/** Feedback wording, kept verbatim from js-parsons so it reads as teachers expect. */
export const PARSONS_MESSAGES = {
  order: () =>
    'Code fragments in your program are wrong, or in wrong order. This can be fixed by moving, removing, or replacing highlighted fragments.',
  linesMissing: () => 'Your program has too few code fragments.',
  linesTooMany: () => 'Your program has too many code fragments.',
  blockStructure: (n: number) =>
    `The highlighted fragment ${n} belongs to a wrong block (i.e. indentation).`,
}

const leadingOf = (line: string) => line.slice(0, line.length - line.replace(/^\s+/, '').length)

/** Indentation width, a tab counting as one step to the next multiple of 8. */
function widthOf(prefix: string): number {
  let w = 0
  for (const ch of prefix) w = ch === '\t' ? w + 8 - (w % 8) : w + 1
  return w
}

/**
 * Nesting levels from indentation widths, as Python's tokenizer counts them: a
 * deeper line opens a level, a shallower one closes levels back to the nearest
 * one not deeper than it. 2-space and 4-space answers grade identically, and a
 * student's over-indented line counts by its structure, not its exact depth.
 */
export function indentLevels(widths: number[]): number[] {
  const stack: number[] = []
  return widths.map(w => {
    while (stack.length > 0 && stack[stack.length - 1] > w) stack.pop()
    if (stack.length === 0 || w > stack[stack.length - 1]) stack.push(w)
    return stack.length - 1
  })
}

function unitText(source: string): string {
  const unit = detectIndentUnit(source)
  if (unit === 'tab') return '\t'
  return ' '.repeat(unit ?? 4)
}

interface RawFragment { code: string; prefix: string; distractor: boolean }

function parseFragment(line: string): RawFragment | null {
  const distractor = DISTRACTOR_RE.test(line)
  const stripped = line.replace(DISTRACTOR_RE, '').replace(/\s+$/, '')
  if (stripped.trim().length === 0) return null
  const prefix = leadingOf(stripped)
  const code = stripped.slice(prefix.length).replace(/\\n/g, '\n')
  return { code, prefix, distractor }
}

/** Split a source into fixed runs and blocks, by its markers. */
function splitSource(lines: string[]): Array<{ kind: 'fixed' | 'block'; lines: string[] }> {
  if (!lines.some(l => START_RE.test(l))) return [{ kind: 'block', lines }]
  const parts: Array<{ kind: 'fixed' | 'block'; lines: string[] }> = []
  let current: { kind: 'fixed' | 'block'; lines: string[] } = { kind: 'fixed', lines: [] }
  for (const line of lines) {
    if (START_RE.test(line) && current.kind === 'fixed') {
      parts.push(current)
      current = { kind: 'block', lines: [] }
    } else if (END_RE.test(line) && current.kind === 'block') {
      parts.push(current)
      current = { kind: 'fixed', lines: [] }
    } else if (isParsonsMarker(line)) {
      // A stray marker (# end outside a block, # start inside one) is dropped.
    } else {
      current.lines.push(line)
    }
  }
  parts.push(current)
  return parts
}

/** Parse a challenge's source file into a Parsons problem. */
export function parseParsonsSource(
  source: string,
  options: { indent?: ParsonsIndentMode } = {},
): ParsonsProblem {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const parts = splitSource(lines)

  // The program ends at its last non-blank line.
  const last = parts[parts.length - 1]
  if (last.kind === 'fixed') {
    while (last.lines.length > 0 && last.lines[last.lines.length - 1].trim() === '') last.lines.pop()
  }

  const segments: ParsonsSegment[] = []
  const blocks: ParsonsBlock[] = []
  let nextId = 0
  for (const part of parts) {
    if (part.kind === 'fixed') {
      if (part.lines.length > 0) segments.push({ kind: 'fixed', lines: part.lines })
      continue
    }
    const raw = part.lines.map(parseFragment).filter((f): f is RawFragment => f !== null)
    const answer = raw.filter(f => !f.distractor)
    const wrong = raw.filter(f => f.distractor)
    const basis = answer.length > 0 ? answer : wrong
    const base = basis.reduce<string | null>(
      (best, f) => best === null || widthOf(f.prefix) < widthOf(best) ? f.prefix : best, null) ?? ''
    const baseWidth = widthOf(base)
    const levels = indentLevels(answer.map(f => Math.max(widthOf(f.prefix) - baseWidth, 0)))
    const solution: ParsonsLine[] = answer.map((f, i) => ({
      id: `p${nextId + i}`, code: f.code, prefix: f.prefix, indent: levels[i], distractor: false,
    }))
    nextId += solution.length
    // A distractor's level is where its indentation would put it among the
    // answer's own levels.
    const answerWidths = [...new Set(answer.map(f => Math.max(widthOf(f.prefix) - baseWidth, 0)))].sort((a, b) => a - b)
    const distractors: ParsonsLine[] = wrong.map((f, i) => {
      const w = Math.max(widthOf(f.prefix) - baseWidth, 0)
      const level = answerWidths.filter(aw => aw < w).length
      return { id: `p${nextId + i}`, code: f.code, prefix: f.prefix, indent: level, distractor: true }
    })
    nextId += distractors.length
    const block: ParsonsBlock = {
      kind: 'block', id: `b${blocks.length}`, basePrefix: base, solution, pool: [...solution, ...distractors],
    }
    blocks.push(block)
    segments.push(block)
  }

  const canIndent = blocks.some(b => b.solution.some(l => l.indent > 0))
  return {
    segments,
    blocks,
    indentMode: options.indent === 'given' || !canIndent ? 'given' : 'student',
    canIndent,
    indentUnit: unitText(source),
  }
}

/** Fisher-Yates. */
export function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

/** Every block shuffled, nothing removed — the starting position. Never one
 *  that is already solved (unless a block has nothing to move). */
export function shuffledArrangement(problem: ParsonsProblem): ParsonsArrangement {
  const blocks: Record<string, ParsonsBlockArrangement> = {}
  for (const block of problem.blocks) {
    const ids = block.pool.map(l => l.id)
    let order = shuffle(ids)
    for (let tries = 0; tries < 20 && ids.length > 1; tries++) {
      const attempt: ParsonsBlockArrangement = { order, removed: [], indents: {} }
      if (!gradeBlock(problem, block, attempt).success && order.join() !== ids.join()) break
      order = shuffle(ids)
    }
    blocks[block.id] = { order, removed: [], indents: {} }
  }
  return { v: 2, blocks }
}

/**
 * True when a saved arrangement still describes this exact problem. An author
 * editing the file changes the pool, and a stale arrangement must be discarded
 * rather than silently dropping or inventing fragments.
 */
export function arrangementMatchesProblem(
  problem: ParsonsProblem,
  arrangement: unknown,
): arrangement is ParsonsArrangement {
  if (!arrangement || typeof arrangement !== 'object') return false
  const a = arrangement as Partial<ParsonsArrangement>
  if (a.v !== 2 || !a.blocks || typeof a.blocks !== 'object') return false
  if (Object.keys(a.blocks).length !== problem.blocks.length) return false
  for (const block of problem.blocks) {
    const b = a.blocks[block.id]
    if (!b || !Array.isArray(b.order) || !Array.isArray(b.removed) || !b.indents || typeof b.indents !== 'object') return false
    if (b.order.length !== block.pool.length || new Set(b.order).size !== b.order.length) return false
    const ids = new Set(block.pool.map(l => l.id))
    if (!b.order.every(id => ids.has(id))) return false
    if (!b.removed.every(id => ids.has(id))) return false
  }
  return true
}

/**
 * A saved arrangement as this problem can use it: v2 as it stands, Coder's
 * first (two-panel) shape converted — what was still in the bank becomes
 * struck out at the end — or null when it no longer fits.
 */
export function migrateArrangement(problem: ParsonsProblem, stored: unknown): ParsonsArrangement | null {
  if (arrangementMatchesProblem(problem, stored)) return stored
  const old = stored as { source?: unknown; solution?: unknown } | null
  if (!old || !Array.isArray(old.source) || !Array.isArray(old.solution) || problem.blocks.length !== 1) return null
  const placed = (old.solution as Array<{ id?: unknown; indent?: unknown }>)
    .filter(s => typeof s?.id === 'string')
  const source = (old.source as unknown[]).filter((id): id is string => typeof id === 'string')
  const indents: Record<string, number> = {}
  for (const s of placed) if (typeof s.indent === 'number' && s.indent > 0) indents[s.id as string] = s.indent
  const next: ParsonsArrangement = {
    v: 2,
    blocks: {
      [problem.blocks[0].id]: { order: [...placed.map(s => s.id as string), ...source], removed: source, indents },
    },
  }
  return arrangementMatchesProblem(problem, next) ? next : null
}

/** One row of the puzzle as shown: a fixed line, or one fragment. */
export type ParsonsRow =
  | { kind: 'fixed'; key: string; text: string; lineNumber: number }
  | {
      kind: 'fragment'
      key: string
      line: ParsonsLine
      blockId: string
      /** Position within its block's order. */
      index: number
      removed: boolean
      /** The level it is shown and run at. */
      level: number
      /** Each of its lines as it goes into the program, indentation included. */
      text: string[]
      /** Program line of its first line, or null when struck out. */
      lineNumber: number | null
    }

function fragmentLines(problem: ParsonsProblem, block: ParsonsBlock, line: ParsonsLine, level: number): string[] {
  const lead = problem.indentMode === 'given'
    ? line.prefix
    : block.basePrefix + problem.indentUnit.repeat(Math.max(level, 0))
  return line.code.split('\n').map(sub => lead + sub)
}

/** Every row in display order, numbered as the assembled program is. */
export function parsonsRows(problem: ParsonsProblem, arrangement: ParsonsArrangement): ParsonsRow[] {
  const rows: ParsonsRow[] = []
  let lineNumber = 1
  problem.segments.forEach((seg, si) => {
    if (seg.kind === 'fixed') {
      seg.lines.forEach((text, li) => {
        rows.push({ kind: 'fixed', key: `f${si}.${li}`, text, lineNumber })
        lineNumber += 1
      })
      return
    }
    const byId = new Map(seg.pool.map(l => [l.id, l]))
    const placed = arrangement.blocks[seg.id]
    const removed = new Set(placed?.removed ?? [])
    const order = placed?.order ?? seg.pool.map(l => l.id)
    order.forEach((id, index) => {
      const line = byId.get(id)
      if (!line) return
      const level = problem.indentMode === 'given' ? line.indent : (placed?.indents[id] ?? 0)
      const text = fragmentLines(problem, seg, line, level)
      const isRemoved = removed.has(id)
      rows.push({
        kind: 'fragment', key: id, line, blockId: seg.id, index, removed: isRemoved, level, text,
        lineNumber: isRemoved ? null : lineNumber,
      })
      if (!isRemoved) lineNumber += text.length
    })
  })
  return rows
}

export interface AssembledParsons {
  code: string
  /** Program line (1-based) → the key of the row it came from. */
  rowAt: Record<number, string>
}

/** The program the student's arrangement makes, struck-out lines left out. */
export function assembleCode(problem: ParsonsProblem, arrangement: ParsonsArrangement): AssembledParsons {
  const out: string[] = []
  const rowAt: Record<number, string> = {}
  for (const row of parsonsRows(problem, arrangement)) {
    if (row.kind === 'fixed') {
      out.push(row.text)
      rowAt[out.length] = row.key
    } else if (!row.removed) {
      for (const text of row.text) {
        out.push(text)
        rowAt[out.length] = row.key
      }
    }
  }
  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
  return { code: out.length > 0 ? out.join('\n') + '\n' : '', rowAt }
}

/** The deepest level a fragment may be given at `index` in its block's kept order. */
export function maxIndentAt(arrangement: ParsonsBlockArrangement, id: string): number {
  const kept = arrangement.order.filter(o => o === id || !arrangement.removed.includes(o))
  const at = kept.indexOf(id)
  if (at <= 0) return 0
  return (arrangement.indents[kept[at - 1]] ?? 0) + 1
}

/**
 * Indices NOT in a longest increasing subsequence — the fragments that would
 * have to move to put the rest in order. Patience sorting, O(n log n).
 */
function lisInverseIndices(seq: number[]): number[] {
  const n = seq.length
  if (n === 0) return []
  const tailIdx: number[] = []   // tailIdx[k] = index of the smallest tail of an increasing run of length k+1
  const prev: number[] = new Array(n).fill(-1)
  for (let i = 0; i < n; i++) {
    // Non-decreasing runs count as increasing: duplicate model positions arise
    // from repeated code lines and must not be flagged against each other.
    let lo = 0
    let hi = tailIdx.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (seq[tailIdx[mid]] <= seq[i]) lo = mid + 1
      else hi = mid
    }
    prev[i] = lo > 0 ? tailIdx[lo - 1] : -1
    tailIdx[lo] = i
  }
  const inLis = new Set<number>()
  let k: number = tailIdx[tailIdx.length - 1]
  while (k !== -1) { inLis.add(k); k = prev[k] }
  const inverse: number[] = []
  for (let i = 0; i < n; i++) if (!inLis.has(i)) inverse.push(i)
  return inverse
}

interface GradedLine { id: string; key: string; indent: number }

/**
 * The line-based grader: order first (via LIS), then fragment count, and only
 * when the order is perfect, indentation — reporting the first indent error
 * only, as js-parsons did.
 */
function gradeLines(model: GradedLine[], student: GradedLine[], checkIndent: boolean): ParsonsFeedback {
  const messages: string[] = []
  const flags: Record<string, ParsonsFlag> = {}

  // Map each student fragment onto a model position; a fragment that appears
  // nowhere in the model is a distractor.
  const lastFound: Record<string, number> = {}
  const positions: Array<{ id: string; position: number; ignore: boolean }> = []
  let wrongOrder = false

  for (const line of student) {
    const from = lastFound[line.key] !== undefined ? lastFound[line.key] + 1 : 0
    let found = -1
    for (let i = from; i < model.length; i++) {
      if (model[i].key === line.key) { found = i; break }
    }
    if (found !== -1) {
      lastFound[line.key] = found
      positions.push({ id: line.id, position: found, ignore: false })
    } else if (lastFound[line.key] !== undefined) {
      // A duplicate of a solution line: the LIS pass sorts out which copy stays.
      positions.push({ id: line.id, position: lastFound[line.key], ignore: false })
    } else {
      wrongOrder = true
      flags[line.id] = 'incorrectPosition'
      positions.push({ id: line.id, position: -1, ignore: true })
    }
  }

  const considered = positions.filter(p => !p.ignore)
  for (const idx of lisInverseIndices(considered.map(p => p.position))) {
    wrongOrder = true
    flags[considered[idx].id] = 'incorrectPosition'
  }

  if (wrongOrder) messages.push(PARSONS_MESSAGES.order())

  if (model.length < student.length) messages.push(PARSONS_MESSAGES.linesTooMany())
  else if (model.length > student.length) messages.push(PARSONS_MESSAGES.linesMissing())

  if (messages.length === 0) {
    for (let i = 0; i < Math.min(student.length, model.length); i++) {
      const line = student[i]
      if (checkIndent && line.indent !== model[i].indent && messages.length === 0) {
        flags[line.id] = 'incorrectIndent'
        messages.push(PARSONS_MESSAGES.blockStructure(i + 1))
      } else if (line.key === model[i].key && messages.length === 0) {
        flags[line.id] = 'correct'
      }
    }
  }

  return { success: messages.length === 0, messages, flags }
}

function gradeBlock(problem: ParsonsProblem, block: ParsonsBlock, placed: ParsonsBlockArrangement): ParsonsFeedback {
  const given = problem.indentMode === 'given'
  // Given indentation is part of what a line *is*: two copies of one line at
  // different depths are different lines, told apart by order alone.
  const keyOf = (l: ParsonsLine) => given ? `${l.indent}\u0000${l.code}` : l.code
  const model = block.solution.map(l => ({ id: l.id, key: keyOf(l), indent: l.indent }))
  const byId = new Map(block.pool.map(l => [l.id, l]))
  const removed = new Set(placed.removed)
  const kept = placed.order.filter(id => !removed.has(id) && byId.has(id)).map(id => byId.get(id)!)
  // Student indents are re-normalised so an over-indented but structurally
  // correct arrangement still grades as correct (js-parsons behaviour).
  const levels = indentLevels(kept.map(l => given ? l.indent : (placed.indents[l.id] ?? 0)))
  const student = kept.map((l, i) => ({ id: l.id, key: keyOf(l), indent: given ? l.indent : levels[i] }))
  return gradeLines(model, student, !given)
}

/** Grade every block; messages name the block when there is more than one. */
export function gradeParsons(problem: ParsonsProblem, arrangement: ParsonsArrangement): ParsonsFeedback {
  const messages: string[] = []
  const flags: Record<string, ParsonsFlag> = {}
  let success = true
  problem.blocks.forEach((block, i) => {
    const placed = arrangement.blocks[block.id] ?? { order: block.pool.map(l => l.id), removed: [], indents: {} }
    const feedback = gradeBlock(problem, block, placed)
    success &&= feedback.success
    Object.assign(flags, feedback.flags)
    const label = problem.blocks.length > 1 ? `Block ${i + 1}: ` : ''
    for (const m of feedback.messages) messages.push(label + m)
  })
  return { success, messages, flags }
}

// ── Authoring ───────────────────────────────────────────────────────────────

export type ParsonsRole = 'fixed' | 'movable' | 'distractor' | 'marker' | 'blank'
export type ParsonsSettableRole = 'fixed' | 'movable' | 'distractor'

/** What each line of an answer file is, for the editor to show. */
export function parsonsLineRoles(source: string): ParsonsRole[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const hasMarkers = lines.some(l => START_RE.test(l))
  let inBlock = !hasMarkers
  return lines.map(line => {
    if (hasMarkers && START_RE.test(line) && !inBlock) { inBlock = true; return 'marker' }
    if (hasMarkers && END_RE.test(line) && inBlock) { inBlock = false; return 'marker' }
    if (hasMarkers && isParsonsMarker(line)) return 'marker'
    if (line.trim() === '') return 'blank'
    if (!inBlock) return 'fixed'
    return DISTRACTOR_RE.test(line) ? 'distractor' : 'movable'
  })
}

/**
 * Give lines `from`..`to` (1-based, inclusive) a role, and write the file back
 * with its markers rebuilt: one `# start` / `# end` pair around each run of
 * lines that are not fixed, `#distractor` on exactly the distractors. A file
 * whose every line is movable needs no markers at all.
 */
export function setParsonsRole(source: string, from: number, to: number, role: ParsonsSettableRole): string {
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const roles = parsonsLineRoles(source)
  const lo = Math.max(1, Math.min(from, to))
  const hi = Math.min(lines.length, Math.max(from, to))
  for (let n = lo; n <= hi; n++) {
    const r = roles[n - 1]
    if (r === 'fixed' || r === 'movable' || r === 'distractor') roles[n - 1] = role
  }
  return rebuildParsonsSource(lines, roles).join(eol)
}

function rebuildParsonsSource(lines: string[], roles: ParsonsRole[]): string[] {
  const content: Array<{ text: string; role: ParsonsRole }> = []
  lines.forEach((line, i) => {
    if (roles[i] === 'marker') return
    const bare = line.replace(DISTRACTOR_RE, '')
    const text = roles[i] === 'distractor' ? `${bare.replace(/\s+$/, '')} #distractor` : roles[i] === 'blank' ? line : bare
    content.push({ text, role: roles[i] })
  })
  const placeable = content.filter(c => c.role === 'movable' || c.role === 'distractor').length
  const fixed = content.filter(c => c.role === 'fixed').length
  if (fixed === 0 && placeable > 0) return content.map(c => c.text)

  const out: string[] = []
  let open: string | null = null   // the open block's marker indentation
  let pendingBlanks: string[] = []
  for (const c of content) {
    if (c.role === 'blank') { pendingBlanks.push(c.text); continue }
    const movable = c.role !== 'fixed'
    if (movable && open === null) {
      out.push(...pendingBlanks)
      open = leadingOf(c.text)
      out.push(`${open}# start`)
    } else if (!movable && open !== null) {
      out.push(`${open}# end`)
      open = null
      out.push(...pendingBlanks)
    } else {
      out.push(...pendingBlanks)
    }
    pendingBlanks = []
    out.push(c.text)
  }
  if (open !== null) out.push(`${open}# end`)
  // An answer with nothing to place still needs a block, or it would read as
  // all-movable: an empty one at the end says "nothing moves".
  if (placeable === 0) out.push('# start', '# end')
  out.push(...pendingBlanks)
  return out
}

export interface ParsonsSummary {
  blocks: number
  toPlace: number
  distractors: number
  warnings: string[]
}

/** Counts for the authoring bar, and anything that will make a poor puzzle. */
export function parsonsSummary(problem: ParsonsProblem): ParsonsSummary {
  const warnings: string[] = []
  const toPlace = problem.blocks.reduce((n, b) => n + b.solution.length, 0)
  const distractors = problem.blocks.reduce((n, b) => n + b.pool.length - b.solution.length, 0)
  if (toPlace === 0) warnings.push('No lines to place: mark some lines Movable.')
  problem.blocks.forEach((b, i) => {
    const name = problem.blocks.length > 1 ? `Block ${i + 1}` : 'The block'
    if (b.solution.length === 0 && b.pool.length > 0) warnings.push(`${name} holds only distractors.`)
    else if (b.solution.length === 1 && b.pool.length === 1) warnings.push(`${name} has a single line, so there is nothing to order.`)
    if (problem.indentMode === 'student' && b.solution[0] && b.solution[0].indent > 0) {
      warnings.push(`${name} starts deeper than its other lines; a student cannot indent its first line.`)
    }
    const answers = new Set(b.solution.map(l => `${problem.indentMode === 'given' ? l.indent : 0}\u0000${l.code}`))
    for (const d of b.pool.filter(l => l.distractor)) {
      if (answers.has(`${problem.indentMode === 'given' ? d.indent : 0}\u0000${d.code}`)) {
        warnings.push(`The distractor "${d.code.split('\n')[0]}" is the same as a line of the answer.`)
      }
    }
  })
  return { blocks: problem.blocks.length, toPlace, distractors, warnings }
}
