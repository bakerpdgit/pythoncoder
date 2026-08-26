# Choosing the colour and thickness of the pen, and how fast the turtle draws.
import turtle

screen = turtle.Screen()
screen.setup(600, 600)

leo = turtle.Turtle()
leo.speed(2)

colours = ["red", "orange", "gold", "green", "blue", "indigo", "purple"]

# Line up on the left, facing down the window.
leo.penup()
leo.setposition(-260, 150)
leo.setheading(0)
leo.right(90)
leo.pendown()

for index in range(len(colours)):
    leo.pencolor(colours[index])
    leo.pensize(index + 1)

    # Draw a stripe downwards, then reverse back up with the pen lifted.
    leo.forward(300)
    leo.penup()
    leo.back(300)

    # Shuffle 70 pixels to the right, ready for the next stripe.
    leo.left(90)
    leo.forward(70)
    leo.right(90)
    leo.pendown()

turtle.done()
