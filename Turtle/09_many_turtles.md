# More than one turtle

Here is the payoff for creating your own turtle rather than driving the default
one. `turtle.Turtle()` can be called as many times as you like, and each call
makes a **separate** turtle with its own position, heading, pen and colour:

```python
red_turtle = turtle.Turtle()
blue_turtle = turtle.Turtle()
```

Everything after that is ordinary object work: `red_turtle.forward(22)` moves
only the red one, and `blue_turtle.pencolor("blue")` only affects the blue one.
Code written against the default turtle can never do this, because there is only
one of it.

## Making them move together

A computer runs one line at a time, so the turtles are not truly moving at the
same moment. Putting both of them in one loop, a short step each per pass, is
close enough to look simultaneous:

```python
for step in range(30):
    red_turtle.forward(22)
    red_turtle.left(11)

    blue_turtle.forward(22)
    blue_turtle.right(11)
```

Move one turtle's whole journey into its own loop and it will finish completely
before the other one starts. Try it and compare.

## A wider window

This example uses a window 800 wide by 500 tall:

```python
screen = turtle.Screen()
screen.setup(WIDTH, HEIGHT)
```

The window and the drawing canvas inside it are two different things. `setup()`
sizes the **window**; `turtle.screensize(width, height)` sizes the scrollable
**canvas** within it, which on a desktop lets you draw a picture bigger than the
window and scroll around it. In this browser turtle the two are the same thing,
so `setup()` is all you need.

**Try it:** add a third turtle that goes straight down the middle in green.
