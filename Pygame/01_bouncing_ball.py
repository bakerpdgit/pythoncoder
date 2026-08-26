# A ball bouncing around a pygame window.
import pygame

WIDTH = 640
HEIGHT = 480

BACKGROUND = (18, 24, 38)
BALL_COLOUR = (250, 204, 21)
RADIUS = 20

# Every pygame program starts the same way: start the library, make a
# window to draw in, and make a clock to keep the speed steady.
pygame.init()
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Bouncing ball")
clock = pygame.time.Clock()

# Where the ball is, and how far it moves each frame.
x = 320
y = 240
dx = 4
dy = 3

running = True
while running:
    # 1. HANDLE EVENTS - anything the user has done since the last frame.
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    # 2. UPDATE - move the ball, then turn it round if it has hit an edge.
    x = x + dx
    y = y + dy

    if x - RADIUS < 0 or x + RADIUS > WIDTH:
        dx = -dx
    if y - RADIUS < 0 or y + RADIUS > HEIGHT:
        dy = -dy

    # 3. DRAW - paint the whole picture again, from the back forwards.
    screen.fill(BACKGROUND)
    pygame.draw.circle(screen, BALL_COLOUR, (x, y), RADIUS)

    # Nothing appears until the finished picture is shown.
    pygame.display.flip()

    # Wait just long enough that the loop runs about 60 times a second.
    clock.tick(60)

pygame.quit()
