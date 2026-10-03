# Filling shapes

A shape is filled by bracketing the drawing of it:

```python
leo.fillcolor("gold")
leo.begin_fill()
for side in range(3):
    leo.forward(190)
    leo.left(120)
leo.end_fill()
```

- `leo.fillcolor("gold")` — choose the colour to paint the inside.
- `leo.begin_fill()` — call it **just before** you start drawing the shape.
- `leo.end_fill()` — call it **just after**, and the shape is painted.

Nothing appears until `end_fill()` runs. Until then the library is simply
remembering every point the turtle visits, so that it knows what outline to fill.

## The outline stays on top

Run the program and look at the edges. Both shapes were drawn with a thick pen,
and both keep it: the fill goes *underneath* the lines the turtle drew while
`begin_fill()` was on, so the gold triangle keeps its black edge and the cyan
square its navy one.

`fillcolor()` and `pencolor()` are separate settings, so a shape can have an
edge in one colour and an inside in another. If you want no visible edge at
all, set the pen colour to the same as the fill colour.

## The shape does not have to be closed

If you call `end_fill()` before the turtle has returned to its starting point,
the library closes the outline for you with a straight line between the last
point and the first. That is occasionally useful and more often the explanation
for a fill that came out looking like a strange triangle.

**Try it:** change the triangle's first loop to `range(2)` so it never closes,
and see what shape gets filled.
