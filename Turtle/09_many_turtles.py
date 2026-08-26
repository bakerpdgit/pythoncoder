# More than one turtle, drawing in the same window.
import turtle

WIDTH = 800
HEIGHT = 500

screen = turtle.Screen()
screen.setup(WIDTH, HEIGHT)

# Each turtle is its own object with its own position, heading and colour.
red_turtle = turtle.Turtle()
red_turtle.pencolor("red")
red_turtle.pensize(3)
red_turtle.speed(4)
red_turtle.penup()
red_turtle.setposition(-330, 0)
red_turtle.setheading(0)
red_turtle.pendown()

blue_turtle = turtle.Turtle()
blue_turtle.pencolor("blue")
blue_turtle.pensize(3)
blue_turtle.penup()
blue_turtle.setposition(-330, 0)
blue_turtle.setheading(0)
blue_turtle.pendown()

# One loop moves both of them, a step at a time, so they appear to travel
# together. They turn opposite ways, so their paths mirror each other.
for step in range(32):
    red_turtle.forward(21)
    red_turtle.left(1.2)

    blue_turtle.forward(21)
    blue_turtle.right(1.2)

red_turtle.hideturtle()
blue_turtle.hideturtle()

turtle.done()
