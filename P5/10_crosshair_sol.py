from p5 import *


def setup():
    size(400, 400)


def draw():
    background(0)
    stroke(0, 255, 0)
    stroke_weight(2)
    line(mouse_x, 0, mouse_x, height)
    line(0, mouse_y, width, mouse_y)
    no_fill()
    circle(mouse_x, mouse_y, 60)
    if mouse_is_pressed:
        no_stroke()
        fill(255, 0, 0)
        circle(mouse_x, mouse_y, 20)


run()
