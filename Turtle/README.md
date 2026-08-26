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

- `turtle.mode("standard" / "logo")` — this browser turtle is always in standard
  mode, so calling it would do nothing. Explained in the page 1 guide.
- `turtle.screensize(width, height)` — the window and the drawing canvas are the
  same size here, so it has nothing to do. Explained in the page 9 guide.
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

The app has two turtle renderers (Settings → Turtle mode). Pages 1-9 work in
both. Page 10 needs the **canvas** renderer, because the SVG renderer's
`onkey()` and `listen()` are no-ops with no event loop behind them.

The app now spots this for itself: a turtle program that registers key handlers
runs on the canvas renderer whatever the setting says, and notes in the console
that it has done so. That also means page 10 always runs on the main thread, so
Debug and Trace are unavailable for it — the same rule that already applies to
any turtle program in canvas mode.
