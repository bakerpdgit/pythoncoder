# Turtle learning book

Ten examples covering turtle graphics, in the style of Edexcel's GCSE Computer
Science [Programming Language Subset](https://qualifications.pearson.com/content/dam/pdf/GCSE/Computer%20Science/2020/exam-materials/1cp2-02-programming-langauge-subset-version6-summer20206.pdf)
(pages 15-17). All ten are examples rather than assessed activities.

Two house rules follow the PLS throughout:

- **Use the full command name**, not a shorthand alias. `forward`, not `fd`;
  `penup`, not `pu`; `setposition`, not `goto`.
- **Always create your own turtle** with `turtle.Turtle()` and drive it by name,
  rather than calling module-level functions on the hidden default turtle.

## The progression

| # | Page | Introduces |
| --- | --- | --- |
| 1 | Your first turtle | `Screen`, `setup`, `Turtle`, `forward`, `right`, `done` |
| 2 | Lifting the pen | `penup`, `pendown`, `back`, `setposition` |
| 3 | Loops and angles | `for` loops, `left` vs `right`, the 360/n rule |
| 4 | Colour, thickness and speed | `pencolor`, `pensize`, `speed` |
| 5 | Coordinates | `setposition`, `setheading`, `home` |
| 6 | Filling shapes | `fillcolor`, `begin_fill`, `end_fill` |
| 7 | Circles and arcs | `circle` with radius and extent |
| 8 | Patterns from nested loops | nested loops, `hideturtle`, `showturtle` |
| 9 | More than one turtle | several `Turtle` objects, window vs canvas |
| 10 | Driving with the keyboard | `onkey`, `listen` — beyond the PLS |

Pages 1-9 stay inside the PLS. Page 10 steps outside it deliberately, and says
so; the turtle commands it uses are all still PLS ones.

## PLS commands not exercised in code

- `turtle.mode("standard" / "logo")` — explained, and suggested as an experiment,
  in the page 1 guide.
- `turtle.screensize(width, height)` — the drawing has no scroll bars here, so
  it has little to do. Explained in the page 9 guide.
- `<turtle>.reset()` — used in page 10's clear-and-start-again key, and
  mentioned in page 8's guide.

## Student links

To open this book and make **Run** the default run button, append this query
string to the deployed Coder URL:

```text
?book=https%3A%2F%2Fraw.githubusercontent.com%2Fbakerpdgit%2Fpythoncoder%2Fmain%2FTurtle%2Fbook.json&mode=Run&showFirst=true
```

To send students straight to one page, add `challenge=` with that page's `id`
from `book.json` (for example `challenge=turtle-filling-shapes`). Keep `book=`
pointing at the root `book.json` — completion ticks are recorded against it.

You do not have to build these by hand: right-click any page or the book name in
the Book panel and choose *Create student link to here…*, or use **Student
links** in the Teacher Tools panel.

## A note on turtle mode

Settings → Turtle graphics offers three turtles. The default, **Python turtle**,
is CPython's own `turtle` module running unchanged, so every page behaves as it
does in IDLE: the turtle moves at the speed `speed()` sets, fills sit under
their outlines, unknown colour names are errors, and page 10's keys work.

The two older turtles are still there for programs written for them:

- **Canvas (legacy)** animates once per loop rather than per move and draws no
  turtle; page 10's keys work in it too.
- **SVG (legacy)** can be stepped through in Debug and Trace, with a slider to
  replay the drawing, but does not animate. It has no keyboard events, so a
  program that registers key handlers (page 10) runs with the Python turtle
  instead.

Page 6's guide describes the Python turtle: both legacy turtles paint a fill
*over* its outline.

The Python turtle works in **Debug**, **Trace** and **Run**: stepping through a
drawing shows what each line has drawn, and page 10's key handlers can be
stepped into too. A slider under the Display header replays any drawing one
turtle command at a time.
