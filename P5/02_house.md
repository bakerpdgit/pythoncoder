# Task: a house

Draw this house. Every number you need is below.

![preview](p5preview)

The canvas is already 400 by 400 with a white background. Keep the default
white fill and black outline, and add, **in this order**:

| Part | Shape |
| --- | --- |
| Walls | a square with its top-left corner at (100, 200), 200 pixels wide |
| Roof | a triangle with corners at (100, 200), (200, 80) and (300, 200) |
| Door | a rectangle with its top-left corner at (175, 300), 50 wide and 100 high |
| Left window | a square at (125, 230), 40 wide |
| Right window | a square at (235, 230), 40 wide |
| Sun | a circle centred on (340, 60), 60 across |

Press **Run** to see your drawing, then **Submit** when it looks right.

## How it is marked

Your sketch's picture is compared with the expected one, pixel by pixel. It
does not matter which functions you use — `rect(100, 200, 200, 200)` draws the
same walls as `square(100, 200, 200)` — only what ends up on the canvas. If it
does not match, the results show the expected picture, yours, and the
differences in red.
