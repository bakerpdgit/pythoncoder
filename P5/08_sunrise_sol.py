from p5 import *

y = 450


def setup():
    size(400, 400)


def draw():
    global y
    background(135, 206, 235)
    no_stroke()
    fill(255, 200, 0)
    circle(200, y, 100)       # the sun
    fill(34, 139, 34)
    rect(0, 300, 400, 100)    # the ground, in front of the sun
    if y > 100:
        y = y - 2


run()
