# Buttons and callbacks

A button is only useful if something happens when you click it. You tell it
*what* with `command=`:

```python
def add_one():
    ...

tk.Button(root, text="Click me", command=add_one)
```

A function you hand over like this, for tkinter to call later, is called a
**callback**. Your program does not call `add_one` itself. tkinter calls it
each time the button is clicked, from inside `mainloop()`.

## The most common mistake

```python
tk.Button(root, text="Click me", command=add_one())   # wrong!
```

The brackets **call** the function straight away, once, while the button is
being made, and hand the button whatever `add_one` returns, which is `None`.
The button then does nothing. Write the **name** of the function, with no
brackets.

## Passing a value: `lambda`

Sometimes the function needs to know which button was pressed. `command=say("red")`
has the same problem as above, so wrap the call in a tiny function made on the
spot with `lambda`:

```python
tk.Button(root, text="Red", command=lambda: say("red"))
```

`lambda: say("red")` means "a function that, when called, calls
`say("red")`". The call is delayed until the click.

## Changing a widget later: `config`

`counter.config(text="Clicks: 3")` changes an option on a widget that already
exists. Any option you could give when making the widget can be changed this way.

## Why `global`?

`clicks` lives outside the functions. Reading it inside a function is fine,
but *assigning* to it (`clicks = clicks + 1`) would make a new local variable
unless you say `global clicks` first. Page 3 shows a tidier way to keep a value
that the window shows.

## pack(side=...)

`pack()` stacks widgets from the top by default. `side="left"` and
`side="right"` pack against the sides instead. Look at where the Red and Blue
buttons end up.

## Try this

- Add a "−1" button that takes one away, but never goes below zero.
- Make the counter turn red once it passes 10 (`counter.config(fg="red")`).
- Add a third colour button using `lambda`.
