# Laying out a form with grid

`pack()` is fine for a column of widgets, but a form, with labels down one side
and boxes down the other, needs rows and columns. That is `grid()`:

```python
tk.Label(root, text="Username:").grid(row=1, column=0)
username.grid(row=1, column=1)
```

Rows and columns count from 0. Empty rows and columns take up no space, so you
can leave gaps in the numbering.

## The grid options

| Option | Meaning |
| --- | --- |
| `row`, `column` | which cell |
| `columnspan`, `rowspan` | stretch across several cells (the title spans 2 columns) |
| `sticky` | which edges of the cell to stick to: `"e"` = right, `"w"` = left, `"ew"` = stretch across, `"nsew"` = fill the cell |
| `padx`, `pady` | space around the widget |

Without `sticky`, a widget sits in the **middle** of its cell. The labels use
`sticky="e"` so they line up against their boxes.

## Growing with the window

```python
root.columnconfigure(1, weight=1)
```

By default columns stay as narrow as their widest widget. A **weight** lets a
column share any spare width when the window is made bigger. Combined with
`sticky="ew"`, the boxes stretch.

## Never mix pack and grid

Inside any one window or frame, use **either** `pack` **or** `grid`, never both.
tkinter stops you:

```
_tkinter.TclError: cannot use geometry manager pack inside . which already has slaves managed by grid
```

You can still use both in one program, in *different* frames. Page 5 shows how.

## show="*"

`tk.Entry(root, show="*")` shows a star for each letter typed, for passwords.
`.get()` still gives the real text.

## Try this

- Add an "Email" row, and check it contains an `@`.
- Add a "Show password" Checkbutton: `password.config(show="")` shows the text
  again.
- Try `pack()` on one of the labels and read the error message.
