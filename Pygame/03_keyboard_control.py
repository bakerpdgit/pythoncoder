# Driving a player around with the keyboard.
import pygame

WIDTH = 640
HEIGHT = 480
SPEED = 5

BACKGROUND = (18, 24, 38)
TRAIL_COLOUR = (51, 65, 85)
WHITE = (226, 232, 240)
COLOURS = [(250, 204, 21), (52, 211, 153), (248, 113, 113), (167, 139, 250)]

pygame.init()
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Keyboard control")
clock = pygame.time.Clock()
info_font = pygame.font.Font(None, 26)

player = pygame.Rect(290, 210, 60, 60)
window = screen.get_rect()
colour_index = 0
trail = []

running = True
while running:
    # A KEYDOWN event happens ONCE, at the instant a key goes down. That is
    # what you want for an action that should not repeat: fire, jump, pause,
    # change colour.
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_SPACE:
                colour_index = (colour_index + 1) % len(COLOURS)
            elif event.key == pygame.K_c:
                trail = []
            elif event.key == pygame.K_q:
                running = False

    # get_pressed() is the other half of the story: it asks which keys are
    # held down RIGHT NOW. Checking it every frame gives smooth movement for
    # as long as the key stays down.
    keys = pygame.key.get_pressed()
    if keys[pygame.K_LEFT] or keys[pygame.K_a]:
        player.x = player.x - SPEED
    if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
        player.x = player.x + SPEED
    if keys[pygame.K_UP] or keys[pygame.K_w]:
        player.y = player.y - SPEED
    if keys[pygame.K_DOWN] or keys[pygame.K_s]:
        player.y = player.y + SPEED

    # clamp_ip() shoves the rectangle back inside the window if it has
    # wandered out, so the player can never leave the screen.
    player.clamp_ip(window)

    # Remember where the player has been, but only the last 150 places.
    trail.append(player.center)
    if len(trail) > 150:
        trail.pop(0)

    screen.fill(BACKGROUND)
    for spot in trail:
        pygame.draw.circle(screen, TRAIL_COLOUR, spot, 4)
    pygame.draw.rect(screen, COLOURS[colour_index], player, border_radius=10)

    help_text = info_font.render(
        "arrows or WASD move   SPACE colour   C clear   Q quit", True, WHITE
    )
    screen.blit(help_text, (16, 14))

    pygame.display.flip()
    clock.tick(60)

pygame.quit()
