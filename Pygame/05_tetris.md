# Tetris

The last page is a real game, and the ideas in it go well beyond pygame. Page 4
tracked a handful of rectangles. Tetris cannot: it needs to remember every
square that has ever landed, ask whether a shape *would* fit somewhere before
moving it there, and rearrange the whole playfield when a row fills up.

That calls for a **grid**.

**Click the canvas**, then: `←` `→` move, `↑` rotates, hold `↓` to drop faster,
`SPACE` slams the piece down, `Q` quits. `R` starts again after a game over.

## The playfield is a list of lists

```python
def make_grid():
    grid = []
    for row in range(ROWS):
        grid.append([None] * COLS)
    return grid
```

`grid` is a list of 20 rows; each row is a list of 10 cells. A cell is either
`None`, meaning empty, or a colour tuple, meaning a landed block of that colour.
You reach a cell as `grid[row][col]` — **row first**, which reads backwards
compared to the `(x, y)` you have used everywhere else. Getting that pair the
wrong way round is the traditional way to lose an afternoon.

Storing the colour rather than just `True` is a small decision that pays off
twice: one value answers both "is this square occupied?" and "what colour do I
paint it?".

The grid holds *only* what has landed. The piece still falling is kept in
separate variables (`shape`, `colour`, `piece_col`, `piece_row`) and drawn
separately. That separation is what makes everything else possible — the falling
piece can be moved and rotated freely because nothing has committed it to the
board yet.

## Shapes are grids too

```python
"T": [[1, 1, 1],
      [0, 1, 0]],
```

Each of the seven shapes is written out as a tiny grid of its own, laid out in
the source so you can see the shape in the code. `1` means there is a block
here, `0` means there is not.

`piece_col` and `piece_row` say where the shape's top-left corner sits on the
board, so the square at `shape[row][col]` belongs at `grid[piece_row + row]
[piece_col + col]`. That one line of arithmetic appears in `fits`, in `freeze`
and in the drawing code — three subprograms, one idea.

## Rotating

```python
def rotate(shape):
    height = len(shape)
    width = len(shape[0])
    turned = []
    for col in range(width):
        new_row = []
        for row in range(height - 1, -1, -1):
            new_row.append(shape[row][col])
        turned.append(new_row)
    return turned
```

To turn a grid a quarter turn clockwise: **read the old columns from the bottom
upwards, and write them out as the new rows.** The outer loop walks the old
columns, the inner one walks that column from the bottom up.

The shape changes size when it turns, and that is fine — `I` is 4 wide and 1
tall, and rotated it becomes 1 wide and 4 tall. Nothing in the program assumes a
shape is square.

Two things worth noticing. First, `rotate` **returns a new grid** rather than
altering the one it was given. That is what makes the next section safe. Second,
four rotations bring every shape back exactly where it started — a satisfying
thing to test.

## Look before you leap

```python
def fits(grid, shape, at_col, at_row):
```

`fits` answers one question: *if the shape were at this place, would that be
legal?* It says no if any of the shape's blocks would be off the left, off the
right, below the floor, or on a square that is already occupied.

Every move in the game goes through it, and always in the same shape of code —
try it out, and only commit if it fits:

```python
elif event.key == pygame.K_LEFT:
    if fits(grid, shape, piece_col - 1, piece_row):
        piece_col = piece_col - 1
```

Rotation is the same idea, which is why `rotate` returning a *new* grid matters:

```python
turned = rotate(shape)
if fits(grid, turned, piece_col, piece_row):
    shape = turned
```

`turned` is a proposal. If it does not fit — the piece is jammed against a wall,
say — it is simply thrown away and `shape` is untouched. Had `rotate` modified
the shape in place there would be no way back, and pieces would rotate
themselves into the wall.

This "check, then commit" pattern is worth far more than Tetris. It is how you
write any rule-based move: a chess piece, a maze, a robot on a grid.

## Landing, and clearing rows

When a piece can go no further down, `freeze` copies it into the grid — that is
the moment it stops being the falling piece and becomes part of the board — and
then:

```python
def clear_full_rows(grid):
    kept = []
    for row in grid:
        if None in row:
            kept.append(row)
    cleared = ROWS - len(kept)
    for count in range(cleared):
        kept.insert(0, [None] * COLS)
    return kept, cleared
```

Rather than deleting rows out of the middle of a list, this **keeps** the rows
that still have a gap in them. A row with no `None` left in it is full, so it is
simply not copied across. Then however many rows went missing, that many empty
ones are pushed in at the top — which is exactly what "everything above falls
down" means when the board is a list.

It is a neat piece of code to study. There is no shuffling, no index
arithmetic, and no special case for clearing one row versus four. Compare it
with page 4's backwards loop: two different answers to "how do I remove things
from a list I am working through", and this one is usually the easier to get
right.

The function returns **two** values, so the caller has to catch both:

```python
grid, cleared = clear_full_rows(grid)
```

## Falling, and the two kinds of key again

The piece falls on a frame counter — the same trick as page 4's spawn timer:

```python
fall_counter = fall_counter + 1
if fall_counter >= fall_delay:
    fall_counter = 0
    ...
```

and the game speeds up as you clear lines, with a floor so it never becomes
impossible:

```python
fall_delay = max(6, FALL_START - lines // 2)
```

Page 3's rule decides how each key is read, and here you can see both in one
program. Moving and rotating are one-off actions, so they are `KEYDOWN` events.
Holding `↓` to drop faster is a continuous thing, so it uses `get_pressed()` and
nudges the counter along:

```python
keys = pygame.key.get_pressed()
if keys[pygame.K_DOWN]:
    fall_counter = fall_counter + 3
```

`SPACE` is the interesting one — a `while` loop **inside** the game loop:

```python
while fits(grid, shape, piece_col, piece_row + 1):
    piece_row = piece_row + 1
```

That runs to completion within a single frame, so you never see the piece
travel; it is simply somewhere else on the next frame. It is safe because every
pass moves the piece down one row, so it must eventually hit something and stop.
A `while` inside a game loop that *cannot* finish would hang the whole program —
the frame never ends, so nothing is ever drawn.

## Game over

```python
shape, colour, piece_col, piece_row = new_piece()
if not fits(grid, shape, piece_col, piece_row):
    game_over = True
```

There is no separate test for "the stack is too high". If a brand new piece
cannot even be placed at the top, the board is full — the same `fits` that
handles every other move detects the end of the game as a side effect. Good
rules tend to do that.

**Try it:**

- Show the next piece in the side panel. You will need to choose it one turn
  early and keep it in a variable.
- Score a bonus for a "T-spin", or simply award more for clearing rows with
  fewer pieces.
- Add a ghost piece: work out where the piece *would* land using the same loop
  as the hard drop, and draw it there in a dim colour before drawing the real
  one.
- Hold a piece in reserve with `C`, swapping it with the falling one.
