# Your first turtle

The `turtle` module draws by moving a small robot — the *turtle* — around a
window. Wherever it goes it drags a pen behind it, so its path becomes a line.

Three things happen before any drawing can start:

1. `import turtle` makes the library available.
2. `turtle.Screen()` hands back a variable for the **window**, which
   `screen.setup(WIDTH, HEIGHT)` then sizes in pixels.
3. `turtle.Turtle()` creates **your own turtle** and gives it a name.

That last step matters. You will see shorter code online that calls
`turtle.forward(100)` and drives an invisible default turtle instead. Edexcel's
Programming Language Subset always creates a named turtle and works through it —
`leo.forward(150)` — so that is the style used throughout this book. It is also
the only style that lets you have more than one turtle at once, which we get to
later on.

## The two commands here

- `leo.forward(150)` — move 150 pixels in whichever direction the turtle is
  already facing.
- `leo.right(90)` — turn 90 degrees clockwise, without moving.

A new turtle starts in the middle of the window facing **east** (to the right),
and angles are measured counterclockwise. Edexcel calls this *standard* mode.
(The PLS also lists `turtle.mode("logo")`, which starts the turtle facing north
with clockwise angles; this browser turtle is always in standard mode.)

## Why four repeats?

A square has four sides and four corners, so the pattern "forward, turn a
quarter turn" runs four times. The final `right(90)` looks unnecessary — the
square is already closed — but it leaves the turtle facing east again, exactly
as it started. Getting the turtle back to a known state is a habit worth having.

`turtle.done()` is the last line. On a desktop computer it stops the turtle
window from vanishing the moment the program ends. Here the drawing stays on
screen anyway, but the line is included because the PLS expects it.

**Try it:** change `right(90)` to `right(120)` and the four sides to three. What
shape do you get?
