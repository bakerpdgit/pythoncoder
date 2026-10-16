# Task: a flower

Draw this flower, using `rotate()`.

![preview](p5preview)

The canvas is 400 by 400, `angle_mode(DEGREES)` is set, the background is
there, and `translate(200, 200)` has moved (0, 0) to the middle of the canvas.
With **no outline**:

1. Eight pink petals (`255, 105, 180`). Each petal is an ellipse centred on
   `(0, -60)`, 50 wide and 120 high: that is one petal pointing straight up.
   Draw a petal, turn 45 degrees, draw another … eight times.
2. Then the middle: a circle centred on (0, 0), 60 across, filled `255, 215, 0`.

An `ellipse()` is always upright, so the only way to tilt the petals is to
rotate the canvas under them.

**Submit** when it matches.
