# The same shape, drawn with a loop instead of by hand.
import turtle

screen = turtle.Screen()
screen.setup(600, 600)

leo = turtle.Turtle()
leo.speed(3)

SIDES = 5
LENGTH = 130

# To close any shape the turtle must turn all the way round exactly once,
# so each turn is 360 / SIDES.
leo.penup()
leo.setposition(-220, -60)
leo.pendown()

for side in range(SIDES):
    leo.forward(LENGTH)
    leo.left(360 / SIDES)

# left() and right() turn opposite ways, so this triangle is drawn the
# other way round.
leo.penup()
leo.setposition(60, -60)
leo.setheading(0)
leo.pendown()

for side in range(3):
    leo.forward(LENGTH)
    leo.right(360 / 3)

turtle.done()
