# Keys and the mouse

**Click inside the window first** so it has the keyboard, then use the arrow
keys to collect the coins. Click or drag on the canvas to draw.

## Binding events

`bind(event, function)` calls the function whenever the event happens:

```python
root.bind("<Left>", lambda event: move(-STEP, 0))
canvas.bind("<Button-1>", click)
```

The function is always given an **event** object. What is in it depends on the
event:

| Event | Happens when | Useful parts of `event` |
| --- | --- | --- |
| `"<Left>"`, `"<Up>"`, `"<space>"`, `"<Return>"`, `"a"` | that key is pressed | `event.keysym`, `event.char` |
| `"<Key>"` | any key is pressed | `event.keysym` says which |
| `"<Button-1>"` | left click (`3` = right) | `event.x`, `event.y` |
| `"<Double-Button-1>"` | double click | `event.x`, `event.y` |
| `"<B1-Motion>"` | drag with the left button held | `event.x`, `event.y` |
| `"<Motion>"` | the mouse moves | `event.x`, `event.y` |
| `"<Enter>"`, `"<Leave>"` | the mouse goes over / off a widget | |

Key names are case-sensitive and exact: `"<Return>"`, not `"<enter>"` (that
is an error). `"<Enter>"` means the *mouse* entering a widget.

## Which widget gets the event?

Keys go to the widget with **focus**. Binding them on `root` catches them
wherever the focus is in the window. Mouse events go to the widget under the
pointer, and `event.x`, `event.y` are measured from that widget's top-left.

## Collisions

```python
if coin in canvas.find_overlapping(left, top, right, bottom):
```

`find_overlapping` returns the ids of every shape touching a rectangle. Here
that is the player's own box, so "is the coin one of them?" is a collision
test. `tags="coin"` gives shapes a group name; `canvas.delete("coin")` would
remove every coin at once.

## Try this

- Add a timer: 30 seconds to get as many coins as possible (use `root.after`).
- Add a red "bomb" that ends the game if you touch it.
- Make WASD work as well as the arrow keys.
