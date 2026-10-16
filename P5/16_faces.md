# Task: faces

Write a function that draws a smiley face, and use it three times.

![preview](p5preview)

`draw_face(x, y, size_of_face)` draws a face centred on `(x, y)`. With
`s = size_of_face`:

1. The head: fill `255, 220, 0`, black outline 2 pixels thick, a circle centred
   on `(x, y)`, `s` across.
2. Two eyes: fill black (`0`), circles `s * 0.12` across, centred on
   `(x - s * 0.2, y - s * 0.15)` and `(x + s * 0.2, y - s * 0.15)`.
3. The smile: no fill, an `arc()` centred on `(x, y + s * 0.05)`, `s * 0.5` wide
   and `s * 0.4` high, from angle `0` to `PI`.

`arc(x, y, w, h, start, stop)` draws part of an ellipse, from angle `start` to
`stop`, going clockwise. Angles are in radians here: 0 is to the right of the
centre and `PI` is half a turn, so 0 to `PI` is the bottom half: a smile.

Then, in `draw()`, call it three times:

| Face | x | y | size |
| --- | --- | --- | --- |
| 1 | 100 | 200 | 120 |
| 2 | 250 | 150 | 80 |
| 3 | 330 | 280 | 100 |

The parameter is called `size_of_face`, not `size`: `size` is already the p5
function that sets the canvas size, and a parameter called `size` would hide it.

**Submit** when your faces match.
