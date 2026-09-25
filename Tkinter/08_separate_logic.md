# Keep the logic out of the window

This calculator is two files:

- **`08_separate_logic.py`** is only the interface: the display, the buttons,
  the key bindings. It has no idea how to do a sum.
- **`calculator_logic.py`** is only the thinking. It knows nothing about
  windows. `press("12+", "3")` returns `"12+3"`; `evaluate("12+3*4")` returns
  `"24"`. Plain values in, plain values out.

The button callback just joins the two:

```python
def on_key(key):
    display.set(press(display.get(), key))
```

## Why bother?

- **You can test it.** Open `calculator_logic.py` from the Files panel and run
  it: it checks itself. A function that returns a value is easy to test. A
  button that changes a label is not.
- **You can trace it.** A tkinter program can't be stepped through in Coder,
  but `calculator_logic.py` is ordinary Python. Open it and press **Trace** to
  watch `evaluate` work through `12+3*4`, multiplication first.
- **You can change one without breaking the other.** A different layout, a
  text version, or another interface altogether can reuse the same logic. This
  is how large programs, and good A-level projects, are built.

## The loop-and-lambda trap

```python
for key in row:
    tk.Button(root, text=key, command=lambda key=key: on_key(key))
```

Without `key=key`, every button would type the *last* key in the loop. A plain
`lambda: on_key(key)` looks up `key` when it is **clicked**, by which time the
loop has finished. `key=key` saves the current value inside each lambda as it
is made.

## Try this

- Add a `"."` key. What does `press` need to refuse (two dots in one number)?
- Add a backspace key. It only needs a change in `calculator_logic.py`, plus a
  button.
- Write your own check at the bottom of `calculator_logic.py` for `"10-2-3"`.
  Should it be `5`?
