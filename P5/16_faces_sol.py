from p5 import *


def draw_face(x, y, size_of_face):
    s = size_of_face
    fill(255, 220, 0)
    stroke(0)
    stroke_weight(2)
    circle(x, y, s)
    fill(0)
    circle(x - s * 0.2, y - s * 0.15, s * 0.12)
    circle(x + s * 0.2, y - s * 0.15, s * 0.12)
    no_fill()
    arc(x, y + s * 0.05, s * 0.5, s * 0.4, 0, PI)


def setup():
    size(400, 400)
    no_loop()


def draw():
    background(135, 206, 250)
    draw_face(100, 200, 120)
    draw_face(250, 150, 80)
    draw_face(330, 280, 100)


run()
