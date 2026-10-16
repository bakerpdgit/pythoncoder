# Task: bounce

Make a ball bounce from side to side. Here it is after 75 frames:

![preview](p5preview)

The canvas is 400 by 200, `x` starts at 50 and `speed` at 6. Every frame:

1. The light grey background is there already.
2. Draw the ball: **no outline**, fill `0, 0, 255`, a circle centred on
   `(x, 100)`, 40 across.
3. Add `speed` to `x`.
4. If `x` is more than `width - 20`, or less than `20`, reverse the speed.

It is marked after 30, 75 and 140 frames, so it has to bounce off both
walls the same way as the expected sketch. Draw first, then move, then check.

**Submit** when it bounces.
