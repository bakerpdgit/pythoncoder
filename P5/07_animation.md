# Animation

`draw()` runs about 60 times a second. If something is in a slightly different
place each time it is drawn, it moves.

```python
x = 0

def draw():
    global x
    background(255)
    circle(x, 100, 50)
    x = x + 3
```

- `x` is made **outside** the functions, so it keeps its value from one frame to
  the next. A variable made inside `draw()` would start again every frame.
- `draw()` changes `x`, so it has to say `global x` first. Without it Python
  makes a new local `x` and complains that it has no value yet.
- `background()` at the start of `draw()` wipes the last frame. Take it out and
  every frame is left behind: the ball smears into a thick line.

## Going round again

When the ball has gone off the right edge, it goes back to the left:

```python
if x > width + 25:
    x = -25
```

## frame_count

`frame_count` is how many frames have been drawn: 1 in the first `draw()`, 60
a second later. `text()` writes on the canvas — here it shows the frame count.
`text_size()` sets how big the text is.

## Try this

- Make the ball move down as well as across.
- Make it grow: add a variable for its size, and add 1 to it every frame.
- Change `frame_rate(10)` in `setup()`: draw() now runs 10 times a second.
