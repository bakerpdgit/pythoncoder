import { describe, expect, it } from 'vitest'

import { renderTable } from './BookPanel'

// The book guide renderer is a hand-rolled markdown subset. Tables used to fall
// through to the paragraph path and render as literal "| Key | What it does |"
// rows, which is what these cover.
describe('renderTable', () => {
  const table = [
    '| Key | What it does |',
    '| --- | --- |',
    '| W | forward |',
    '| S | backward |',
  ].join('\n')

  it('renders a header row and a body row per line', () => {
    const html = renderTable(table) as string
    expect(html).toContain('<th')
    expect(html).toContain('Key')
    expect(html).toContain('What it does')
    expect((html.match(/<tr>/g) ?? []).length).toBe(3)
    expect((html.match(/<td/g) ?? []).length).toBe(4)
  })

  it('does not leave stray pipes in the output', () => {
    expect(renderTable(table)).not.toContain('|')
  })

  it('honours colon alignment markers', () => {
    const html = renderTable('| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |') as string
    expect(html).toContain('text-left')
    expect(html).toContain('text-center')
    expect(html).toContain('text-right')
  })

  it('pads a short row so the grid stays rectangular', () => {
    const html = renderTable('| a | b | c |\n| --- | --- | --- |\n| 1 |') as string
    expect((html.match(/<td/g) ?? []).length).toBe(3)
  })

  it('returns null for prose that merely starts with a pipe', () => {
    expect(renderTable('| not a table, no delimiter row')).toBeNull()
    expect(renderTable('| a | b |\n| c | d |')).toBeNull()
  })

  it('scrolls wide tables inside their own container rather than the page', () => {
    expect(renderTable(table)).toContain('overflow-x-auto')
  })
})
