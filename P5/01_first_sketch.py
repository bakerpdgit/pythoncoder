from p5 import *


def setup():
    # setup() runs once, when the sketch starts.
    size(400, 300)          # a canvas 400 pixels wide and 300 high


def draw():
    # draw() runs over and over, about 60 times a second.
    background(220)              # light grey: 0 is black, 255 is white
    rect(20, 20, 120, 60)        # top-left corner at (20, 20), 120 wide, 60 high
    circle(200, 150, 100)        # centre at (200, 150), 100 pixels across
    ellipse(320, 230, 100, 50)   # centre at (320, 230), 100 wide, 50 high
    line(0, 300, 400, 0)         # from the bottom-left corner to the top-right
    triangle(60, 280, 110, 180, 160, 280)
    point(200, 150)              # a single dot, in the middle of the circle


run()
