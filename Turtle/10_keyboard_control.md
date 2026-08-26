# Driving the turtle with the keyboard

Every program so far drew its picture and stopped. This one waits for **you**.

Click on the drawing area first so it has the keyboard focus, then:

| Key      | What it does                  |
| -------- | ----------------------------- |
| `w` or ↑ | forward                       |
| `s` or ↓ | backward                      |
| `a` or ← | turn left                     |
| `d` or → | turn right                    |
| `u`      | pen up — move without drawing |
| `n`      | pen down — draw again         |
| `c`      | clear and start over          |

Press **Stop** when you have finished.

Because it waits for keys, this program always runs on the main thread, so
**Debug** and **Trace** are not offered for it.

## Beyond the PLS

`onkey()` and `listen()` are **not** in Edexcel's Programming Language Subset,
so you would not be asked about them in an exam. Everything the turtle itself
does here — `forward`, `back`, `left`, `right`, `penup`, `pendown`, `reset` — is
straight out of the list you have been using all along.

## How it works

Reacting to a key is a different shape of program from the ones you have
written. Instead of the code deciding what happens next, the _user_ does, so you
hand the library a subprogram and it calls that subprogram when the key is
pressed:

```python
def go_forward():
    leo.forward(STEP)

screen.onkey(go_forward, "w")
```

Look closely at `onkey(go_forward, "w")`. There are **no brackets** after
`go_forward`. `go_forward()` with brackets would run it immediately and pass on
whatever it returned; `go_forward` without brackets passes the subprogram
itself, so the library can call it later. Getting this wrong is the classic
mistake here — the turtle jumps once when the program starts and then never
responds again.

Then:

```python
screen.listen()
```

Nothing at all happens until `listen()` is called. It tells the window to start
watching the keyboard.

## Key names

Letter keys are named by the letter: `"w"`, `"a"`, `"c"`. Arrow keys are named
differently depending on where the program runs — a desktop Python window calls
them `"Up"`, `"Down"`, `"Left"` and `"Right"`, while a browser reports them as
`"ArrowUp"` and so on. This program registers both spellings for every arrow, so
it works in either place.

**Try it:**

- Add `screen.onkey(...)` calls that switch pen colour, so you can draw in more
  than one colour.
- Add a `speed_up()` subprogram that increases `STEP`. You will need `global
STEP` inside it, because it is assigning to a variable defined outside.
