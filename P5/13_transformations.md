# Moving, turning and scaling

So far every shape has been placed by its own numbers. Transformations move the
whole grid of coordinates instead.

| Function | Effect on everything drawn after it |
| --- | --- |
| `translate(x, y)` | (0, 0) moves to (x, y) |
| `rotate(angle)` | everything turns about (0, 0), clockwise |
| `scale(s)` | everything is s times bigger (`scale(0.5)` is half size) |

`angle_mode(DEGREES)` in `setup()` makes `rotate()` take degrees. Without it,
angles are in radians (`PI` is half a turn).

## Turning about a shape's own centre

`rotate()` always turns about (0, 0). To spin a square on the spot, first move
(0, 0) to where the square should be, then rotate, then draw the square at
(0, 0). `rect_mode(CENTER)` makes `square()` and `rect()` take their centre,
like `circle()`.

## push() and pop()

Transformations add up: two `translate(10, 0)`s move 20. `push()` remembers how
things are now — the transformations and the colours — and `pop()` puts them
back. Wrapping each part of a picture in `push()` … `pop()` stops one part's
transformations from leaking into the next.

## The clock

Rotating 30 degrees after each tick draws all twelve ticks with one `line()`.
The hands use the real time: `second()`, `minute()` and `hour()`. A second hand
turns 6 degrees a second (360 ÷ 60).

## Try this

- Add a second spinning square going the other way: `rotate(-frame_count)`.
- Give the clock a circular face behind the ticks.
- Use `scale(1, -1)` to draw something upside down.
