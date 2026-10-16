from p5 import *


def setup():
    size(400, 400)


def draw():
    background(255)

    # One loop: a row of ten circles, 40 pixels apart.
    fill(255, 120, 0)
    for i in range(10):
        circle(20 + i * 40, 30, 30)

    # The loop variable can change more than the position: a fade from black to blue.
    no_stroke()
    for i in range(20):
        fill(0, 0, i * 13)
        rect(i * 20, 60, 20, 40)

    # Two loops, one inside the other: a grid. The outer loop picks the row,
    # the inner loop goes along it.
    stroke(0)
    for row in range(5):
        for col in range(8):
            fill(col * 30, row * 50, 150)
            square(10 + col * 48, 120 + row * 48, 40)

    # width and height always hold the canvas size, so this line fits any canvas.
    stroke_weight(3)
    line(0, height - 20, width, height - 20)
    stroke_weight(1)


run()
