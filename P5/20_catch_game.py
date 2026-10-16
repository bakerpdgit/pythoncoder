from p5 import *

BASKET_W = 80
stars = []
score = 0
lives = 3


def new_star():
    return {"x": random(20, width - 20), "y": -20, "speed": random(2, 5)}


def setup():
    size(400, 500)
    for i in range(3):
        stars.append(new_star())


def draw():
    global score, lives
    background(15, 15, 50)

    basket_x = constrain(mouse_x, BASKET_W / 2, width - BASKET_W / 2)
    fill(200, 120, 40)
    no_stroke()
    rect(basket_x - BASKET_W / 2, height - 30, BASKET_W, 20, 5)

    fill(255, 230, 0)
    for star in stars:
        star["y"] = star["y"] + star["speed"]
        circle(star["x"], star["y"], 20)
        caught = star["y"] > height - 40 and abs(star["x"] - basket_x) < BASKET_W / 2
        if caught:
            score = score + 1
            star.update(new_star())
        elif star["y"] > height:
            lives = lives - 1
            star.update(new_star())

    fill(255)
    text_size(18)
    text("Score: " + str(score), 10, 28)
    text_align(RIGHT)
    text("Lives: " + str(lives), width - 10, 28)
    text_align(LEFT)

    if lives <= 0:
        text_align(CENTER, CENTER)
        text_size(40)
        fill(255, 80, 80)
        text("Game over", width / 2, height / 2)
        text_size(18)
        fill(255)
        text("Score " + str(score) + ". Click to play again.", width / 2, height / 2 + 40)
        text_align(LEFT, BASELINE)
        no_loop()


def mouse_pressed():
    global score, lives
    if lives <= 0:
        score = 0
        lives = 3
        for star in stars:
            star.update(new_star())
        loop()


run()
