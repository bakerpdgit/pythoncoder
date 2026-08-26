# Patterns from nested loops

Two commands you have already met, arranged one inside the other, produce
something that looks a lot harder than it is:

```python
for shape in range(SHAPES):
    for side in range(4):
        leo.forward(SIZE)
        leo.left(90)
    leo.left(360 / SHAPES)
```

The **inner** loop draws one square. The **outer** loop repeats that 24 times,
turning the turtle a little further round between squares. Because the squares
all share a corner, they fan out into a rosette.

Read a nested loop from the inside out: "draw a square" is the unit, and the
outer loop is what you do with that unit.

## Two other commands here

- `leo.hideturtle()` makes the turtle marker invisible so it does not sit on top
  of the finished drawing. `leo.showturtle()` brings it back.
- `leo.speed(0)` is the fastest setting there is. At 576 sides, anything slower
  is a long wait.

There is also `leo.reset()`, which you will meet in the last example. It clears
the canvas, sends the turtle home and puts every pen setting back to its default
in one go.

**Try it:**

- Change `SHAPES` to 36 and the turn will follow automatically.
- Swap the inner square for a triangle: `range(3)` and `left(120)`.
- Move `leo.pencolor(...)` inside the outer loop and pick from a list of colours
  so each square is drawn differently.
