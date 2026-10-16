# Loops make patterns

Ten circles in a row could be ten lines of code. A `for` loop draws them all
with one:

```python
for i in range(10):
    circle(20 + i * 40, 30, 30)
```

`i` is 0, then 1, then 2 … up to 9. Each time round, `20 + i * 40` puts the
circle 40 pixels further right: 20, 60, 100 … 380.

## More than position

The loop variable can change anything. In the strip of rectangles, `i` changes
the colour too: `fill(0, 0, i * 13)` fades from black to blue.

## A loop inside a loop

A grid needs two loops, one inside the other. The outer loop chooses the row;
for every row, the inner loop goes along it, column by column:

```python
for row in range(5):
    for col in range(8):
        square(10 + col * 48, 120 + row * 48, 40)
```

That is 5 × 8 = 40 squares. Here the colour depends on both the row and the
column.

## width and height

`width` and `height` always hold the size of the canvas. Using them instead of
400 means a sketch still fits when you change `size()`.

## Try this

- Make the row of circles shrink as it goes: use `30 - i * 2` for the diameter.
- Change the grid to 8 rows of 8.
- Use `if (row + col) % 2 == 0:` inside the grid to give alternate squares a
  different colour. (You will need this for the next task.)
