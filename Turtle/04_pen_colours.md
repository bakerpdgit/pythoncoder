# Colour, thickness and speed

Three commands change how the pen behaves, and one changes how fast you get to
watch it happen.

- `leo.pencolor("red")` — the colour of the line. The argument is a string.
- `leo.pensize(4)` — how thick the line is, in pixels. Any positive number.
- `leo.speed(2)` — how fast the turtle draws.

Each stripe in this program uses the next colour in the list and a pen one pixel
thicker than the last, so the effect of `pensize` is easy to compare.

## Colour names

Edexcel's PLS suggests starting with these:

> blue, black, green, yellow, orange, red, pink, purple, indigo, olive, lime,
> navy, orchid, salmon, peru, sienna, white, cyan, silver, gold

There are hundreds more. A name the library does not recognise is simply ignored
rather than reported, so check your spelling if a stripe comes out black.

## Speed

`speed()` takes a number from 1 (slowest) to 10 (fastest), or **0**, which is
faster still — it means "no delay at all, just draw it". The PLS also allows the
words `"slowest"`, `"slow"`, `"normal"`, `"fast"` and `"fastest"`, which mean the
same as 1, 3, 6, 10 and 0.

Speed is worth turning down while you are working out *why* a drawing is wrong,
and worth turning up to 0 once you know it is right.

## Reading the movement code

Each pass of the loop draws a stripe downwards, reverses back up with the pen
lifted, then sidesteps 70 pixels ready for the next one:

```python
leo.forward(300)   # draw the stripe (the turtle is facing down)
leo.penup()
leo.back(300)      # reverse to the top, drawing nothing
leo.left(90)       # face right
leo.forward(70)    # sidestep
leo.right(90)      # face down again
leo.pendown()
```

**Try it:** change `leo.pensize(index + 1)` to `leo.pensize((index + 1) * 3)`.
