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

## The fill covers the outline

Run the program and compare the two shapes. Both were drawn with a thick pen,
but only the triangle has a visible black edge — the cyan square's navy outline
has disappeared underneath its own fill.

That is because `end_fill()` paints the shape *over* everything already drawn
there, including the outline the turtle just laid down. The fix is to draw the
shape a second time after the fill is finished:

```python
leo.end_fill()

for side in range(3):     # the same three sides again, over the top
    leo.forward(190)
    leo.left(120)
```

The turtle is back where it started with the same heading, so repeating the
loop retraces the outline exactly.

## The shape does not have to be closed

If you call `end_fill()` before the turtle has returned to its starting point,
the library closes the outline for you with a straight line between the last
point and the first. That is occasionally useful and more often the explanation
for a fill that came out looking like a strange triangle.

**Try it:** change the triangle's first loop to `range(2)` so it never closes,
and see what shape gets filled.
