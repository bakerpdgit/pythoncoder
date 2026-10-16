from p5 import *

x = 50
speed = 6


def setup():
    size(400, 200)


def draw():
    global x, speed
    background(240)
    no_stroke()
    fill(0, 0, 255)
    circle(x, 100, 40)
    x = x + speed
    if x > width - 20 or x < 20:
        speed = -speed


run()
