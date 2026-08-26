# A whole game: catch the blocks

Everything so far has been one idea at a time. This is a complete game — score,
lives, rising difficulty, a game-over screen and a way to start again — and it
is under a hundred lines, because it is built from parts you already know.

**Click the canvas**, then move the paddle with the arrow keys or `A` and `D`.
Catch the falling blocks. Miss three and it is over; press `R` to try again, or
`Q` to quit.

## Many things at once: a list of Rects

One block needed one Rect. Several blocks need a *list* of them:

```python
blocks = [new_block()]
...
blocks.append(new_block())
```

and then everything that used to happen to one block happens to all of them
inside a `for` loop. The screen can now hold five blocks or fifty without a
single new variable — this is the moment lists stop being a school exercise and
start being the thing holding your game together.

`new_block()` is a subprogram that builds one, so "make a new block" is written
once and used from three different places:

```python
def new_block():
    left = random.randint(0, WIDTH - BLOCK_SIZE)
    return pygame.Rect(left, -BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE)
```

Note the negative `y`. The block starts just **above** the top edge, so it
slides into view rather than popping into existence. `WIDTH - BLOCK_SIZE` as the
upper limit for `left` keeps the whole block on screen — pick a `left` of
`WIDTH` and it would fall just off the right-hand side.

## Removing from a list you are looping over

This is the subtle one:

```python
for index in range(len(blocks) - 1, -1, -1):
    block = blocks[index]
```

That counts **backwards** — from the last index down to 0. It has to.

When you `pop(2)` from a list, everything after position 2 shuffles down one
place. A forwards loop has already got a counter pointing at position 3, so the
item that just moved *into* position 2 is skipped entirely. Every so often a
block would fall straight through the paddle and nobody could see why.

Counting backwards sidesteps it: the items that shuffle are the ones you have
already dealt with. (The other common fix is to build a new list of the
survivors instead of removing from the old one. Page 5 uses that approach.)

## The spawn timer

```python
spawn_timer = spawn_timer + 1
if spawn_timer >= SPAWN_EVERY:
    spawn_timer = 0
    blocks.append(new_block())
```

Counting frames is the simplest possible timer, and it is worth knowing the
trade-off. At 60 frames a second, `SPAWN_EVERY = 45` is about a block every
three quarters of a second — but only *because* `clock.tick(60)` is holding the
frame rate steady. On a machine that cannot keep up, a frame-counted game
quietly runs in slow motion. Real games measure elapsed milliseconds with
`pygame.time.get_ticks()` instead. For a game this size, counting frames is
fine and much easier to read.

## Difficulty that rises

```python
fall_speed = START_SPEED + score // 5
```

Integer division does the work: every fifth catch adds one to the fall speed. A
game that never gets harder gets boring, and one line is enough to fix it.

## Game state

`playing` is a **flag** — a variable whose whole job is to record which mode the
game is in:

```python
if playing:
    # move the paddle, fall the blocks, check for catches
...
if not playing:
    draw_text("GAME OVER", ...)
```

Notice what does *not* happen when the game ends. There is no second loop and no
`while` inside a `while`. The one game loop keeps running exactly as before,
drawing every frame; the update section simply gets skipped. That keeps the
window responsive — a paused game that stops calling `pygame.event.get()` is a
frozen game — and it means the game-over screen can listen for `R`.

Restarting is then just putting every variable back the way it started:

```python
blocks = [new_block()]
score = 0
lives = START_LIVES
fall_speed = START_SPEED
spawn_timer = 0
paddle.centerx = WIDTH // 2
playing = True
```

Forgetting one is the classic bug. Leave `fall_speed` out and your second game
begins at the speed your first one ended at.

## A helper for centred text

```python
def draw_text(message, which_font, colour, centre_x, centre_y):
    picture = which_font.render(message, True, colour)
    box = picture.get_rect()
    box.center = (centre_x, centre_y)
    screen.blit(picture, box)
```

The three-step render-and-blit from page 2, wrapped up once so that centring
"GAME OVER" is a single readable line rather than four fiddly ones.

**Try it:**

- Award more points for a smaller paddle, or shrink the paddle as the score
  climbs.
- Add a rarer red block that costs a life if you *do* catch it. You will need to
  store a colour alongside each rect — a list of pairs, or two parallel lists.
- Keep a high score that survives a restart. Which variables must you leave
  alone when the game resets?
