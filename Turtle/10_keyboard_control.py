# Driving the turtle with the keyboard.
#
# This goes beyond the Edexcel PLS list: onkey() and listen() are not in it.
# Everything the turtle itself does here is still PLS turtle.
import turtle

screen = turtle.Screen()
screen.setup(600, 600)

leo = turtle.Turtle()
leo.pensize(3)
leo.pencolor("green")

STEP = 20
TURN = 15


# Each key needs a subprogram of its own to call. Note the name is given to
# onkey() WITHOUT brackets: we are handing over the subprogram itself, not
# calling it.
def go_forward():
    leo.forward(STEP)


def go_back():
    leo.back(STEP)


def turn_left():
    leo.left(TURN)


def turn_right():
    leo.right(TURN)


def lift_pen():
    leo.penup()


def drop_pen():
    leo.pendown()


def start_again():
    leo.reset()
    leo.pensize(3)
    leo.pencolor("green")


screen.onkey(go_forward, "w")
screen.onkey(go_back, "s")
screen.onkey(turn_left, "a")
screen.onkey(turn_right, "d")

screen.onkey(lift_pen, "u")
screen.onkey(drop_pen, "n")
screen.onkey(start_again, "c")

# The arrow keys as well. Python names them "Up", "Down", "Left" and "Right".
screen.onkey(go_forward, "Up")
screen.onkey(go_back, "Down")
screen.onkey(turn_left, "Left")
screen.onkey(turn_right, "Right")

# Nothing happens until the screen is told to start watching the keyboard.
screen.listen()

turtle.done()
