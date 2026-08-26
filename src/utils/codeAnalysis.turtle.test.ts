import { describe, expect, it } from 'vitest'

import { codeUsesTurtle, codeUsesTurtleKeyboard } from './codeAnalysis'

// Only the canvas renderer runs turtle key handlers; the SVG renderer's
// onkey/listen are no-ops, so such a program used to draw nothing and exit.
describe('codeUsesTurtleKeyboard', () => {
  const withKeys = [
    'import turtle\nscreen = turtle.Screen()\nscreen.onkey(go, "w")\nscreen.listen()',
    'import turtle\ns = turtle.Screen()\ns.onkeypress(go, "Up")',
    'import turtle\ns = turtle.Screen()\ns.onkeyrelease(stop, "Up")',
    'import turtle\nwin = turtle.Screen()\nwin.listen()',
  ]

  for (const [i, src] of withKeys.entries()) {
    it(`detects key handlers (case ${i + 1})`, () => {
      expect(codeUsesTurtleKeyboard(src)).toBe(true)
    })
  }

  it('ignores turtle code with no key handlers', () => {
    const src = 'import turtle\nleo = turtle.Turtle()\nleo.forward(100)\nleo.left(90)'
    expect(codeUsesTurtle(src)).toBe(true)
    expect(codeUsesTurtleKeyboard(src)).toBe(false)
  })

  it('does not fire on non-turtle code that happens to call listen()', () => {
    const src = 'import socket\nsock = socket.socket()\nsock.listen(5)'
    expect(codeUsesTurtleKeyboard(src)).toBe(false)
  })

  // Like codeUsesPygame and codeUsesTurtle beside it, this is a plain source
  // scan with no comment stripping, so a commented-out handler still counts.
  // The cost is only that such a program renders on the canvas instead of as
  // SVG — it still draws correctly — whereas the opposite mistake, missing a
  // real handler, leaves the program dead on arrival.
  it('also matches a commented-out handler, as the sibling detectors do', () => {
    const src = 'import turtle\n# screen.onkey(go, "w")\nleo = turtle.Turtle()'
    expect(codeUsesTurtleKeyboard(src)).toBe(true)
  })
})
