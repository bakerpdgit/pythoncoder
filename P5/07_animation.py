from p5 import *

# Variables made outside the functions keep their values between frames.
x = 0
size_of_ball = 50


def setup():
    size(400, 200)


def draw():
    # draw() changes a variable it did not make, so it has to say so:
    global x

    background(255)               # wipe the last frame (try taking this out)
    fill(255, 100, 0)
    circle(x, 100, size_of_ball)

    x = x + 3                     # next frame, the ball is 3 pixels further on
    if x > width + size_of_ball / 2:
        x = -size_of_ball / 2     # off the right edge: start again from the left

    fill(0)
    text_size(16)
    text("Frame " + str(frame_count), 10, 24)


run()
