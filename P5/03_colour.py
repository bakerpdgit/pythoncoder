from p5 import *


def setup():
    size(400, 300)


def draw():
    background(25, 25, 80)        # three numbers: red, green and blue, each 0 to 255

    no_stroke()                   # no outlines from here on...
    fill(255, 200, 0)             # ...and a yellow fill
    circle(320, 70, 90)           # the sun

    fill(34, 139, 34)             # forest green
    rect(0, 220, 400, 80)         # the grass

    fill("tomato")                # colour names work too
    stroke(255)                   # outlines are back: white...
    stroke_weight(4)              # ...and 4 pixels thick
    rect(60, 140, 100, 80)

    fill(0, 150, 255, 120)        # a fourth number is transparency: 0 invisible, 255 solid
    no_stroke()
    circle(150, 140, 120)         # you can see the house through it

    fill(255)                     # one number is a grey: 255 white
    stroke(0)
    stroke_weight(1)
    rect(240, 160, 50, 60)

    stroke(255, 255, 0)
    stroke_weight(8)
    point(40, 40)                 # a point is a dot as big as the stroke weight
    point(80, 60)
    point(30, 90)


run()
