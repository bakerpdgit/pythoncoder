import { cleanCodeText } from './codeAnalysis'
import type { StructureModel, FunctionDef } from '../types'
import { getExplanation } from '../data/explanations'

export const getDefaultDefinitionNote = (definition: FunctionDef | null): string => {
  if (!definition) return ''
  const note = getExplanation(definition.name, definition.className)
  return note.startsWith('Executing ') ? '' : note
}

export const getDefinitionNote = (definition: FunctionDef | null, overrides: Record<string, string>): string => {
  if (!definition) return ''
  if (Object.prototype.hasOwnProperty.call(overrides, definition.key)) return overrides[definition.key]
  return getDefaultDefinitionNote(definition)
}

export const sanitizeNoteText = (value: string): string =>
  cleanCodeText(value ?? '')
    .split('\n')
    .map(line => line.replace(/\s+$/g, ''))
    .join('\n')
    .trim()

export const buildCommentExport = (structureModel: StructureModel, overrides: Record<string, string>): string => {
  const output: string[] = []
  structureModel.items.forEach(item => {
    if (item.type === 'class') {
      if (item.methods.length === 0) return
      output.push(item.interface)
      item.methods.forEach(method => {
        output.push(`    ${method.interface}`)
        const note = getDefinitionNote(method, overrides)
        if (note) {
          note.split('\n').forEach(line => output.push(`        ${line}`))
        } else {
          output.push('        ')
        }
        output.push('')
      })
      output.push('')
      return
    }
    output.push(item.interface)
    const note = getDefinitionNote(item, overrides)
    if (note) {
      note.split('\n').forEach(line => output.push(`    ${line}`))
    } else {
      output.push('    ')
    }
    output.push('')
  })
  return output.join('\n').trim() + '\n'
}

export const replaceExistingDocstring = (lines: string[], insertIndex: number): number => {
  let firstContentIndex = insertIndex
  while (firstContentIndex < lines.length && lines[firstContentIndex].trim() === '') {
    firstContentIndex++
  }
  const trimmed = lines[firstContentIndex]?.trim() || ''
  if (!trimmed.startsWith('"""') && !trimmed.startsWith("'''")) return insertIndex

  const quote = trimmed.startsWith('"""') ? '"""' : "'''"
  let endIndex = firstContentIndex
  const restOfLine = trimmed.slice(3)
  if (!restOfLine.includes(quote)) {
    endIndex++
    while (endIndex < lines.length && !lines[endIndex].includes(quote)) endIndex++
  }
  lines.splice(firstContentIndex, endIndex - firstContentIndex + 1)
  return firstContentIndex
}

export const buildDocstringExport = (source: string, structureModel: StructureModel, overrides: Record<string, string>): string => {
  const lines = cleanCodeText(source).split('\n')
  const definitions = [...structureModel.orderedDefinitions].sort((a, b) => b.line - a.line)

  definitions.forEach(definition => {
    const note = getDefinitionNote(definition, overrides)
    if (!note) return

    const lineIndex = definition.line - 1
    const originalLine = lines[lineIndex] || ''
    const leadingWhitespace = originalLine.match(/^\s*/)?.[0] || ''
    const docIndent = `${leadingWhitespace}    `
    const safeLines = note.split('\n').map(line => line.replace(/"""/g, '\\"\\"\\"'))
    const docstringLines = [`${docIndent}"""`, ...safeLines.map(line => `${docIndent}${line}`), `${docIndent}"""`]
    const insertIndex = replaceExistingDocstring(lines, lineIndex + 1)
    lines.splice(insertIndex, 0, ...docstringLines)
  })

  return lines.join('\n')
}
