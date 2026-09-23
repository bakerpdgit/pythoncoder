# LIBRARIES
import turtle

# CONSTANTS
SIDES = 6
SIDE_LENGTH = 80
ANGLE = 360 / SIDES
COLOUR = "orange"

# MAIN
turtle.color(COLOUR)
turtle.begin_fill()

for count in range(SIDES):
    turtle.forward(SIDE_LENGTH)
    turtle.left(ANGLE)

turtle.end_fill()
turtle.hideturtle()
turtle.done()
