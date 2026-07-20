import type { BookTestCase } from '../types'

/**
 * Convert the PythonSponge test-input convention into one value per input()
 * call. Older books store multiple inputs in a single newline-delimited string;
 * newer/editor-authored tests normally store the same values as an array.
 */
export function normalizeTestInputs(input: BookTestCase['in']): Array<string | number> {
  if (Array.isArray(input)) return input
  if (input === undefined || input === '') return []
  return String(input).replace(/\r\n?/g, '\n').split('\n')
}
