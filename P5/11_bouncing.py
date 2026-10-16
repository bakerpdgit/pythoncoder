from p5 import *

x = 100
y = 80
x_speed = 4
y_speed = 3
r = 25          # the ball's radius


def setup():
    size(400, 300)


def draw():
    global x, y, x_speed, y_speed
    background(30)

    x = x + x_speed
    y = y + y_speed

    # The ball's edge is r away from its centre, so it bounces when its centre
    # is r from a wall: turning round is just reversing the speed.
    if x > width - r or x < r:
        x_speed = -x_speed
    if y > height - r or y < r:
        y_speed = -y_speed

    # Colour depends on which way it is going.
    if x_speed > 0:
        fill(255, 120, 0)
    else:
        fill(0, 180, 255)
    no_stroke()
    circle(x, y, r * 2)

    # constrain() keeps a number between two others: this bar follows the
    # mouse, but never leaves the canvas.
    bar_x = constrain(mouse_x, 40, width - 40)
    fill(255)
    rect(bar_x - 40, height - 15, 80, 10)


run()
