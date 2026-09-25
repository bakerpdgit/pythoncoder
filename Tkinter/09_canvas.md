# Drawing on a Canvas

A `Canvas` is a rectangle you can draw shapes on. It is also the start of most
tkinter games (pages 10 and 11).

## Coordinates

```
(0, 0) ───────────► x
  │
  │
  ▼ y          (400, 300)
```

`(0, 0)` is the **top-left** corner and **y counts downwards**, not upwards as
in maths or turtle. A rectangle or oval is given by two corners, top-left then
bottom-right:

```python
canvas.create_rectangle(80, 140, 200, 230, fill="tan", outline="black")
canvas.create_oval(310, 20, 370, 80, fill="gold")   # an oval fits inside its box
```

| Method | Draws | Coordinates |
| --- | --- | --- |
| `create_rectangle` | rectangle | two corners |
| `create_oval` | oval or circle | the corners of its box |
| `create_line` | line through points | `x1, y1, x2, y2, ...` |
| `create_polygon` | filled shape | each corner in turn |
| `create_text` | text | its centre |
| `create_arc` | slice of an oval | box, plus `start=` and `extent=` in degrees |

Common options: `fill` (inside colour), `outline` (edge colour, `""` for none),
`width` (line thickness), `dash=(8, 6)` for dashed lines.

## Shapes are objects

Each `create_` call returns an **id number** for that shape. Keep it and you
can change the shape later:

```python
cloud = canvas.create_oval(20, 30, 110, 70, fill="white")
canvas.itemconfig(cloud, fill="grey")    # recolour it
canvas.coords(cloud)                     # where is it? [20.0, 30.0, 110.0, 70.0]
canvas.move(cloud, 10, 0)                # nudge it 10 pixels right
canvas.delete(cloud)                     # remove it
```

That is the big difference from turtle, which only ever adds ink. Moving a
shape by its id is what makes animation possible.

`highlightthickness=0` removes the thin border tkinter draws round a canvas.

## Try this

- Draw a car, and a button that moves it across the road with `canvas.move`.
- Draw a row of 10 houses with a `for` loop. Only the x coordinates change.
- Make the button toggle between rain and sunshine.
