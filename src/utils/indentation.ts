/**
 * The editor's indentation: worked out from each file as it is opened, and
 * re-applied to the whole file when the student picks a different one.
 *
 * Learning books arrive indented with two spaces as often as four, and the
 * editor used to insist on four whatever the file held, so Enter after a colon
 * in a two-space file indented further than every line around it.
 *
 * Both halves read the file as Python rather than as text. Only lines that
 * *start a statement* decide the indentation, exactly as Python's own
 * tokenizer sees it: a line inside brackets, after a backslash or inside a
 * multi-line string is not an indent, and a menu drawn in a triple-quoted
 * string must neither sway the guess nor be re-indented (that would change
 * what the program prints). A docstring is the one string that is re-indented,
 * because its indentation follows the code's and `inspect.cleandoc` strips it.
 */

/** A number of spaces, or one tab per level. */
export type IndentUnit = number | 'tab'

/** What a file with nothing indented in it gets. */
export const DEFAULT_INDENT: IndentUnit = 4

/** The choices offered in the settings menu. */
export const INDENT_CHOICES: IndentUnit[] = [2, 4, 8, 'tab']

export const describeIndent = (unit: IndentUnit): string =>
  unit === 'tab' ? 'Tabs' : `${unit} space${unit === 1 ? '' : 's'}`

type LineKind =
  | 'code'          // starts a logical line
  | 'continuation'  // inside brackets or after a backslash
  | 'comment'       // nothing but a comment
  | 'blank'
  | 'string'        // starts inside a string that began on an earlier line

interface StringSpan {
  /** The line the string opens on. */
  startLine: number
  /** True when the string is the first thing on a statement's line... */
  opensStatement: boolean
  /** ...and nothing but a comment follows where it closes: a docstring. */
  endsStatement: boolean
}

interface LineInfo {
  kind: LineKind
  /** The leading whitespace, as written. */
  leading: string
  /** Its width in columns, with tabs to the next multiple of 8 as Python counts them. */
  width: number
  /** For a 'continuation' line, the line its statement starts on. */
  owner: number
  /** For a 'string' line, the string it is inside. */
  span?: StringSpan
  /** A 'continuation' line lined up under the first thing after an open bracket. */
  aligned: boolean
}

const LEADING_WS = /^[ \t\f]*/

const columnWidth = (ws: string): number => {
  let col = 0
  for (const ch of ws) {
    if (ch === ' ') col += 1
    else if (ch === '\t') col = (Math.floor(col / 8) + 1) * 8
    else if (ch === '\f') col = 0
  }
  return col
}

const PREFIX_CHARS = /[rRbBuUfF]/

/** Classifies every line of a Python source, tracking strings and brackets across lines. */
const scanLines = (text: string): LineInfo[] => {
  const lines = text.split('\n')
  const infos: LineInfo[] = []
  // Each open bracket: the column its contents start at on the bracket's own
  // line, or null when the bracket ends its line (a hanging indent follows).
  const brackets: Array<number | null> = []
  let backslash = false
  let owner = 0
  // An open string carried from one line to the next.
  let open: { quote: string; span: StringSpan } | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].endsWith('\r') ? lines[i].slice(0, -1) : lines[i]
    const leading = LEADING_WS.exec(line)![0]
    const width = columnWidth(leading)
    const rest = line.slice(leading.length)

    let kind: LineKind
    if (open) kind = 'string'
    else if (brackets.length > 0 || backslash) kind = 'continuation'
    else if (rest === '') kind = 'blank'
    else if (rest.startsWith('#')) kind = 'comment'
    else { kind = 'code'; owner = i }
    const aligned = kind === 'continuation' && rest !== '' && brackets.includes(width)
    infos.push({ kind, leading, width, owner, span: open?.span, aligned })

    backslash = false
    let j = kind === 'string' ? 0 : leading.length
    while (j < line.length) {
      if (open) {
        const close = findClose(line, j, open.quote)
        if (close < 0) { j = line.length; break }
        j = close + open.quote.length
        if (open.quote.length === 3) {
          open.span.endsStatement = /^\s*(#.*)?$/.test(line.slice(j))
        }
        open = null
        continue
      }
      const ch = line[j]
      if (ch === '#') break
      if (ch === '(' || ch === '[' || ch === '{') {
        const next = line.slice(j + 1).search(/\S/)
        const contents = next < 0 || line[j + 1 + next] === '#' ? null : j + 1 + next
        brackets.push(contents === null ? null : columnWidth(line.slice(0, contents).replace(/\S/g, ' ')))
      } else if (ch === ')' || ch === ']' || ch === '}') brackets.pop()
      else if (ch === '"' || ch === "'") {
        // Step back over a prefix (r, b, f, rb...) so `r"""` still opens a statement.
        let p = j
        while (p > 0 && PREFIX_CHARS.test(line[p - 1]) && j - p < 2) p--
        const quote = line.startsWith(ch.repeat(3), j) ? ch.repeat(3) : ch
        open = {
          quote,
          span: {
            startLine: i,
            opensStatement: kind === 'code' && p === leading.length,
            endsStatement: false,
          },
        }
        j += quote.length
        continue
      }
      j++
    }
    if (open) {
      // A one-quote string only runs on past the line's end after a backslash.
      if (open.quote.length === 1 && !line.endsWith('\\')) open = null
    } else if (line.endsWith('\\')) {
      backslash = true
    }
  }
  return infos
}

/** Where `quote` next closes the string at or after `from`, or -1. */
const findClose = (line: string, from: number, quote: string): number => {
  for (let j = from; j < line.length; j++) {
    // Skips an escaped character. Even a raw string cannot end on an escaped quote.
    if (line[j] === '\\') { j++; continue }
    if (line.startsWith(quote, j)) return j
  }
  return -1
}

/**
 * The indentation a file uses, or null when nothing in it is indented. The
 * most common step between one block and the block inside it wins; a tie
 * goes to 4 if it is among them, otherwise to the smaller step.
 */
export const detectIndentUnit = (text: string): IndentUnit | null => {
  const stack = [0]
  const steps = new Map<number, number>()
  let tabLines = 0
  let spaceLines = 0
  for (const info of scanLines(text)) {
    if (info.kind !== 'code') continue
    if (info.leading.startsWith('\t')) tabLines++
    else if (info.leading.startsWith(' ')) spaceLines++
    const w = info.width
    while (stack.length > 1 && stack[stack.length - 1] > w) stack.pop()
    const top = stack[stack.length - 1]
    if (w > top) {
      const step = w - top
      if (step <= 8) steps.set(step, (steps.get(step) ?? 0) + 1)
      stack.push(w)
    }
  }
  if (tabLines > spaceLines) return 'tab'
  if (steps.size === 0) return null
  const best = Math.max(...steps.values())
  const tied = [...steps.keys()].filter(step => steps.get(step) === best)
  return tied.includes(4) ? 4 : Math.min(...tied)
}

export interface ReindentEdit {
  /** 1-based line number. */
  line: number
  /** Length of the leading whitespace being replaced. */
  oldLength: number
  newText: string
}

const unitColumns = (unit: IndentUnit): number => (unit === 'tab' ? 8 : unit)
const unitText = (unit: IndentUnit): string => (unit === 'tab' ? '\t' : ' '.repeat(unit))

/**
 * The leading-whitespace changes that move a file from one indentation to
 * another. Statement lines are re-indented by their block depth, which is
 * worked out as Python does and so is right whatever the old unit was.
 * A line lined up under what follows an open bracket moves with its statement,
 * keeping its offset, so it stays lined up. Any other line hanging off a
 * statement is a hanging indent: a whole number of old units becomes the same
 * number of new ones, and an odd offset is kept as it is.
 */
export const reindentEdits = (text: string, from: IndentUnit, to: IndentUnit): ReindentEdit[] => {
  const infos = scanLines(text)
  const fromCols = unitColumns(from)
  const toText = unitText(to)
  // Each open block: its old width and the new indentation that replaces it.
  const stack: Array<{ width: number; text: string }> = [{ width: 0, text: '' }]
  const newLeading: string[] = new Array(infos.length)

  const offset = (extra: number): string =>
    extra % fromCols === 0 ? toText.repeat(extra / fromCols) : ' '.repeat(extra)

  /** Indentation for a line hanging `width` columns in, under a line that was `base` wide. */
  const hang = (width: number, base: { width: number; text: string }, leading: string): string =>
    width < base.width ? leading : base.text + offset(width - base.width)

  infos.forEach((info, i) => {
    switch (info.kind) {
      case 'code': {
        while (stack.length > 1 && stack[stack.length - 1].width > info.width) stack.pop()
        const top = stack[stack.length - 1]
        if (info.width > top.width) stack.push({ width: info.width, text: top.text + toText })
        newLeading[i] = stack[stack.length - 1].text
        break
      }
      case 'continuation': {
        const base = { width: infos[info.owner].width, text: newLeading[info.owner] }
        newLeading[i] = info.aligned && info.width >= base.width
          ? base.text + ' '.repeat(info.width - base.width)
          : hang(info.width, base, info.leading)
        break
      }
      case 'string': {
        const span = info.span!
        if (span.opensStatement && span.endsStatement) {
          const start = span.startLine
          newLeading[i] = hang(info.width, { width: infos[start].width, text: newLeading[start] }, info.leading)
        } else {
          newLeading[i] = info.leading
        }
        break
      }
      default: {
        // A comment, or a blank line holding only whitespace: placed against
        // the deepest open block it sits within.
        if (info.leading === '') { newLeading[i] = ''; break }
        const within = [...stack].reverse().find(entry => entry.width <= info.width) ?? stack[0]
        newLeading[i] = hang(info.width, within, info.leading)
      }
    }
  })

  const edits: ReindentEdit[] = []
  infos.forEach((info, i) => {
    if (newLeading[i] !== info.leading) {
      edits.push({ line: i + 1, oldLength: info.leading.length, newText: newLeading[i] })
    }
  })
  return edits
}

/** `reindentEdits` applied to the text itself. */
export const reindentPython = (text: string, from: IndentUnit, to: IndentUnit): string => {
  const lines = text.split('\n')
  for (const edit of reindentEdits(text, from, to)) {
    lines[edit.line - 1] = edit.newText + lines[edit.line - 1].slice(edit.oldLength)
  }
  return lines.join('\n')
}
