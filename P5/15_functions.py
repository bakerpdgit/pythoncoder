from p5 import *


def draw_tree(x, y, h):
    """A tree h pixels tall, standing with the bottom of its trunk at (x, y)."""
    no_stroke()
    fill(120, 70, 20)
    rect(x - h * 0.06, y - h * 0.4, h * 0.12, h * 0.4)        # trunk
    fill(30, 140, 50)
    triangle(x - h * 0.3, y - h * 0.3, x, y - h, x + h * 0.3, y - h * 0.3)   # leaves


def setup():
    size(400, 300)
    no_loop()                # nothing moves, so draw() only needs to run once


def draw():
    background(200, 235, 255)
    fill(90, 170, 70)
    rect(0, 250, 400, 50)
    # One function, many trees: only the numbers change.
    draw_tree(60, 250, 120)
    draw_tree(150, 250, 180)
    draw_tree(260, 250, 90)
    for i in range(5):
        draw_tree(300 + i * 22, 250, 40 + i * 10)


run()
