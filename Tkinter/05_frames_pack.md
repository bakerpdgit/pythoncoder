# Frames: building a whole window

Real programs are laid out in **regions**: a toolbar, a sidebar, a status bar,
a main area. Each region is a `Frame`, an invisible box that holds other widgets.
The widgets inside a frame are placed relative to that frame, not the window.

```python
toolbar = tk.Frame(root, bg="#2b579a")
toolbar.pack(side="top", fill="x")
tk.Button(toolbar, text="New").pack(side="left")
```

The first argument of a widget is its **parent**. `tk.Button(toolbar, ...)`
puts the button *in the toolbar*.

## How pack shares out the space

`pack()` works through the widgets in the order you packed them. Each one takes
a strip off one side of the space that is left:

1. the toolbar takes a strip across the **top**,
2. the status bar a strip across the **bottom**,
3. the sidebar a strip down the **left** of what remains,
4. the main area takes whatever is left, because of `expand=True`.

So the **order** you call `pack()` matters. Pack the status bar last and it
ends up at the bottom of the main area instead.

| Option | Meaning |
| --- | --- |
| `side` | `"top"` (default), `"bottom"`, `"left"`, `"right"` |
| `fill` | stretch to fill the strip: `"x"`, `"y"` or `"both"` |
| `expand=True` | also claim any spare space left over |
| `anchor` | where to sit in the strip if not filling: `"w"`, `"e"`, `"n"`... |

`fill` and `expand` are different things. `expand` gives the widget a bigger
strip; `fill` makes the widget grow to fill its strip.

## Mixing layouts, safely

The main area uses `pack`, but the little search form inside it is its own
frame using `grid`. Every frame chooses its own layout.

## Try this

- Move the sidebar to the right.
- Make the status bar show "Clicked New" when you click New (give the button a
  `command` that calls `status.config(...)`).
- Swap the order of the toolbar and status bar `pack` calls and see what changes.
