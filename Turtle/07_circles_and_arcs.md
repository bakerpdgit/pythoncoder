# Circles and arcs

`circle()` draws a curve without you having to work out any of the geometry:

```python
leo.circle(90)        # a whole circle of radius 90
leo.circle(90, 180)   # half of that circle
```

The second argument is the **extent** — how many of the circle's 360 degrees to
draw. Leave it out and you get the whole circle. It is how you draw an arc.

## Where is the centre?

This is the part that catches people out. The turtle does **not** stand at the
centre. It stands on the **edge**, and the centre is one radius away to its
**left**. The turtle then curves round counterclockwise, ending up back where it
started (for a full circle) still facing the same way.

So the position of a circle depends on which way the turtle was facing when you
called `circle()`. That is why each shape here does `setheading(0)` first: it
makes the results predictable.

## Negative radius

A negative radius puts the centre on the turtle's **right** instead, so the arc
curves clockwise. The two half-circles in this program start from the same point
facing the same way, and differ only in the sign of the radius — one bulges up,
the other down.

## Circles are really polygons

Behind the scenes `circle()` draws a many-sided polygon with sides too short to
see, exactly like the 36-sided shape you may have tried at the end of example 3.

**Try it:** replace the three shapes with a loop of six `leo.circle(90, 60)`
calls and a `leo.left(60)` between them.
