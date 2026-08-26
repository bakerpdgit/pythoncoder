# Coordinates

`forward` and `left` steer the turtle relative to where it already is. Sometimes
you want to put it somewhere *exact* instead.

- `leo.setposition(x, y)` — go to the point (x, y).
- `leo.setheading(0)` — face a given direction outright.
- `leo.home()` — go back to (0, 0) facing east.

## The grid

The origin (0, 0) is the **middle** of the window, not a corner. x grows to the
right and y grows **upwards**, as in maths — not downwards, as in many other
graphics systems. In a 600 x 600 window the visible area runs from -300 to +300
on both axes.

Headings work the same way round:

| Heading | Direction |
| --- | --- |
| 0 | east (right) |
| 90 | north (up) |
| 180 | west (left) |
| 270 | south (down) |

## The pattern to notice

Every jump in this program is wrapped the same way:

```python
leo.penup()
leo.setposition(x, y)
leo.pendown()
```

`setposition` and `home` are *movement* commands, so with the pen down they draw
a line from the old spot to the new one. Wrapping them like this is the standard
way to reposition a turtle silently.

`setheading(0)` before each little square matters too. The turtle finishes each
square facing east already, but saying so explicitly means the squares would
still all line up if you changed the code above them.

**Try it:** remove the `leo.penup()` from inside the loop and see the web of
connecting lines it leaves behind.
