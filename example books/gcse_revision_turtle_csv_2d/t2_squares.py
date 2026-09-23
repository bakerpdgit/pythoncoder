# LIBRARIES
import turtle

# CONSTANTS
SIZE = 40
GAP = 10
START_X = -200
START_Y = 0

# GLOBAL VARIABLES
numSquares = 0
xPos = 0
colour = ""

# SUBPROGRAMS
def drawSquare(x, y, size, fillColour):
    # Draws a filled square with its bottom-left corner at (x, y)
    turtle.penup()
    turtle.goto(x, y)
    turtle.pendown()
    turtle.color(fillColour)
    turtle.begin_fill()
    for side in range(4):
        # (1) Move forward by size, then turn LEFT 90 degrees
        pass
    turtle.end_fill()

# MAIN
numSquares = int(input("How many squares (1-8)? "))
xPos = START_X

for count in range(numSquares):
    # (2) Set colour to "red" when count is even, otherwise "blue"

    # (3) Call drawSquare to draw a SIZE square at (xPos, START_Y) in colour

    # (4) Move xPos along by one square and one gap
    pass

turtle.hideturtle()
turtle.done()
