# Pygame learning book

Five examples introducing pygame, from a bouncing ball to a playable Tetris.
All five are examples rather than assessed activities, in the same style as the
[Turtle](../Turtle/README.md) book.

Pygame is **not** in Edexcel's GCSE Programming Language Subset — unlike the
Turtle book, none of this is exam content. It is here because a game loop is the
clearest way to meet ideas that *are* assessed: lists of objects, 2D data
structures, flags and program state, and subprograms that answer a question
before you act on the answer.

## The progression

| # | Page | Introduces |
| --- | --- | --- |
| 1 | A ball that bounces | `init`, `set_mode`, the game loop, events, `draw.circle`, `flip`, `Clock` |
| 2 | Rectangles, collisions and text | `Rect` and its edge attributes, `colliderect`, `font.Font`, `render`, `blit` |
| 3 | Taking control of the keyboard | `KEYDOWN` events vs `key.get_pressed()`, `clamp_ip` |
| 4 | A whole game: catch the blocks | lists of rects, `random`, spawn timers, score and lives, state flags, restart |
| 5 | Tetris | a grid as a list of lists, rotation, "check then commit", clearing rows |

Pages 1 and 2 run themselves. Pages 3, 4 and 5 are all driven from the
keyboard, each one adding to the same two techniques introduced on page 3.

The two big transferable ideas are deliberately split across the last two pages:
page 4 removes items from a list by walking it **backwards**, page 5 does it by
**keeping the survivors**. The page 5 guide points back at page 4 so the two can
be compared.

## Running these in the browser

A pygame program takes over the main page thread, so the app switches to its
Pygame Canvas view for the duration of a run and **Debug and Trace are not
available** — the same rule that already applies to canvas-mode turtle. Press
**Stop** to end a run.

**Click inside the canvas before typing.** Keyboard events only reach the
program once the canvas has focus, which catches students on page 3.

Two details of the browser runtime are worth knowing if you are adapting these
or writing your own:

- `pygame.time.Clock` is replaced by a browser-friendly stand-in, and any
  `while` loop containing `display.flip()` or `clock.tick()` has an `await`
  woven into it so the page keeps repainting. A game loop that calls neither
  would freeze the tab.
- A `while` loop nested *inside* the game loop must be able to finish within one
  frame. Page 5's hard drop is one, and its guide explains why that particular
  loop is safe.

`pygame.font` works, so `Font(None, size)` and `SysFont` are both available.

## Student links

To open this book with **Run** as the default run button, append this query
string to the deployed Coder URL:

```text
?book=https%3A%2F%2Fraw.githubusercontent.com%2Fbakerpdgit%2Fpythoncoder%2Fmain%2FPygame%2Fbook.json&mode=run&showFirst=true
```

To send students straight to one page, add `challenge=` with that page's `id`
from `book.json` (for example `challenge=pygame-tetris`). Keep `book=` pointing
at the root `book.json` — completion ticks are recorded against it.

You do not have to build these by hand: right-click any page or the book name in
the Book panel and choose *Create student link to here…*, or use **Student
links** in the Teacher Tools panel.
