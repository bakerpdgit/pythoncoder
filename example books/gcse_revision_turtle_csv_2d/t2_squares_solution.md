# Turtle 2 solution: A row of squares

A model solution for **Turtle 2**. Run it and enter a number from 1 to 8.

## Worth noticing

`drawSquare` is a procedure with **parameters**: the main program decides where and in what colour, and the subprogram does the drawing. The same four lines draw every square.

`count % 2 == 0` is true for 0, 2, 4, ... so the colours alternate starting with red.

`xPos` is a **running position**: it starts at `START_X` and grows by `SIZE + GAP` after each square. `xPos = START_X + count * (SIZE + GAP)` would work equally well.
