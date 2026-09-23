# Turtle 3: Archery target

**Level: medium - the task is described, you write the code**

Write a program that draws an archery target made of rings.

With 5 rings, the finished target looks like this:

![preview](turtlepreview)

## Requirements

Ask the user how many rings to draw using the prompt `How many rings (1-5)? `

If the number is not between 1 and 5, display `Invalid - enter a number from 1 to 5` and ask again. Keep asking until a valid number is entered.

Display `Drawing a target with 3 rings` (using the number entered).

Draw the target as filled circles, all centred on (0, 0). Each ring is `RING_WIDTH` (30) pixels wide, so with 3 rings the circles have radii 90, 60 and 30.

Draw the **largest circle first** so that each smaller circle is drawn on top of it.

Colour the circles alternately, starting from the outside: **red**, **white**, **red**, **white**, ... Every circle has a **black** outline so the white rings are visible.

Hide the turtle when the drawing is finished.

## Useful turtle commands

`turtle.circle(r)` draws a circle of radius r. The turtle draws it anticlockwise, starting at the **bottom** of the circle while facing east. So to draw a circle **centred** on (0, 0), first lift the pen and move to (0, -r).

`turtle.pencolor("black")` sets the outline colour and `turtle.fillcolor(colour)` sets the fill colour. Call `turtle.begin_fill()` **after** moving to the start of the circle and `turtle.end_fill()` after drawing it.

## Example run

```
How many rings (1-5)? 7
Invalid - enter a number from 1 to 5
How many rings (1-5)? 3
Drawing a target with 3 rings
```

## Checking your work

Enter 5 rings: your target should match the picture above. Then try 7 followed by 3 (you should get one `Invalid` message), then 4 and 1. With 4 rings the outer ring is still red, so the colours alternate red, white, red, white from the outside in.

When you have finished, compare your program with the model solution on the next page.
