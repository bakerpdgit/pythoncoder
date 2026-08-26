# A small Tetris. The playfield is a grid: a list of lists.
import pygame
import random

COLS = 10
ROWS = 20
CELL = 24

BOARD_LEFT = 20
BOARD_TOP = 20
PANEL_WIDTH = 180
WIDTH = BOARD_LEFT * 2 + COLS * CELL + PANEL_WIDTH
HEIGHT = BOARD_TOP * 2 + ROWS * CELL

BACKGROUND = (15, 20, 32)
BOARD_COLOUR = (26, 33, 51)
EDGE = (71, 85, 105)
WHITE = (226, 232, 240)
GREY = (100, 116, 139)

FALL_START = 30           # frames between drops when a game begins
LINE_SCORES = [0, 40, 100, 300, 1200]

# Each shape is a small grid of its own: 1 means "there is a block here".
SHAPES = {
    "I": [[1, 1, 1, 1]],
    "O": [[1, 1],
          [1, 1]],
    "T": [[1, 1, 1],
          [0, 1, 0]],
    "S": [[0, 1, 1],
          [1, 1, 0]],
    "Z": [[1, 1, 0],
          [0, 1, 1]],
    "J": [[1, 0, 0],
          [1, 1, 1]],
    "L": [[0, 0, 1],
          [1, 1, 1]],
}

COLOURS = {
    "I": (34, 211, 238),
    "O": (250, 204, 21),
    "T": (192, 132, 252),
    "S": (52, 211, 153),
    "Z": (248, 113, 113),
    "J": (96, 165, 250),
    "L": (251, 146, 60),
}

pygame.init()
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Tetris")
clock = pygame.time.Clock()

small_font = pygame.font.Font(None, 22)
font = pygame.font.Font(None, 28)
big_font = pygame.font.Font(None, 48)

board = pygame.Rect(BOARD_LEFT, BOARD_TOP, COLS * CELL, ROWS * CELL)


def make_grid():
    """An empty playfield: ROWS lists of COLS cells, each one empty (None)."""
    grid = []
    for row in range(ROWS):
        grid.append([None] * COLS)
    return grid


def new_piece():
    """Pick a random shape and start it at the top, near the middle."""
    name = random.choice(list(SHAPES))
    return SHAPES[name], COLOURS[name], 3, 0


def rotate(shape):
    """Turn a shape a quarter turn clockwise.

    The old first column, read from the bottom upwards, becomes the new
    first row.
    """
    height = len(shape)
    width = len(shape[0])
    turned = []
    for col in range(width):
        new_row = []
        for row in range(height - 1, -1, -1):
            new_row.append(shape[row][col])
        turned.append(new_row)
    return turned


def fits(grid, shape, at_col, at_row):
    """True if the shape can sit here: on the board, and on empty cells."""
    for row in range(len(shape)):
        for col in range(len(shape[row])):
            if shape[row][col] == 0:
                continue
            board_col = at_col + col
            board_row = at_row + row
            if board_col < 0 or board_col >= COLS or board_row >= ROWS:
                return False
            if board_row >= 0 and grid[board_row][board_col] is not None:
                return False
    return True


def freeze(grid, shape, at_col, at_row, colour):
    """Copy a piece that has landed into the grid, so it stays there."""
    for row in range(len(shape)):
        for col in range(len(shape[row])):
            if shape[row][col] == 1:
                grid[at_row + row][at_col + col] = colour


def clear_full_rows(grid):
    """Throw away any complete row, then push empty rows in at the top."""
    kept = []
    for row in grid:
        if None in row:
            kept.append(row)
    cleared = ROWS - len(kept)
    for count in range(cleared):
        kept.insert(0, [None] * COLS)
    return kept, cleared


def draw_cell(col, row, colour):
    """Draw one square of the playfield, given its grid coordinates."""
    box = pygame.Rect(BOARD_LEFT + col * CELL, BOARD_TOP + row * CELL, CELL, CELL)
    pygame.draw.rect(screen, colour, box)
    pygame.draw.rect(screen, BOARD_COLOUR, box, 1)


def draw_text(message, which_font, colour, centre_x, centre_y):
    """Render one line of text and centre it on a point."""
    picture = which_font.render(message, True, colour)
    box = picture.get_rect()
    box.center = (centre_x, centre_y)
    screen.blit(picture, box)


grid = make_grid()
shape, colour, piece_col, piece_row = new_piece()
score = 0
lines = 0
fall_delay = FALL_START
fall_counter = 0
game_over = False

running = True
while running:
    # Moving and rotating are one-off actions, so they belong on KEYDOWN.
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_q:
                running = False
            elif game_over:
                if event.key == pygame.K_r:
                    grid = make_grid()
                    shape, colour, piece_col, piece_row = new_piece()
                    score = 0
                    lines = 0
                    fall_delay = FALL_START
                    fall_counter = 0
                    game_over = False
            elif event.key == pygame.K_LEFT:
                # Only move if the piece would still fit over there.
                if fits(grid, shape, piece_col - 1, piece_row):
                    piece_col = piece_col - 1
            elif event.key == pygame.K_RIGHT:
                if fits(grid, shape, piece_col + 1, piece_row):
                    piece_col = piece_col + 1
            elif event.key == pygame.K_UP:
                turned = rotate(shape)
                if fits(grid, turned, piece_col, piece_row):
                    shape = turned
            elif event.key == pygame.K_SPACE:
                # Hard drop: keep going down while there is still room.
                while fits(grid, shape, piece_col, piece_row + 1):
                    piece_row = piece_row + 1
                fall_counter = fall_delay

    if not game_over:
        # Holding DOWN is a held key, not a one-off, so get_pressed() suits it.
        keys = pygame.key.get_pressed()
        if keys[pygame.K_DOWN]:
            fall_counter = fall_counter + 3

        fall_counter = fall_counter + 1
        if fall_counter >= fall_delay:
            fall_counter = 0
            if fits(grid, shape, piece_col, piece_row + 1):
                piece_row = piece_row + 1
            else:
                # The piece has landed. Fix it in place, tidy away any full
                # rows, then bring on the next one.
                freeze(grid, shape, piece_col, piece_row, colour)
                grid, cleared = clear_full_rows(grid)
                lines = lines + cleared
                score = score + LINE_SCORES[cleared]
                fall_delay = max(6, FALL_START - lines // 2)
                shape, colour, piece_col, piece_row = new_piece()
                # No room for the new piece means the stack has reached the top.
                if not fits(grid, shape, piece_col, piece_row):
                    game_over = True

    screen.fill(BACKGROUND)
    pygame.draw.rect(screen, BOARD_COLOUR, board)

    # Everything that has already landed.
    for row in range(ROWS):
        for col in range(COLS):
            if grid[row][col] is not None:
                draw_cell(col, row, grid[row][col])

    # The falling piece is NOT in the grid yet, so it is drawn separately.
    if not game_over:
        for row in range(len(shape)):
            for col in range(len(shape[row])):
                if shape[row][col] == 1:
                    draw_cell(piece_col + col, piece_row + row, colour)

    pygame.draw.rect(screen, EDGE, board, 2)

    panel_x = BOARD_LEFT + COLS * CELL + 24
    screen.blit(font.render("SCORE", True, GREY), (panel_x, 30))
    screen.blit(big_font.render(str(score), True, WHITE), (panel_x, 54))
    screen.blit(font.render("LINES", True, GREY), (panel_x, 120))
    screen.blit(big_font.render(str(lines), True, WHITE), (panel_x, 144))

    controls = ["left / right  move", "up            rotate",
                "down          faster", "space         drop", "q             quit"]
    for number in range(len(controls)):
        screen.blit(small_font.render(controls[number], True, GREY),
                    (panel_x, 240 + number * 24))

    if game_over:
        draw_text("GAME OVER", big_font, WHITE, board.centerx, board.centery - 20)
        draw_text("press R to play again", font, GREY, board.centerx, board.centery + 20)

    pygame.display.flip()
    clock.tick(60)

pygame.quit()
