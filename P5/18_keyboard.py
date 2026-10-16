from p5 import *

x = 200
y = 200
colour = (0, 150, 255)


def setup():
    size(400, 400)


def draw():
    global x, y
    background(240)

    # key_is_down() is true for as long as a key is held: smooth movement.
    if key_is_down(LEFT_ARROW):
        x = x - 4
    if key_is_down(RIGHT_ARROW):
        x = x + 4
    if key_is_down(UP_ARROW):
        y = y - 4
    if key_is_down(DOWN_ARROW):
        y = y + 4
    x = constrain(x, 20, width - 20)
    y = constrain(y, 20, height - 20)

    fill(*colour)
    no_stroke()
    square(x - 20, y - 20, 40)

    fill(0)
    text_size(14)
    text("Arrow keys move. Space changes colour.", 10, 20)
    text("Last key: " + str(key) + "   key_code: " + str(key_code), 10, height - 12)


def key_pressed():
    # Called once each time a key goes down: good for one-off actions.
    global colour
    if key == " ":
        colour = (random(255), random(255), random(255))


run()
