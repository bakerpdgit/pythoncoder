from p5 import *


def setup():
    size(400, 400)
    angle_mode(DEGREES)


def draw():
    background(255, 250, 240)
    translate(200, 200)       # (0, 0) is now the middle of the canvas
    no_stroke()
    # Draw eight petals, turning 45 degrees between them, then the middle.


run()
