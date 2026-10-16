from p5 import *

GRAVITY = Vector(0, 0.3)


class Ball:
    def __init__(self, x, y):
        self.pos = Vector(x, y)                        # where it is
        self.vel = Vector(random(-3, 3), random(-6, -2))   # how it moves each frame
        self.r = random(8, 20)
        self.colour = (random(100, 255), random(100, 255), random(255))

    def update(self):
        self.vel.add(GRAVITY)          # gravity pulls it down a little more every frame
        self.pos.add(self.vel)
        if self.pos.y > height - self.r:
            self.pos.y = height - self.r
            self.vel.y = -self.vel.y * 0.8     # bounce, losing a fifth of its speed
        if self.pos.x < self.r or self.pos.x > width - self.r:
            self.vel.x = -self.vel.x

    def show(self):
        no_stroke()
        fill(*self.colour)
        circle(self.pos.x, self.pos.y, self.r * 2)


balls = []


def setup():
    size(400, 400)


def draw():
    background(20)
    for ball in balls:
        ball.update()
        ball.show()
    fill(255)
    text_size(14)
    text("Click or drag to add balls: " + str(len(balls)), 10, 20)


def mouse_pressed():
    balls.append(Ball(mouse_x, mouse_y))


def mouse_dragged():
    if frame_count % 3 == 0:
        balls.append(Ball(mouse_x, mouse_y))


run()
