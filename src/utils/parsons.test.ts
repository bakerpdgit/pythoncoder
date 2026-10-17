import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  arrangementMatchesProblem, assembleCode, gradeParsons, indentLevels, maxIndentAt,
  migrateArrangement, parseParsonsSource, parsonsLineRoles, parsonsRows, parsonsSummary,
  setParsonsRole, shuffledArrangement,
} from './parsons'
import type { ParsonsArrangement, ParsonsProblem } from './parsons'

const pythonAvailable = spawnSync('python', ['--version']).status === 0

const SONG = [
  'print("Old MacDonald had a farm")',
  'print("E-I-E-I-O")',
  'print("And on that farm he had a cow")',
  'print("E-I-E-I-O")',
  'print("Old MacDuckie had a shop") #distractor',
].join('\n')

const TURTLE = [
  '# library imports',
  'import turtle',
  '',
  'myTurtle = turtle.Turtle()',
  '',
  '# start',
  'for count in range(4):',
  '  myTurtle.forward(100)',
  '  myTurtle.left(90)',
  '# end',
  '',
  'turtle.done()',
  '',
].join('\n')

const TWO_BLOCKS = [
  'def area(w, h):',
  '    # start',
  '    a = w * h',
  '    return a',
  '    # end',
  '',
  'def main():',
  '    # start',
  '    w = int(input())',
  '    h = int(input())',
  '    print(area(w, h))',
  '    print(w + h) #distractor',
  '    # end',
  '',
  'main()',
].join('\n')

/** The arrangement that solves a problem: every block in answer order. */
function solved(problem: ParsonsProblem, indents = true): ParsonsArrangement {
  const blocks: ParsonsArrangement['blocks'] = {}
  for (const b of problem.blocks) {
    const distractors = b.pool.filter(l => l.distractor).map(l => l.id)
    blocks[b.id] = {
      order: [...b.solution.map(l => l.id), ...distractors],
      removed: distractors,
      indents: indents ? Object.fromEntries(b.solution.map(l => [l.id, l.indent])) : {},
    }
  }
  return { v: 2, blocks }
}

describe('parseParsonsSource', () => {
  it('reads a file with no markers as one block', () => {
    const p = parseParsonsSource(SONG)
    expect(p.blocks).toHaveLength(1)
    expect(p.segments).toHaveLength(1)
    expect(p.blocks[0].solution.map(l => l.code)).toEqual([
      'print("Old MacDonald had a farm")', 'print("E-I-E-I-O")',
      'print("And on that farm he had a cow")', 'print("E-I-E-I-O")',
    ])
    expect(p.blocks[0].pool.filter(l => l.distractor).map(l => l.code)).toEqual(['print("Old MacDuckie had a shop")'])
    expect(p.blocks[0].pool.map(l => l.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4'])
    expect(p.canIndent).toBe(false)
    expect(p.indentMode).toBe('given')
  })

  it('fences a block with # start / # end, the rest fixed', () => {
    const p = parseParsonsSource(TURTLE)
    expect(p.segments.map(s => s.kind)).toEqual(['fixed', 'block', 'fixed'])
    expect(p.blocks[0].solution.map(l => [l.code, l.indent])).toEqual([
      ['for count in range(4):', 0], ['myTurtle.forward(100)', 1], ['myTurtle.left(90)', 1],
    ])
    expect(p.canIndent).toBe(true)
    expect(p.indentMode).toBe('student')
    expect(parseParsonsSource(TURTLE, { indent: 'given' }).indentMode).toBe('given')
    // The answer is indented with two spaces, and that is what a level is.
    expect(p.indentUnit).toBe('  ')
  })

  it('takes several blocks, and levels inside a def count from the block', () => {
    const p = parseParsonsSource(TWO_BLOCKS)
    expect(p.blocks.map(b => b.id)).toEqual(['b0', 'b1'])
    expect(p.blocks[0].basePrefix).toBe('    ')
    expect(p.blocks[0].solution.map(l => l.indent)).toEqual([0, 0])
    expect(p.blocks[1].pool.map(l => l.id)).toEqual(['p2', 'p3', 'p4', 'p5'])
    expect(p.canIndent).toBe(false)
  })

  it('runs an unterminated # start to the end of the file', () => {
    const p = parseParsonsSource('import x\n# start\na = 1\nb = 2\n')
    expect(p.segments.map(s => s.kind)).toEqual(['fixed', 'block'])
    expect(p.blocks[0].solution.map(l => l.code)).toEqual(['a = 1', 'b = 2'])
  })

  it('does not take "# starting" for a marker', () => {
    const p = parseParsonsSource('# starting values\nx = 1\ny = 2\n')
    expect(p.segments.map(s => s.kind)).toEqual(['block'])
    expect(p.blocks[0].solution.map(l => l.code)).toEqual(['# starting values', 'x = 1', 'y = 2'])
  })

  it('keeps a distractor\'s indentation', () => {
    const p = parseParsonsSource('for i in range(3):\n    print(i)\n    print(i + 1) #distractor\n')
    const d = p.blocks[0].pool.find(l => l.distractor)!
    expect(d.prefix).toBe('    ')
    expect(d.indent).toBe(1)
  })

  it('makes one fragment of a line holding \\n', () => {
    const p = parseParsonsSource('if x:\\n    print(1)\nprint(2)\n')
    expect(p.blocks[0].solution[0].code).toBe('if x:\n    print(1)')
  })
})

describe('indentLevels', () => {
  it('counts nesting, not width', () => {
    expect(indentLevels([0, 4, 8, 4, 0])).toEqual([0, 1, 2, 1, 0])
    expect(indentLevels([0, 2, 2, 0])).toEqual([0, 1, 1, 0])
    expect(indentLevels([0, 3, 7, 3])).toEqual([0, 1, 2, 1])
  })
})

describe('arrangements', () => {
  it('shuffles every block and never starts solved', () => {
    const p = parseParsonsSource('a = 1\nb = 2\n')
    for (let i = 0; i < 50; i++) {
      const a = shuffledArrangement(p)
      expect(arrangementMatchesProblem(p, a)).toBe(true)
      expect(gradeParsons(p, a).success).toBe(false)
    }
  })

  it('discards an arrangement for a different problem', () => {
    const a = shuffledArrangement(parseParsonsSource(SONG))
    expect(arrangementMatchesProblem(parseParsonsSource(TURTLE), a)).toBe(false)
    expect(arrangementMatchesProblem(parseParsonsSource(SONG), { source: [], solution: [] })).toBe(false)
  })

  it('migrates the two-panel shape: what was left in the bank is struck out', () => {
    const p = parseParsonsSource(TURTLE)
    const migrated = migrateArrangement(p, {
      source: ['p2'],
      solution: [{ id: 'p0', indent: 0 }, { id: 'p1', indent: 1 }],
    })
    expect(migrated).toEqual({ v: 2, blocks: { b0: { order: ['p0', 'p1', 'p2'], removed: ['p2'], indents: { p1: 1 } } } })
    expect(migrateArrangement(p, { source: ['p9'], solution: [] })).toBeNull()
    const v2 = shuffledArrangement(p)
    expect(migrateArrangement(p, v2)).toBe(v2)
  })
})

describe('assembleCode', () => {
  it('writes the answer back exactly when solved with given indentation', () => {
    const p = parseParsonsSource(TURTLE, { indent: 'given' })
    const { code } = assembleCode(p, solved(p))
    expect(code).toBe('# library imports\nimport turtle\n\nmyTurtle = turtle.Turtle()\n\nfor count in range(4):\n  myTurtle.forward(100)\n  myTurtle.left(90)\n\nturtle.done()\n')
  })

  it('indents a student\'s levels in the answer\'s own unit, under the block\'s base', () => {
    const p = parseParsonsSource('def f():\n    # start\n    for i in range(2):\n        print(i)\n    # end\nf()\n')
    expect(p.indentMode).toBe('student')
    const a = solved(p)
    expect(assembleCode(p, a).code).toBe('def f():\n    for i in range(2):\n        print(i)\nf()\n')
    a.blocks.b0.indents = {}
    expect(assembleCode(p, a).code).toBe('def f():\n    for i in range(2):\n    print(i)\nf()\n')
  })

  it('leaves struck-out lines out, and maps program lines to rows', () => {
    const p = parseParsonsSource(SONG)
    const a: ParsonsArrangement = { v: 2, blocks: { b0: { order: ['p4', 'p0', 'p1'], removed: ['p4'], indents: {} } } }
    // An arrangement may name fewer fragments than the pool only in tests; rows follow `order`.
    const { code, rowAt } = assembleCode(p, a)
    expect(code).toBe('print("Old MacDonald had a farm")\nprint("E-I-E-I-O")\n')
    expect(rowAt).toEqual({ 1: 'p0', 2: 'p1' })
    const rows = parsonsRows(p, a)
    expect(rows.map(r => r.kind === 'fragment' ? [r.key, r.removed, r.lineNumber] : null)).toEqual([
      ['p4', true, null], ['p0', false, 1], ['p1', false, 2],
    ])
  })

  it('numbers a multi-line fragment as all its lines', () => {
    const p = parseParsonsSource('if True:\\n    print(1)\nprint(2)\n', { indent: 'given' })
    const { code, rowAt } = assembleCode(p, solved(p))
    expect(code).toBe('if True:\n    print(1)\nprint(2)\n')
    expect(rowAt).toEqual({ 1: 'p0', 2: 'p0', 3: 'p1' })
  })

  it.skipIf(!pythonAvailable)('makes a program Python compiles, for a block nested in a def', () => {
    const p = parseParsonsSource(TWO_BLOCKS)
    const { code } = assembleCode(p, solved(p))
    const script = `compile(${JSON.stringify(code)}, "simulation.py", "exec"); print("ok")`
    const result = spawnSync('python', ['-c', script], { encoding: 'utf8' })
    expect(result.stderr).toBe('')
    expect(result.stdout.trim()).toBe('ok')
  })
})

describe('gradeParsons', () => {
  it('passes the answer with its distractor struck out', () => {
    const p = parseParsonsSource(SONG)
    expect(gradeParsons(p, solved(p))).toMatchObject({ success: true, messages: [] })
  })

  it('fails a kept distractor, flagging it', () => {
    const p = parseParsonsSource(SONG)
    const a = solved(p)
    a.blocks.b0.removed = []
    const f = gradeParsons(p, a)
    expect(f.success).toBe(false)
    expect(f.flags.p4).toBe('incorrectPosition')
    expect(f.messages).toContain('Your program has too many code fragments.')
  })

  it('counts a struck-out answer line as missing', () => {
    const p = parseParsonsSource(SONG)
    const a = solved(p)
    a.blocks.b0.removed = ['p4', 'p2']
    expect(gradeParsons(p, a).messages).toEqual(['Your program has too few code fragments.'])
  })

  it('names the block when there is more than one', () => {
    const p = parseParsonsSource(TWO_BLOCKS)
    const a = solved(p)
    a.blocks.b1.order = ['p3', 'p2', 'p4', 'p5']
    const f = gradeParsons(p, a)
    expect(f.success).toBe(false)
    expect(f.messages[0]).toMatch(/^Block 2: Code fragments/)
    expect(f.flags.p0).toBe('correct')
  })

  it('checks indentation the student sets, forgiving over-indenting', () => {
    const p = parseParsonsSource(TURTLE)
    const a = solved(p)
    a.blocks.b0.indents = { p0: 0, p1: 3, p2: 3 }
    expect(gradeParsons(p, a).success).toBe(true)
    a.blocks.b0.indents = { p0: 0, p1: 1, p2: 0 }
    const f = gradeParsons(p, a)
    expect(f.messages).toEqual(['The highlighted fragment 3 belongs to a wrong block (i.e. indentation).'])
    expect(f.flags.p2).toBe('incorrectIndent')
  })

  it('tells identical lines at different given depths apart by order alone', () => {
    const p = parseParsonsSource('for i in range(2):\n    print(i)\nprint(i)\n', { indent: 'given' })
    const a = solved(p)
    a.blocks.b0.order = ['p0', 'p2', 'p1']
    const f = gradeParsons(p, a)
    expect(f.success).toBe(false)
    expect(f.messages.join(' ')).not.toMatch(/indentation/)
  })
})

describe('maxIndentAt', () => {
  it('allows one level deeper than the kept line above', () => {
    const b = { order: ['a', 'x', 'b'], removed: ['x'], indents: { a: 1 } }
    expect(maxIndentAt(b, 'a')).toBe(0)
    expect(maxIndentAt(b, 'b')).toBe(2)
  })
})

describe('authoring', () => {
  it('gives every line a role', () => {
    expect(parsonsLineRoles(TURTLE)).toEqual([
      'fixed', 'fixed', 'blank', 'fixed', 'blank', 'marker',
      'movable', 'movable', 'movable', 'marker', 'blank', 'fixed', 'blank',
    ])
    expect(parsonsLineRoles(SONG)).toEqual(['movable', 'movable', 'movable', 'movable', 'distractor'])
  })

  it('leaves a Sponge file meaning the same after a no-op rewrite', () => {
    for (const source of [SONG, TURTLE, TWO_BLOCKS]) {
      const rewritten = setParsonsRole(source, 1, 1, parsonsLineRoles(source)[0] === 'fixed' ? 'fixed' : 'movable')
      const before = parseParsonsSource(source, { indent: 'given' })
      const after = parseParsonsSource(rewritten, { indent: 'given' })
      expect(assembleCode(after, solved(after)).code).toBe(assembleCode(before, solved(before)).code)
      expect(after.blocks.map(b => b.pool.map(l => [l.code, l.distractor]))).toEqual(
        before.blocks.map(b => b.pool.map(l => [l.code, l.distractor])))
    }
  })

  it('writes markers around each run of movable lines', () => {
    const src = 'import a\nx = 1\ny = 2\nprint(x)\n'
    // A file with no markers is all movable, so fix it all first.
    const once = setParsonsRole(setParsonsRole(src, 1, 4, 'fixed'), 2, 3, 'movable')
    expect(once).toBe('import a\n# start\nx = 1\ny = 2\n# end\nprint(x)\n')
    const distract = setParsonsRole(once, 4, 4, 'distractor')
    expect(distract).toBe('import a\n# start\nx = 1\ny = 2 #distractor\n# end\nprint(x)\n')
    expect(setParsonsRole(distract, 4, 4, 'fixed')).toBe('import a\n# start\nx = 1\n# end\ny = 2\nprint(x)\n')
  })

  it('drops the markers when everything is movable, and keeps a block when nothing is', () => {
    expect(setParsonsRole(TURTLE.trimEnd(), 1, 12, 'movable')).not.toMatch(/# start/)
    const allFixed = setParsonsRole(SONG, 1, 5, 'fixed')
    expect(parseParsonsSource(allFixed).blocks[0].pool).toHaveLength(0)
    expect(parsonsSummary(parseParsonsSource(allFixed)).warnings[0]).toMatch(/No lines to place/)
  })

  it('indents markers to the block they fence', () => {
    const src = 'def f():\n    a = 1\n    b = 2\n'
    expect(setParsonsRole(setParsonsRole(src, 1, 1, 'fixed'), 2, 3, 'movable'))
      .toBe('def f():\n    # start\n    a = 1\n    b = 2\n    # end\n')
  })

  it('summarises and warns', () => {
    expect(parsonsSummary(parseParsonsSource(TWO_BLOCKS))).toEqual({ blocks: 2, toPlace: 5, distractors: 1, warnings: [] })
    const dup = parsonsSummary(parseParsonsSource('a = 1\nb = 2\nb = 2 #distractor\n'))
    expect(dup.warnings[0]).toMatch(/same as a line of the answer/)
  })
})
