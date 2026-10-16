from p5 import *

y = 450        # where the sun's centre starts: below the bottom of the canvas


def setup():
    size(400, 400)


def draw():
    global y
    background(135, 206, 235)
    # Draw the sun, then the ground in front of it, then move the sun up.


run()
