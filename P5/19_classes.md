# Lists of objects

Click (or drag) to throw balls. Each ball remembers its own position, speed,
size and colour — so each is an **object** of a `Ball` class, and they all live
in a list.

```python
class Ball:
    def __init__(self, x, y):
        self.pos = Vector(x, y)
        self.vel = Vector(random(-3, 3), random(-6, -2))

    def update(self):
        self.vel.add(GRAVITY)
        self.pos.add(self.vel)
```

`draw()` then only has to say "every ball: move, then show yourself":

```python
for ball in balls:
    ball.update()
    ball.show()
```

## Vectors

A `Vector` holds an x and a y together: a position, or a velocity (how far to
move each frame), or a force. `pos.add(vel)` moves the position by the
velocity; `vel.add(GRAVITY)` makes the ball fall faster and faster. Vectors
also have `mult()`, `sub()`, `mag()` (length), `normalize()`, `limit()`,
`heading()` and more. `create_vector(x, y)` makes one too.

## Bouncing, and losing energy

When a ball hits the floor its vertical speed reverses but shrinks to 80%
(`* 0.8`), so every bounce is lower than the last.

## Try this

- Give each ball a lifetime, and remove it from the list when it runs out.
- Make the balls bounce off the ceiling too.
- Change the colour of a ball while the mouse is over it: `dist()` between
  the mouse and its centre tells you.
