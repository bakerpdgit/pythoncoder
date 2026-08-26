# Lifting the pen

So far every move has drawn a line, because the turtle's pen was down the whole
time. Two commands control it:

- `leo.penup()` — lift the pen. The turtle still moves, but leaves no line.
- `leo.pendown()` — put the pen back down, so movement draws again.

This is how you get **separate** shapes in one picture. Without `penup()` every
journey between shapes would be drawn as an unwanted connecting line.

## The dashed line

The loop alternates: pen down for 30 pixels, pen up for 30 pixels. Run it and
watch the pen state flip on each pass.

```python
for dash in range(8):
    leo.pendown()
    leo.forward(30)
    leo.penup()
    leo.forward(30)
```

## Two other commands

`leo.setposition(-250, 0)` jumps the turtle to an exact spot in the window.
Notice it is wrapped in `penup()` / `pendown()`, because `setposition` draws a
line if the pen happens to be down. Coordinates get a page of their own later.

`leo.back(240)` moves *backwards* — the turtle reverses along its own heading
without turning round first. It still draws, because the pen is down.

**Try it:** delete the `leo.penup()` before `leo.left(90)` and run it again.
The stray line it leaves is exactly the problem `penup()` exists to solve.
