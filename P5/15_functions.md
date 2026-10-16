# Functions that draw

A picture with ten trees in it could repeat the same three lines ten times,
with different numbers each time. A function writes them once:

```python
def draw_tree(x, y, h):
    fill(120, 70, 20)
    rect(x - h * 0.06, y - h * 0.4, h * 0.12, h * 0.4)
    fill(30, 140, 50)
    triangle(x - h * 0.3, y - h * 0.3, x, y - h, x + h * 0.3, y - h * 0.3)
```

Every number in the tree is worked out from three **parameters**: where it
stands (`x`, `y`) and how tall it is (`h`). So `draw_tree(150, 250, 180)` is a
tall tree, `draw_tree(260, 250, 90)` a small one, and a loop can plant a row of
them.

Writing every size as a fraction of `h` is what lets one function draw a tree
at any size: the trunk is always 12% of the height wide, the leaves always start
30% of the way up.

## no_loop()

Nothing in this picture moves, so `no_loop()` in `setup()` tells p5 to run
`draw()` once and stop. The sketch then finishes on its own.

## Try this

- Give `draw_tree` a fourth parameter for the leaves' colour.
- Plant a forest: 30 trees in a loop with `random()` positions and heights
  (see page 17).
- Write `draw_house(x, y, w)` and build a street.
