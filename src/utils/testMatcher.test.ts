import { describe, expect, it } from 'vitest'
import type { TesterRunOutput } from '../types'
import { evaluateTestCase } from './testMatcher'

function runOut(output: string): TesterRunOutput {
  return { output, error: null, statementResults: {}, fileContents: {} }
}

function passes(expected: string, output: string): boolean {
  return evaluateTestCase(0, { in: '', out: expected }, runOut(output), '').passed
}

describe('evaluateTestCase — basic "out" strings', () => {
  it('matches plain output, with or without a trailing newline', () => {
    expect(passes('hello world', 'hello world')).toBe(true)
    expect(passes('hello world', 'hello world\n')).toBe(true)
    expect(passes('hello world', 'hello world\n\n')).toBe(true)
    expect(passes('hello world', 'goodbye world\n')).toBe(false)
  })

  it('treats * in the expected output as a literal asterisk, not a quantifier', () => {
    // Regression: "7 * 4 = 28" used to compile to /7 * 4 = 28/, where the bare
    // `*` quantified the preceding space, so the exercise could never pass.
    expect(passes('7 * 4 = 28', '7 * 4 = 28\n')).toBe(true)
    expect(passes('7 * 4 = 28', '7  4 = 28\n')).toBe(false)
    expect(passes('7 * 4 = 28', '7 x 4 = 28\n')).toBe(false)
  })

  it('treats a lone . as a literal dot', () => {
    expect(passes('pi is 3.14', 'pi is 3.14\n')).toBe(true)
    expect(passes('pi is 3.14', 'pi is 3x14\n')).toBe(false)
  })

  it('still supports .* as a wildcard', () => {
    expect(passes('.*Hello Alice', 'What is your name? Hello Alice\n')).toBe(true)
    expect(passes('.*Hi Alice\n.*Hi Mark', 'Name? Hi Alice\nName? Hi Mark\n')).toBe(true)
    expect(passes('.*Hello Alice', 'Hello Bob\n')).toBe(false)
  })

  it('escapes the other regex metacharacters', () => {
    expect(passes('Answer (a+b)? [yes]', 'Answer (a+b)? [yes]\n')).toBe(true)
    expect(passes('{}\\n{}{}', '{}\n{}{}\n')).toBe(true)
    expect(passes('a|b', 'a|b\n')).toBe(true)
    expect(passes('a|b', 'a\n')).toBe(false)
    expect(passes('cost: $5^2', 'cost: $5^2\n')).toBe(true)
    expect(passes('back\\slash', 'back\\slash\n')).toBe(true)
    // A real newline in the expected output behaves like the escaped token above
    expect(passes('{}\n{}{}', '{}\n{}{}\n')).toBe(true)
  })

  it('anchors at the end so trailing junk fails', () => {
    expect(passes('hello', 'hello there\n')).toBe(false)
  })

  it('reports the failure with the actual output for the results bar', () => {
    const result = evaluateTestCase(0, { in: '', out: '7 * 4 = 28' }, runOut('7 * 4 = 29\n'), '')
    expect(result.passed).toBe(false)
    expect(result.output).toBe('7 * 4 = 29\n')
    expect(result.reqResults).toHaveLength(1)
    expect(result.reqResults[0].pattern).toBe('7 * 4 = 28')
  })
})
