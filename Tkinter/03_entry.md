# Typing: Entry and StringVar

An **Entry** is a one-line box to type in. It replaces `input()`, with one big
difference: `input()` stops the program and waits, but an Entry just sits
there. You decide *when* to read it, usually in a button's callback.

## Reading and changing an Entry

| Code | Does |
| --- | --- |
| `name_box.get()` | the text in the box, **always a string** |
| `name_box.delete(0, tk.END)` | clear it: delete from position 0 to the end |
| `name_box.insert(0, "Ada")` | put text in at position 0 |
| `name_box.focus()` | put the cursor in it, ready to type |

`.get()` returns a string even if the user typed a number, so use `int()` or
`float()` to convert it, just as you would with `input()`. Page 7 shows what
to do when they type something that isn't a number.

## StringVar: a variable the window watches

```python
message = tk.StringVar(value="...")
tk.Label(root, textvariable=message)
...
message.set("Hello, Ada!")
```

Give a widget `textvariable=` instead of `text=` and it always shows the
variable's current value. `message.set(...)` updates the label straight away,
wherever it is. `message.get()` reads it back. There are `IntVar`, `DoubleVar`
and `BooleanVar` too.

This fixes the `global` problem from page 2: the StringVar object never
changes, only its value does, so a function can call `.set()` on it with no
`global` needed.

## Events: pressing Enter

```python
name_box.bind("<Return>", lambda event: greet())
```

`bind` connects an **event** to a function. `"<Return>"` is the Enter key.
The function is given an `event` object (with details such as which key was
pressed), which is why the lambda takes one argument. Page 11 does much more
with events.

## Try this

- Refuse names longer than 20 characters.
- Add a second Entry for age, and reply "Hello, Ada, next year you will be 14".
- Make the greeting appear in a random colour each time (`import random`).
