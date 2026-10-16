from p5 import *


def setup():
    size(400, 400)


def draw():
    background(255)
    no_stroke()
    for row in range(8):
        for col in range(8):
            if (row + col) % 2 == 0:
                fill(255)
            else:
                fill(0)
            square(col * 50, row * 50, 50)


run()
