# Decisions: bouncing

A ball that bounces needs two things the last pages did not: a speed that can
change, and a decision about when to change it.

```python
x = x + x_speed
if x > width - r or x < r:
    x_speed = -x_speed
```

The ball moves `x_speed` pixels each frame. When its edge reaches a wall —
its centre is `r` (its radius) from the wall — the speed turns negative, and the
ball goes back the other way. Doing the same for `y` makes it bounce off the
top and bottom too.

## Decisions about colour

`if x_speed > 0` is true while the ball moves right, so it is orange one way and
blue the other.

## constrain()

`constrain(value, low, high)` keeps a number between two others. The white bar
follows the mouse, but `constrain(mouse_x, 40, width - 40)` stops it going off
either edge.

## Try this

- Make the ball speed up a little every time it bounces.
- Count the bounces and show the count with `text()`.
- Make the ball bounce off the white bar instead of the bottom edge. (When it
  misses, start it again from the top.)
