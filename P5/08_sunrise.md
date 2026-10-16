# Task: sunrise

Animate the sun rising from behind a hill. Here is the sketch after 150 frames:

![preview](p5preview)

The canvas (400 by 400) and the sky are there, and `y` — the height of the
sun's centre — starts at 450, below the canvas. Every frame, in `draw()`:

1. Draw the sun: **no outline**, fill `255, 200, 0`, a circle centred on
   `(200, y)`, 100 across.
2. Draw the ground **after** the sun, so it hides the sun's lower part: fill
   `34, 139, 34`, a rectangle with its top-left corner at (0, 300), 400 wide
   and 100 high.
3. Then move the sun up 2 pixels — but only while `y` is more than 100, so it
   stops when it is high in the sky.

It is marked by looking at your sketch after 60, 150 and 250 frames, so
the order matters: draw first, then move.

**Submit** when it rises and stops.
