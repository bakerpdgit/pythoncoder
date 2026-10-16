# Task: a crosshair

Draw a crosshair that follows the mouse, and fires when it is pressed.

![preview](p5preview)

On the black background, every frame:

1. Green lines (`0, 255, 0`), 2 pixels thick: one straight down the canvas
   through the mouse (from `(mouse_x, 0)` to `(mouse_x, height)`) and one
   straight across it.
2. A circle 60 across around the mouse, with **no fill** (same green outline).
3. Only while the mouse is pressed: a red (`255, 0, 0`) circle 20 across at the
   mouse, with no outline.

It is marked with the mouse in three places, once with the button held down.

**Submit** when it works.
