# Python p5 learning book

Twenty pages introducing p5 — Processing-style drawing and animation — in
Python: twelve examples and eight marked tasks. Up to page 16 they alternate:
each example introduces something, and the task after it asks the student to
use it. The last four pages are examples only, because what they show
(randomness, the keyboard, lists of moving objects, a whole game) has no single
right picture to mark against.

The book uses the snake_case spelling of p5 found in the Raspberry Pi
Foundation's projects and the `p5` Python package (`no_stroke`, `mouse_x`,
`run()`). Coder's p5 also accepts p5.js's camelCase names, so a sketch from
pyp5js or translated from p5.js works too.

## The progression

| # | Page | Introduces | |
| --- | --- | --- | --- |
| 1 | Your first sketch | `setup`, `draw`, `run`, `size`, `background`, the shapes, coordinates | example |
| 2 | A house | placing shapes by their numbers | task |
| 3 | Colour | `fill`, `stroke`, `no_stroke`, `stroke_weight`, RGB, greys, names, alpha | example |
| 4 | A traffic light | colours and outlines that stay set; rounded rectangles | task |
| 5 | Loops make patterns | `for`, nested loops, `width`/`height` | example |
| 6 | A chessboard | nested loops, `%` | task |
| 7 | Animation | variables kept between frames, `global`, `frame_count`, `text` | example |
| 8 | Sunrise | animating with a variable and a stopping condition | task |
| 9 | The mouse | `mouse_x`, `pmouse_x`, `mouse_is_pressed`, `mouse_pressed()` | example |
| 10 | A crosshair | drawing at the mouse | task |
| 11 | Decisions: bouncing | speeds, reversing, `constrain` | example |
| 12 | Bounce | bouncing off two walls | task |
| 13 | Moving, turning and scaling | `translate`, `rotate`, `scale`, `push`/`pop`, `angle_mode` | example |
| 14 | A flower | `rotate` in a loop | task |
| 15 | Functions that draw | parameters, sizes as fractions, `no_loop` | example |
| 16 | Faces | writing and calling a drawing function, `arc` | task |
| 17 | Randomness and noise | `random`, `random_seed`, `noise`, `begin_shape` | example |
| 18 | The keyboard | `key_is_down`, `key_pressed()`, `key`, `key_code` | example |
| 19 | Lists of objects | a class, a list of objects, `Vector` | example |
| 20 | A whole game | everything together; `loop`/`no_loop`, `text_align` | example |

## How the tasks are marked

Each task has a hidden solution file (`NN_name_sol.py`) and tests of type `p5`:

```json
"tests": [
  { "in": [], "out": [{ "typ": "p5", "filename": "08_sunrise_sol.py", "frames": 60 }] }
],
"additionalFiles": [{ "filename": "08_sunrise_sol.py", "visible": false }]
```

The tester runs the student's sketch and the solution without a screen —
`setup()`, then `draw()` `frames` times (1 if not given), with the mouse at
`mouse` and `mouse_is_pressed` set from `pressed` if given — paints both last
frames, and compares the pictures pixel by pixel. So any program that draws the
same picture passes: `rect` or `square`, a loop or separate lines, shapes that
do not overlap drawn in either order. A tiny difference at the edges of shapes
is allowed; a shape missing, moved or the wrong colour is not. A failed test
shows the expected picture, the student's and the differences in red.
`random()` gives the student and the solution the same numbers, but only if
they call it in the same order, so tasks avoid it.

`![preview](p5preview)` in a guide shows the solution's picture from the first
`p5` test.

## How p5 runs in Coder

`src/python/p5` is Coder's own p5, drawn on an HTML canvas inside a window of
Coder's tkinter. Sketches run in the trace worker like any program, so Run,
Debug (with breakpoints inside `draw()`) and Trace all work.
