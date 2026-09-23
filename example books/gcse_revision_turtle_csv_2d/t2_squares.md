# Turtle 2: A row of squares

**Level: simple - complete the missing lines**

The program asks the user how many squares to draw (1 to 8). It then draws that many filled squares in a row, going from left to right. For example, with 5 squares:

![preview](turtlepreview)

The squares alternate in colour: the first is **red**, the second **blue**, the third **red**, and so on. Each square is `SIZE` (40) pixels wide with a `GAP` (10) of pixels between squares. The first square has its bottom-left corner at (`START_X`, `START_Y`).

## What to do

Most of the program has been written for you. Replace each `pass` and numbered comment with the missing code.

(1) Inside `drawSquare`, draw the four sides: move forward by `size`, then turn **left** 90 degrees.

(2) Choose the colour: `"red"` when `count` is even, otherwise `"blue"`. The `%` (MOD) operator gives the remainder after dividing.

(3) Call `drawSquare` with the correct four arguments.

(4) Add one square and one gap to `xPos`, ready for the next square.

## Checking your work

Try 5, 2 and 1 squares. With 5 your drawing should match the picture above exactly. If your squares hang below the line, you turned right instead of left.

When you have finished, compare your program with the model solution on the next page.
