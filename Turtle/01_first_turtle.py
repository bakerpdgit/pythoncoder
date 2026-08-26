# Drawing a square with a turtle of our own.
import turtle

WIDTH = 600
HEIGHT = 600

# First make a window, then make a turtle to draw in it.
screen = turtle.Screen()
screen.setup(WIDTH, HEIGHT)

leo = turtle.Turtle()

# A square: go forward, turn a quarter turn, four times over.
leo.forward(150)
leo.right(90)
leo.forward(150)
leo.right(90)
leo.forward(150)
leo.right(90)
leo.forward(150)
leo.right(90)

turtle.done()
