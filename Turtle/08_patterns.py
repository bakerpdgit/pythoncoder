# A pattern built from a loop inside a loop.
import turtle

screen = turtle.Screen()
screen.setup(600, 600)

leo = turtle.Turtle()

# 0 is the fastest speed of all. "fastest" means the same thing.
leo.speed(0)
leo.hideturtle()
leo.pencolor("purple")

SHAPES = 24
SIZE = 160

# The inner loop draws one square; the outer loop repeats it, nudging the
# turtle round a little each time so the squares fan out into a rosette.
for shape in range(SHAPES):
    for side in range(4):
        leo.forward(SIZE)
        leo.left(90)
    leo.left(360 / SHAPES)

leo.showturtle()

turtle.done()
