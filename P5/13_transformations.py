from p5 import *


def setup():
    size(400, 400)
    angle_mode(DEGREES)       # rotate() in degrees, not radians


def draw():
    background(245)

    # translate() moves (0, 0). Everything after it is drawn relative to the new origin.
    push()                    # remember how things were...
    translate(100, 100)
    rotate(frame_count)       # one degree further every frame
    rect_mode(CENTER)
    fill(255, 100, 100)
    square(0, 0, 80)          # a square spinning about its own centre
    pop()                     # ...and put them back

    # A clock face: rotate, draw a tick, rotate again.
    push()
    translate(270, 270)
    stroke_weight(4)
    for i in range(12):
        line(0, -100, 0, -85)
        rotate(30)            # 360 / 12
    # The hands, turned to the real time.
    stroke(200, 0, 0)
    push()
    rotate(second() * 6)
    line(0, 0, 0, -90)
    pop()
    stroke(0)
    push()
    rotate(minute() * 6)
    line(0, 0, 0, -75)
    pop()
    push()
    rotate((hour() % 12) * 30 + minute() / 2)
    line(0, 0, 0, -50)
    pop()
    pop()

    # scale() makes everything bigger or smaller.
    push()
    translate(80, 300)
    for i in range(4):
        fill(100, 100, 255, 120)
        circle(0, 0, 40)
        translate(30, 0)
        scale(1.3)
    pop()


run()
