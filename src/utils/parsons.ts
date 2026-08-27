/**
 * Parsons problems (drag-and-drop code reordering exercises).
 *
 * A native TypeScript port of the parts of js-parsons the old Python Sponge
 * used (line parsing, distractors, indent normalisation, the line-based
 * grader). No jQuery, no DOM: everything here is pure and testable.
 *
 * The authoring contract is unchanged from Python Sponge, so existing books
 * keep working:
 *   - a challenge declares `"typ": "parsons"`, and has no `tests`
 *   - a line ending `#distractor` is a wrong fragment (the marker is stripped)
 *   - an optional single `# start` … `# end` region fences the draggable body;
 *     everything outside it is fixed header/footer code
 *   - `\n` inside a source line makes one fragment span several lines
 *   - blank lines are dropped
 */

export interface ParsonsLine {
  /** Stable id, derived from the fragment's position in the pool. */
  id: string
  /** Displayed code, `#distractor` stripped and trimmed. */
  code: string
  /** Indent level (not raw spaces). Model lines only; pool lines start at 0. */
  indent: number
  distractor: boolean
}

export interface ParsonsProblem {
  /** Fixed code before `# start`, or null when the whole file is draggable. */
  header: string | null
  /** Fixed code after `# end`, or null. */
  footer: string | null
  /** The model solution, in order, with indents normalised to levels. */
  solution: ParsonsLine[]
  /** Every draggable fragment: solution lines then distractors. */
  pool: ParsonsLine[]
  /** False when no model line is indented — then indenting is pointless. */
  canIndent: boolean
}

/** Where each fragment currently sits. Persisted per student. */
export interface ParsonsArrangement {
  /** Fragment ids still in the "Drag from here" list, in order. */
  source: string[]
  /** Fragments placed in the solution, in order, with their indent level. */
  solution: Array<{ id: string; indent: number }>
}

export type ParsonsFlag = 'correct' | 'incorrectPosition' | 'incorrectIndent'

export interface ParsonsFeedback {
  success: boolean
  messages: string[]
  /** Fragment id → how to highlight it. */
  flags: Record<string, ParsonsFlag>
}

const DISTRACTOR_RE = /#distractor\s*$/
const START_RE = /^\s*#\s*start/i
const END_RE = /^\s*#\s*end/i

/** Feedback wording, kept verbatim from js-parsons so it reads as teachers expect. */
export const PARSONS_MESSAGES = {
  order: () =>
    'Code fragments in your program are wrong, or in wrong order. This can be fixed by moving, removing, or replacing highlighted fragments.',
  linesMissing: () => 'Your program has too few code fragments.',
  linesTooMany: () => 'Your program has too many code fragments.',
  blockStructure: (n: number) =>
    `The highlighted fragment ${n} belongs to a wrong block (i.e. indentation).`,
}

/**
 * Turn raw leading-whitespace counts into integer nesting levels, so that a
 * file indented with 2 spaces and one indented with 4 grade identically.
 * Returns -1 for an indent that matches no enclosing level (an IndentationError).
 */
export function normalizeIndents(indents: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < indents.length; i++) {
    if (i === 0) {
      out.push(indents[i] === 0 ? 0 : -1)
    } else if (indents[i] === indents[i - 1]) {
      out.push(out[i - 1])
    } else if (indents[i] > indents[i - 1]) {
      out.push(out[i - 1] + 1)
    } else {
      // Look back for a line at the same raw indent and reuse its level.
      let matched = -1
      for (let j = i - 1; j >= 0; j--) {
        if (indents[j] === indents[i]) { matched = out[j]; break }
      }
      out.push(matched)
    }
  }
  return out
}

interface RawFragment { code: string; rawIndent: number; distractor: boolean }

function parseFragment(line: string): RawFragment | null {
  const distractor = DISTRACTOR_RE.test(line)
  const code = line
    .replace(DISTRACTOR_RE, '')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\\n/g, '\n')
  if (code.length === 0) return null
  const rawIndent = line.length - line.replace(/^\s+/, '').length
  return { code, rawIndent, distractor }
}

/** Parse a challenge's source file into a Parsons problem. */
export function parseParsonsSource(source: string): ParsonsProblem {
  const lines = source.split('\n')

  let header: string | null = null
  let footer: string | null = null
  const body: string[] = []

  const startIdx = lines.findIndex(l => START_RE.test(l))
  if (startIdx === -1) {
    body.push(...lines)
  } else {
    header = lines.slice(0, startIdx).join('\n')
    const rest = lines.slice(startIdx + 1)
    const endOffset = rest.findIndex(l => END_RE.test(l))
    if (endOffset === -1) {
      body.push(...rest)
      footer = ''
    } else {
      body.push(...rest.slice(0, endOffset))
      footer = rest.slice(endOffset + 1).join('\n')
    }
  }

  const solutionRaw: RawFragment[] = []
  const distractorRaw: RawFragment[] = []
  for (const line of body) {
    const frag = parseFragment(line)
    if (!frag) continue
    if (frag.distractor) distractorRaw.push(frag)
    else solutionRaw.push(frag)
  }

  const levels = normalizeIndents(solutionRaw.map(f => f.rawIndent))
  const solution: ParsonsLine[] = solutionRaw.map((f, i) => ({
    id: `p${i}`,
    code: f.code,
    indent: Math.max(levels[i], 0),
    distractor: false,
  }))
  const distractors: ParsonsLine[] = distractorRaw.map((f, i) => ({
    id: `p${solutionRaw.length + i}`,
    code: f.code,
    indent: 0,
    distractor: true,
  }))

  return {
    header,
    footer,
    solution,
    pool: [...solution.map(l => ({ ...l, indent: 0 })), ...distractors],
    canIndent: solution.some(l => l.indent > 0),
  }
}

/** Fisher-Yates. Returns the shuffled fragment ids. */
export function shuffleIds(pool: ParsonsLine[]): string[] {
  const ids = pool.map(l => l.id)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = ids[i]
    ids[i] = ids[j]
    ids[j] = tmp
  }
  return ids
}

/** Every fragment in the source list, shuffled — the starting position. */
export function shuffledArrangement(problem: ParsonsProblem): ParsonsArrangement {
  return { source: shuffleIds(problem.pool), solution: [] }
}

/**
 * True when a saved arrangement still describes this exact problem. An author
 * editing the file changes the pool, and a stale arrangement must be discarded
 * rather than silently dropping or inventing fragments.
 */
export function arrangementMatchesProblem(
  problem: ParsonsProblem,
  arrangement: ParsonsArrangement | null,
): arrangement is ParsonsArrangement {
  if (!arrangement || !Array.isArray(arrangement.source) || !Array.isArray(arrangement.solution)) return false
  const seen = [...arrangement.source, ...arrangement.solution.map(s => s.id)]
  if (seen.length !== problem.pool.length) return false
  const poolIds = new Set(problem.pool.map(l => l.id))
  if (new Set(seen).size !== seen.length) return false
  for (const id of seen) if (!poolIds.has(id)) return false
  return true
}

/** The student's placed fragments, in order, resolved against the pool. */
export function solutionLines(problem: ParsonsProblem, arrangement: ParsonsArrangement): ParsonsLine[] {
  const byId = new Map(problem.pool.map(l => [l.id, l]))
  const out: ParsonsLine[] = []
  for (const { id, indent } of arrangement.solution) {
    const line = byId.get(id)
    if (line) out.push({ ...line, indent })
  }
  return out
}

/** Splice the student's arrangement back into the fixed header/footer. */
export function assembleCode(problem: ParsonsProblem, student: ParsonsLine[]): string {
  const body = student
    .map(l => '  '.repeat(Math.max(l.indent, 0)) + l.code)
    .join('\n')
  if (problem.header === null) return body ? body + '\n' : ''
  const parts: string[] = []
  if (problem.header) parts.push(problem.header)
  if (body) parts.push(body)
  if (problem.footer) parts.push(problem.footer)
  if (parts.length === 0) return ''
  return parts.join('\n').replace(/\n*$/, '\n')
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

/**
 * The line-based grader: order first (via LIS), then fragment count, and only
 * when the order is perfect, indentation — reporting the first indent error
 * only, as js-parsons did.
 */
export function gradeParsons(model: ParsonsLine[], student: ParsonsLine[]): ParsonsFeedback {
  const messages: string[] = []
  const flags: Record<string, ParsonsFlag> = {}

  // Student indents are re-normalised so an over-indented but structurally
  // correct arrangement still grades as correct (js-parsons behaviour).
  const levels = normalizeIndents(student.map(l => l.indent))
  const studentLines = student.map((l, i) => ({ ...l, indent: levels[i] }))

  // Map each student fragment onto a model position; a fragment that appears
  // nowhere in the model is a distractor.
  const lastFound: Record<string, number> = {}
  const positions: Array<{ id: string; position: number; ignore: boolean }> = []
  let wrongOrder = false

  for (const line of studentLines) {
    const from = lastFound[line.code] !== undefined ? lastFound[line.code] + 1 : 0
    let found = -1
    for (let i = from; i < model.length; i++) {
      if (model[i].code === line.code) { found = i; break }
    }
    if (found !== -1) {
      lastFound[line.code] = found
      positions.push({ id: line.id, position: found, ignore: false })
    } else if (lastFound[line.code] !== undefined) {
      // A duplicate of a solution line: the LIS pass sorts out which copy stays.
      positions.push({ id: line.id, position: lastFound[line.code], ignore: false })
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

  if (model.length < studentLines.length) messages.push(PARSONS_MESSAGES.linesTooMany())
  else if (model.length > studentLines.length) messages.push(PARSONS_MESSAGES.linesMissing())

  if (messages.length === 0) {
    const toCheck = Math.min(studentLines.length, model.length)
    for (let i = 0; i < toCheck; i++) {
      const line = studentLines[i]
      if (line.indent !== model[i].indent && messages.length === 0) {
        flags[line.id] = 'incorrectIndent'
        messages.push(PARSONS_MESSAGES.blockStructure(i + 1))
      } else if (line.code === model[i].code && line.indent === model[i].indent && messages.length === 0) {
        flags[line.id] = 'correct'
      }
    }
  }

  return { success: messages.length === 0, messages, flags }
}
