# Loops and angles

Example 1 drew a square by writing `forward` and `right` out four times. A `for`
loop says the same thing once:

```python
for side in range(SIDES):
    leo.forward(LENGTH)
    leo.left(360 / SIDES)
```

Change `SIDES` from 5 to 6 or 8 and you get a hexagon or an octagon with no
other edits. That is the point of pulling the numbers out into constants.

## Where does 360 / SIDES come from?

To close any shape, the turtle has to end up facing the way it started — one
complete turn of 360 degrees, shared equally between the corners. So:

| Shape | Sides | Turn at each corner |
| --- | --- | --- |
| Triangle | 3 | 120° |
| Square | 4 | 90° |
| Pentagon | 5 | 72° |
| Hexagon | 6 | 60° |

The turn is the *outside* angle at each corner, not the inside one. A pentagon's
interior angles are 108°, but the turtle turns 72°.

## left() and right()

The second shape uses `right()` instead of `left()`, so it is drawn clockwise
rather than counterclockwise. Everything else about it is the same. Watch the
two shapes being drawn and you will see the difference in direction.

**Try it:** set `SIDES` to 36 and `LENGTH` to 20. With enough short sides and
small turns, a polygon becomes indistinguishable from a circle.
