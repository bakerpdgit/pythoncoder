from p5 import *


def setup():
    size(200, 400)


def draw():
    background(200, 230, 255)

    no_stroke()
    fill(80)
    rect(90, 300, 20, 100)          # the pole
    fill(30)
    rect(50, 40, 100, 270, 15)      # the box, with rounded corners

    stroke(0)
    stroke_weight(3)
    fill(255, 0, 0)
    circle(100, 100, 70)            # red
    fill(255, 165, 0)
    circle(100, 175, 70)            # amber
    fill(0, 200, 0)
    circle(100, 250, 70)            # green


run()
