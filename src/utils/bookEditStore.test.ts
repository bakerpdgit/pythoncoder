import { describe, expect, it } from 'vitest'
import { bookSourceFsName, exerciseKind, withExerciseKind } from './bookEditStore'
import { BOOK_SRC_PREFIX } from './bookLoader'

describe('bookSourceFsName', () => {
  it('uses the plain name when nothing written in this browser has it', () => {
    expect(bookSourceFsName('My Book', [])).toBe(`${BOOK_SRC_PREFIX}My Book`)
    // A book opened from a ZIP or folder before has its real copy elsewhere, so
    // its filesystem may be replaced.
    expect(bookSourceFsName('My Book', [{ name: `${BOOK_SRC_PREFIX}My Book` }])).toBe(`${BOOK_SRC_PREFIX}My Book`)
  })

  it('never reuses the filesystem of a book written in this browser', () => {
    const existing = [
      { name: `${BOOK_SRC_PREFIX}My Book`, authoredBook: { title: 'My Book' } },
      { name: `${BOOK_SRC_PREFIX}My Book (2)`, authoredBook: { title: 'My Book (2)' } },
    ]
    expect(bookSourceFsName('My Book', existing)).toBe(`${BOOK_SRC_PREFIX}My Book (3)`)
  })
})

describe('exercise kinds', () => {
  it('converts between example, task and Parsons puzzle', () => {
    const task = { id: 'a', name: 'A', py: 'a.py', tests: [{ in: '', out: 'x' }] }
    expect(exerciseKind(task)).toBe('task')
    const puzzle = withExerciseKind(task, 'parsons')
    expect(puzzle).toMatchObject({ typ: 'parsons', parsons: { indent: 'given' } })
    expect(puzzle.tests).toBeUndefined()
    expect(exerciseKind(withExerciseKind(puzzle, 'example'))).toBe('example')
    expect(withExerciseKind(puzzle, 'task')).toMatchObject({ tests: [] })
  })
})
