# Lifting the pen, so the turtle can move without leaving a line.
import turtle

screen = turtle.Screen()
screen.setup(600, 600)

leo = turtle.Turtle()
leo.speed(3)

# Start over on the left of the window.
leo.penup()
leo.setposition(-250, 0)
leo.pendown()

# A dashed line: draw 30, skip 30, eight times over.
for dash in range(8):
    leo.pendown()
    leo.forward(30)
    leo.penup()
    leo.forward(30)

# Travel somewhere new without drawing on the way.
leo.penup()
leo.left(90)
leo.forward(120)
leo.pendown()

# back() reverses without turning the turtle round first.
leo.back(240)

turtle.done()
