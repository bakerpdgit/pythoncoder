# Turtle 1 solution: Fix the hexagon

A model solution for **Turtle 1**. Run it to see the hexagon.

## The five errors

| Line | Error | Fix |
|---|---|---|
| `import Turtle` | No module called `Turtle` (capital T) | `import turtle` |
| `ANGLE = 360 / SIDE` | `SIDE` has never been defined | `360 / SIDES` |
| `for count in range(SIDES)` | Syntax error: missing colon | add `:` |
| `turtle.forwards(...)` | No such command | `turtle.forward(...)` |
| `turtle.end_fill` | **Logic error**: without brackets the subprogram is never called, so the shape is not filled | `turtle.end_fill()` |

## Worth noticing

The turning angle is calculated from the constants rather than typed in as 60. Change `SIDES` to 8 and the same program draws an octagon.
