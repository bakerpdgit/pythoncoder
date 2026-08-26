# Filling a shape with colour.
import turtle

screen = turtle.Screen()
screen.setup(600, 600)

leo = turtle.Turtle()
leo.speed(4)
leo.pensize(4)

# A filled triangle. begin_fill() before the shape, end_fill() after it.
leo.penup()
leo.setposition(-230, -90)
leo.setheading(0)
leo.pendown()

leo.pencolor("black")
leo.fillcolor("gold")
leo.begin_fill()
for side in range(3):
    leo.forward(190)
    leo.left(120)
leo.end_fill()

# The fill is painted on top of the outline, so the black pen has vanished.
# Drawing the shape a second time puts the outline back over the fill.
for side in range(3):
    leo.forward(190)
    leo.left(120)

# A filled square, with no outline drawn over it for comparison.
leo.penup()
leo.setposition(40, -90)
leo.setheading(0)
leo.pendown()

leo.pencolor("navy")
leo.fillcolor("cyan")
leo.begin_fill()
for side in range(4):
    leo.forward(170)
    leo.left(90)
leo.end_fill()

turtle.done()
