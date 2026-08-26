# Rectangles, collisions and text on the screen.
import pygame

WIDTH = 640
HEIGHT = 400

BACKGROUND = (18, 24, 38)
RED = (248, 113, 113)
BLUE = (96, 165, 250)
WHITE = (226, 232, 240)
GREY = (100, 116, 139)

pygame.init()
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Rectangles and text")
clock = pygame.time.Clock()

# A Rect holds a position AND a size: Rect(left, top, width, height).
red_block = pygame.Rect(40, 165, 70, 70)
blue_block = pygame.Rect(530, 165, 70, 70)

red_speed = 3
blue_speed = -4
hits = 0

# Font(None, size) asks for pygame's own built-in font at that size.
score_font = pygame.font.Font(None, 40)
label_font = pygame.font.Font(None, 24)

running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    # A Rect is moved by changing one of its attributes. .x is the left
    # edge; .left, .right, .top, .bottom, .centerx and .center all work too,
    # and setting any one of them slides the whole rectangle.
    red_block.x = red_block.x + red_speed
    blue_block.x = blue_block.x + blue_speed

    # colliderect() is True whenever two rectangles overlap. This is how
    # nearly every 2D game decides that two things have touched.
    if red_block.colliderect(blue_block):
        red_speed = -red_speed
        blue_speed = -blue_speed
        hits = hits + 1

    # Bounce off the side walls as well.
    if red_block.left < 0 or red_block.right > WIDTH:
        red_speed = -red_speed
    if blue_block.left < 0 or blue_block.right > WIDTH:
        blue_speed = -blue_speed

    screen.fill(BACKGROUND)
    pygame.draw.rect(screen, RED, red_block, border_radius=8)
    pygame.draw.rect(screen, BLUE, blue_block, border_radius=8)

    # Text is not printed - it is rendered into a little picture (a Surface)
    # and then blitted (copied) onto the screen at a position.
    counter = score_font.render("Hits: " + str(hits), True, WHITE)
    screen.blit(counter, (20, 20))

    reading = label_font.render(
        "red.x = " + str(red_block.x) + "   blue.x = " + str(blue_block.x), True, GREY
    )
    screen.blit(reading, (20, HEIGHT - 34))

    pygame.display.flip()
    clock.tick(60)

pygame.quit()
