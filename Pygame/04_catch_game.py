# Catch the falling blocks - a small but complete game.
import pygame
import random

WIDTH = 640
HEIGHT = 480

BACKGROUND = (18, 24, 38)
PADDLE_COLOUR = (96, 165, 250)
BLOCK_COLOUR = (250, 204, 21)
WHITE = (226, 232, 240)
GREY = (100, 116, 139)

PADDLE_SPEED = 7
BLOCK_SIZE = 40
SPAWN_EVERY = 45          # frames between new blocks
START_LIVES = 3
START_SPEED = 4

pygame.init()
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Catch the blocks")
clock = pygame.time.Clock()

font = pygame.font.Font(None, 32)
big_font = pygame.font.Font(None, 64)


def draw_text(message, which_font, colour, centre_x, centre_y):
    """Render one line of text and centre it on a point."""
    picture = which_font.render(message, True, colour)
    box = picture.get_rect()
    box.center = (centre_x, centre_y)
    screen.blit(picture, box)


def new_block():
    """A new block, just above the top of the screen, at a random place."""
    left = random.randint(0, WIDTH - BLOCK_SIZE)
    return pygame.Rect(left, -BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE)


paddle = pygame.Rect(270, HEIGHT - 40, 100, 18)
blocks = [new_block()]
score = 0
lives = START_LIVES
fall_speed = START_SPEED
spawn_timer = 0
playing = True

running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_q:
                running = False
            elif event.key == pygame.K_r and not playing:
                # Starting again means putting every variable back as it was.
                blocks = [new_block()]
                score = 0
                lives = START_LIVES
                fall_speed = START_SPEED
                spawn_timer = 0
                paddle.centerx = WIDTH // 2
                playing = True

    if playing:
        keys = pygame.key.get_pressed()
        if keys[pygame.K_LEFT] or keys[pygame.K_a]:
            paddle.x = paddle.x - PADDLE_SPEED
        if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
            paddle.x = paddle.x + PADDLE_SPEED
        paddle.clamp_ip(screen.get_rect())

        spawn_timer = spawn_timer + 1
        if spawn_timer >= SPAWN_EVERY:
            spawn_timer = 0
            blocks.append(new_block())

        # Walk the list BACKWARDS. Removing an item shuffles everything after
        # it down one place, which would make a forwards loop skip a block.
        for index in range(len(blocks) - 1, -1, -1):
            block = blocks[index]
            block.y = block.y + fall_speed

            if block.colliderect(paddle):
                blocks.pop(index)
                score = score + 1
                fall_speed = START_SPEED + score // 5
            elif block.top > HEIGHT:
                blocks.pop(index)
                lives = lives - 1

        if lives <= 0:
            playing = False

    screen.fill(BACKGROUND)
    for block in blocks:
        pygame.draw.rect(screen, BLOCK_COLOUR, block, border_radius=6)
    pygame.draw.rect(screen, PADDLE_COLOUR, paddle, border_radius=9)

    screen.blit(font.render("Score: " + str(score), True, WHITE), (16, 14))
    screen.blit(font.render("Lives: " + str(lives), True, WHITE), (WIDTH - 130, 14))

    if not playing:
        draw_text("GAME OVER", big_font, WHITE, WIDTH // 2, HEIGHT // 2 - 30)
        draw_text(
            "you caught " + str(score) + " - press R to play again",
            font, GREY, WIDTH // 2, HEIGHT // 2 + 25,
        )

    pygame.display.flip()
    clock.tick(60)

pygame.quit()
