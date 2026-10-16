from p5 import *

PALETTE = [(0, 0, 0), (230, 30, 30), (30, 150, 30), (30, 80, 230), (255, 190, 0)]
colour = PALETTE[0]


def setup():
    size(400, 400)
    background(255)


def draw():
    # No background() here: everything drawn stays, so the mouse paints.
    no_stroke()
    for i in range(len(PALETTE)):
        fill(*PALETTE[i])
        square(10 + i * 40, 10, 30)

    if mouse_is_pressed and mouse_y > 50:
        stroke(*colour)
        stroke_weight(6)
        # pmouse_x and pmouse_y are where the mouse was on the last frame, so
        # this joins the dots even when the mouse moves quickly.
        line(pmouse_x, pmouse_y, mouse_x, mouse_y)


def mouse_pressed():
    # Called once for each click: is it on one of the colours?
    global colour
    if 10 <= mouse_y <= 40:
        i = (mouse_x - 10) // 40
        if 0 <= i < len(PALETTE):
            colour = PALETTE[i]


def double_clicked():
    background(255)       # a double-click wipes the page


run()
