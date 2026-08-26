import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { renderTable } from './BookPanel'

// Every table actually shipped in the Turtle book must render, not fall through
// to the paragraph path as literal pipes.
const dir = join(process.cwd(), 'Turtle')

describe('Turtle book guides', () => {
  const guides = readdirSync(dir).filter(f => f.endsWith('.md'))

  it('finds the guide files', () => {
    expect(guides.length).toBeGreaterThan(0)
  })

  for (const file of guides) {
    const md = readFileSync(join(dir, file), 'utf8')
    const blocks = md.split(/\n\n+/).map(b => b.trim()).filter(b => b.startsWith('|'))
    if (!blocks.length) continue

    it(`renders every table in ${file}`, () => {
      for (const block of blocks) {
        const html = renderTable(block)
        expect(html, `unrendered table in ${file}:\n${block}`).not.toBeNull()
        expect(html).toContain('<th')
        expect(html).not.toContain('|')
      }
    })
  }
})
