# Circles and arcs.
import turtle

screen = turtle.Screen()
screen.setup(600, 600)

leo = turtle.Turtle()
leo.speed(6)
leo.pensize(2)

# A whole circle. The centre sits one radius to the LEFT of the turtle,
# so the turtle starts on the edge and curves round to the left.
leo.penup()
leo.setposition(-180, -80)
leo.setheading(0)
leo.pendown()
leo.pencolor("navy")
leo.circle(90)

# Half a circle. The second value is the extent: how many degrees of the
# circle to draw. 180 is half of it.
leo.penup()
leo.setposition(40, -80)
leo.setheading(0)
leo.pendown()
leo.pencolor("red")
leo.circle(90, 180)

# A negative radius puts the centre on the RIGHT instead, so the arc
# curves the other way.
leo.penup()
leo.setposition(40, -80)
leo.setheading(0)
leo.pendown()
leo.pencolor("green")
leo.circle(-90, 180)

turtle.done()
