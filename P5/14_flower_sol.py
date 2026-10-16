from p5 import *


def setup():
    size(400, 400)
    angle_mode(DEGREES)


def draw():
    background(255, 250, 240)
    translate(200, 200)
    no_stroke()
    fill(255, 105, 180)
    for i in range(8):
        ellipse(0, -60, 50, 120)
        rotate(45)
    fill(255, 215, 0)
    circle(0, 0, 60)


run()
