from p5 import *


def setup():
    size(400, 400)


def draw():
    background(255)
    square(100, 200, 200)                  # the walls
    triangle(100, 200, 200, 80, 300, 200)  # the roof
    rect(175, 300, 50, 100)                # the door
    square(125, 230, 40)                   # left window
    square(235, 230, 40)                   # right window
    circle(340, 60, 60)                    # the sun


run()
