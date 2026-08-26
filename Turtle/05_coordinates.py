# Sending the turtle to exact coordinates.
import turtle

screen = turtle.Screen()
screen.setup(600, 600)

leo = turtle.Turtle()
leo.speed(5)
leo.pencolor("navy")

# (0, 0) is the middle of the window. x grows to the right, y grows upwards.
corners = [(-220, -220), (140, -220), (140, 140), (-220, 140)]

for corner in corners:
    x = corner[0]
    y = corner[1]

    # Jump to the corner without drawing a line across the window.
    leo.penup()
    leo.setposition(x, y)
    leo.pendown()

    # setheading() sets the direction outright: 0 is east, 90 is north.
    leo.setheading(0)

    for side in range(4):
        leo.forward(80)
        leo.left(90)

# home() sends the turtle back to (0, 0) facing east.
leo.penup()
leo.home()
leo.pendown()
leo.pencolor("red")
leo.setheading(45)
leo.forward(120)

turtle.done()
