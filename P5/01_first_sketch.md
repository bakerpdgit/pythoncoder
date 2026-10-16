# Your first sketch

p5 is a library for drawing and animation. A p5 program is called a
**sketch**, and it has the same shape every time:

```python
from p5 import *

def setup():
    size(400, 300)

def draw():
    background(220)
    circle(200, 150, 100)

run()
```

- `setup()` runs **once**, when the sketch starts. `size(400, 300)` makes a
  canvas 400 pixels wide and 300 high (without it you get 100 by 100).
- `draw()` runs **over and over**, about 60 times a second, until the sketch
  stops. Everything you see is drawn by it.
- `run()` starts it all. Leave it off and Coder starts the sketch anyway once
  your program reaches the end, but other p5 editors need it.

Press **Run**. The sketch appears in its own window in the Display pane. Close
it with the window's ✕, or press **Stop**.

## Coordinates

Every shape is placed with pixel coordinates `(x, y)`. `x` counts across from
the left. `y` counts **down** from the top, not up as in maths. So `(0, 0)` is
the top-left corner and `(400, 300)` is the bottom-right of this canvas.

## The shapes

| Function | Draws |
| --- | --- |
| `point(x, y)` | a single dot |
| `line(x1, y1, x2, y2)` | a line between two points |
| `rect(x, y, w, h)` | a rectangle with its top-left corner at (x, y) |
| `square(x, y, s)` | a square with its top-left corner at (x, y) |
| `circle(x, y, d)` | a circle with its **centre** at (x, y), d pixels across |
| `ellipse(x, y, w, h)` | an oval, centred on (x, y) |
| `triangle(x1, y1, x2, y2, x3, y3)` | a triangle through three points |
| `quad(x1, y1, ... x4, y4)` | any four-sided shape |

Notice that rectangles are placed by their corner and circles by their centre.

Shapes are drawn in order, so a later one covers an earlier one. Here the line
is drawn after the circle, so it goes over the top of it.

## Try this

- Move the circle to the top-left corner. What coordinates put it exactly in
  the corner, touching both edges?
- Change `background(220)` to `background(0)`, then to `background(255)`.
- Add a `quad()` that makes a kite shape.
