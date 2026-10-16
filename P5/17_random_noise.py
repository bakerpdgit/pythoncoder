from p5 import *

t = 0


def setup():
    size(400, 400)
    frame_rate(30)


def draw():
    global t
    background(10, 10, 40)

    # random_seed() makes random() give the same numbers every frame, so the
    # stars stay still. Take it out and they jump about.
    random_seed(7)
    no_stroke()
    for i in range(150):
        fill(255, random(80, 255))            # random(low, high)
        circle(random(width), random(height), random(1, 4))

    # noise() is smooth randomness: nearby inputs give nearby outputs, which
    # makes hills, clouds and wandering instead of static.
    fill(40, 120, 60)
    begin_shape()
    vertex(0, height)
    for x in range(0, width + 10, 10):
        vertex(x, 250 + noise(x * 0.01, t) * 120)
    vertex(width, height)
    end_shape(CLOSE)

    # A firefly that wanders: noise() for x and y, far apart in the noise.
    fx = noise(t) * width
    fy = noise(t + 100) * 250
    fill(255, 255, 120)
    circle(fx, fy, 12)
    t = t + 0.01


run()
