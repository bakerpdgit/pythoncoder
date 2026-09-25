# Animation with after()

To animate, move a shape a little, wait a moment, and repeat. The obvious way
is wrong:

```python
while True:           # don't do this in tkinter
    canvas.move(ball, 4, 3)
    time.sleep(0.02)
```

The loop never gives control back to `mainloop()`, so tkinter never gets a
chance to redraw the window or notice a click. On your own computer the window
freezes and stops responding. (Coder copes better, but it is still the wrong
shape of program.)

## after(): "call this later"

```python
def step():
    canvas.move(ball, dx, dy)
    ...
    root.after(20, step)     # call step again in 20 milliseconds

step()
root.mainloop()
```

`root.after(20, step)` does **not** wait. It books `step` to be called in 20 ms
and returns at once. `step` finishes, `mainloop()` redraws the window and
handles any clicks, and 20 ms later `step` runs again and books the next frame.
20 ms per frame is 50 frames a second.

## Bouncing

`canvas.coords(ball)` gives `[left, top, right, bottom]`. When the ball's edge
passes the canvas edge, reverse that direction:

```python
if left <= 0 or right >= WIDTH:
    dx = -dx
```

## Pausing

The `running` flag stops `step` from booking another frame. Pressing Play sets
it again and calls `step()` to restart the chain. `root.after` also returns an
id, so `root.after_cancel(id)` can cancel a booked call instead.

## Try this

- Add a second ball with its own `dx` and `dy`. (A list of balls, each a
  dictionary, scales to twenty.)
- Speed the ball up a little on every bounce.
- Change the ball's colour each time it hits a wall.
