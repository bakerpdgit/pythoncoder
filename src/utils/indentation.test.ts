import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { detectIndentUnit, reindentEdits, reindentPython } from './indentation'

const lines = (...rows: string[]) => rows.join('\n') + '\n'

describe('detectIndentUnit', () => {
  it('finds two spaces', () => {
    expect(detectIndentUnit(lines('def f(x):', '  if x:', '    return 1', '  return 2'))).toBe(2)
  })

  it('finds four spaces', () => {
    expect(detectIndentUnit(lines('for i in range(3):', '    print(i)'))).toBe(4)
  })

  it('finds tabs', () => {
    expect(detectIndentUnit(lines('def f():', '\tif True:', '\t\treturn 1'))).toBe('tab')
  })

  it('has no answer for a file with nothing indented', () => {
    expect(detectIndentUnit(lines('print("hi")', 'x = 1'))).toBeNull()
    expect(detectIndentUnit('')).toBeNull()
  })

  it('ignores lines inside brackets and after a backslash', () => {
    const src = lines(
      'def f():',
      '  total = add(1,',
      '              2)',
      '  items = [',
      '      1,',
      '  ]',
      '  x = 1 + \\',
      '        2',
      '  return total',
    )
    expect(detectIndentUnit(src)).toBe(2)
  })

  it('is not swayed by indentation inside a multi-line string', () => {
    const src = lines(
      'MENU = """',
      '    1. Play',
      '        a. Easy',
      '    2. Quit',
      '"""',
      'def show():',
      '  print(MENU)',
    )
    expect(detectIndentUnit(src)).toBe(2)
  })

  it('ignores comment lines', () => {
    expect(detectIndentUnit(lines('if True:', '    # a comment', '  x = 1'))).toBe(2)
  })

  it('takes the most common step, preferring 4 in a tie', () => {
    expect(detectIndentUnit(lines('if a:', '  x = 1', 'if b:', '    y = 1'))).toBe(4)
    expect(detectIndentUnit(lines('if a:', '  x = 1', 'if b:', '  y = 1', 'if c:', '    z = 1'))).toBe(2)
  })

  it('reads CRLF line endings', () => {
    expect(detectIndentUnit('if a:\r\n  x = 1\r\n')).toBe(2)
  })
})

describe('reindentPython', () => {
  it('turns four spaces into two, and back', () => {
    const four = lines('def f(x):', '    if x:', '        return 1', '    return 2')
    const two = lines('def f(x):', '  if x:', '    return 1', '  return 2')
    expect(reindentPython(four, 4, 2)).toBe(two)
    expect(reindentPython(two, 2, 4)).toBe(four)
  })

  it('turns spaces into tabs and tabs into spaces', () => {
    const two = lines('while True:', '  if x:', '    break')
    const tabs = lines('while True:', '\tif x:', '\t\tbreak')
    expect(reindentPython(two, 2, 'tab')).toBe(tabs)
    expect(reindentPython(tabs, 'tab', 4)).toBe(lines('while True:', '    if x:', '        break'))
  })

  it('leaves a multi-line string exactly as it was', () => {
    const src = lines(
      'def menu():',
      '    print("""',
      '    1. Play',
      '        a. Easy',
      '    """)',
    )
    expect(reindentPython(src, 4, 2)).toBe(lines(
      'def menu():',
      '  print("""',
      '    1. Play',
      '        a. Easy',
      '    """)',
    ))
  })

  it('moves a docstring with its code', () => {
    const src = lines(
      'def f():',
      '    """Does a thing.',
      '',
      '    More about it.',
      '        An indented example.',
      '    """',
      '    return 1',
    )
    expect(reindentPython(src, 4, 2)).toBe(lines(
      'def f():',
      '  """Does a thing.',
      '',
      '  More about it.',
      '    An indented example.',
      '  """',
      '  return 1',
    ))
  })

  it('re-indents a hanging indent and keeps bracket alignment', () => {
    const src = lines(
      'def f():',
      '    items = [',
      '        1,',
      '    ]',
      '    total = add(1,',
      '                2)',
    )
    expect(reindentPython(src, 4, 2)).toBe(lines(
      'def f():',
      '  items = [',
      '    1,',
      '  ]',
      '  total = add(1,',
      '              2)',
    ))
  })

  it('places comments with the block they sit in', () => {
    const src = lines('if x:', '    # inside', '    y = 1', '# outside', 'z = 2')
    expect(reindentPython(src, 4, 2)).toBe(lines('if x:', '  # inside', '  y = 1', '# outside', 'z = 2'))
  })

  it('follows the block structure even where the old unit was not followed', () => {
    // One block indented by 3 in a 4-space file: depth, not arithmetic, decides.
    const src = lines('if a:', '    if b:', '       x = 1', '    y = 2')
    expect(reindentPython(src, 4, 2)).toBe(lines('if a:', '  if b:', '    x = 1', '  y = 2'))
  })

  it('keeps quotes, brackets and # inside strings from confusing it', () => {
    const src = lines(
      'def f():',
      '    s = "(# not a comment"',
      "    t = 'it\\'s ['",
      '    return s',
    )
    expect(reindentPython(src, 4, 2)).toBe(lines(
      'def f():',
      '  s = "(# not a comment"',
      "  t = 'it\\'s ['",
      '  return s',
    ))
  })

  it('keeps CRLF line endings', () => {
    expect(reindentPython('if a:\r\n    x = 1\r\n', 4, 2)).toBe('if a:\r\n  x = 1\r\n')
  })

  it('has nothing to do for a file already in the new unit', () => {
    expect(reindentEdits(lines('if a:', '  x = 1'), 2, 2)).toEqual([])
    expect(reindentEdits(lines('print(1)'), 4, 2)).toEqual([])
  })
})

// The promise that matters: re-indenting never changes what a program does.
const pythonAvailable = spawnSync('python', ['--version']).status === 0

describe.skipIf(!pythonAvailable)('reindentPython under native Python', () => {
  const program = lines(
    'import inspect',
    'MENU = """',
    '    1. Play',
    '        2. Quit',
    '"""',
    'class Game:',
    '    """A game.',
    '',
    '    With a longer description.',
    '    """',
    '    def __init__(self, n):',
    '        self.scores = [',
    '            n,',
    '            n * 2,',
    '        ]',
    '',
    '    def total(self):',
    '        # adds them up',
    '        t = 0',
    '        for s in self.scores:',
    '            if s > 1 and \\',
    '                    s < 100:',
    '                t += s',
    '            else:',
    '                t -= 1',
    '        return t',
    '',
    'print(MENU)',
    'print(Game(3).total())',
    'print(inspect.getdoc(Game))',
  )
  const run = (src: string) => spawnSync('python', ['-c', src], { encoding: 'utf8' })

  it.each([[2], [8], ['tab' as const]])('prints the same after 4 → %s', to => {
    const before = run(program)
    expect(before.stderr).toBe('')
    const converted = reindentPython(program, 4, to)
    expect(converted).not.toBe(program)
    const after = run(converted)
    expect(after.stderr).toBe('')
    expect(after.stdout).toBe(before.stdout)
    expect(reindentPython(converted, to, 4)).toBe(program)
  })
})
