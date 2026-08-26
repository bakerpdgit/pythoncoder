# A ball that bounces

Turtle draws a picture and stops. Pygame is built for something different: a
program that keeps *going*, redrawing the screen sixty times a second and
reacting to you while it does. That endless redrawing is called the **game
loop**, and almost every pygame program you ever meet is built around one.

## Getting started

Three lines set everything up:

```python
pygame.init()
screen = pygame.display.set_mode((WIDTH, HEIGHT))
clock = pygame.time.Clock()
```

- `pygame.init()` starts the library.
- `set_mode()` makes the window and hands back a **Surface** — a rectangle of
  pixels you can draw on. The whole window is just a Surface called `screen`.
  Notice the double brackets: `set_mode` takes *one* argument, and that argument
  is the pair `(WIDTH, HEIGHT)`.
- `Clock()` is a timer used to keep the speed sensible.

## The three jobs of a game loop

Every pass through the `while` loop does the same three jobs, in this order:

1. **Handle events** — has the user pressed a key, moved the mouse, closed the
   window?
2. **Update** — move everything on by one step and work out what that means.
3. **Draw** — paint the whole picture again and show it.

One pass through is called a **frame**. At 60 frames a second the ball appears
to glide, but really it is being erased and redrawn in a slightly different
place, over and over.

## Events

```python
for event in pygame.event.get():
    if event.type == pygame.QUIT:
        running = False
```

`pygame.event.get()` hands back a list of everything that has happened since
the last frame — often an empty list. You look through them for the ones you
care about. `pygame.QUIT` is the window's close button.

That loop is not optional. If you never call `pygame.event.get()`, the window
never gets a chance to respond and the operating system decides your program
has frozen.

## Coordinates

Pygame's coordinates are **not** the ones turtle uses:

- `(0, 0)` is the **top left** corner, not the middle.
- `x` grows to the right, as usual, but `y` grows **downwards**.

So `y = y + 3` moves the ball *down* the screen. This catches everyone once.

Colours are `(red, green, blue)` tuples, each part from 0 to 255.
`(0, 0, 0)` is black and `(255, 255, 255)` is white.

## Bouncing

The ball has a position (`x`, `y`) and a **velocity** (`dx`, `dy`) — how far it
moves each frame. Bouncing is nothing more than flipping the sign of one of
them:

```python
if x - RADIUS < 0 or x + RADIUS > WIDTH:
    dx = -dx
```

`x` is the ball's centre, so its left edge is `x - RADIUS`. Testing the *edge*
rather than the centre is what stops the ball sinking halfway into the wall
before it turns round.

## Drawing, then showing

```python
screen.fill(BACKGROUND)
pygame.draw.circle(screen, BALL_COLOUR, (x, y), RADIUS)
pygame.display.flip()
```

`screen.fill()` paints over the whole window in one colour. That is what wipes
away the previous frame — take it out and the ball leaves a smear behind it.
Then things are drawn back to front, exactly like painting on paper.

Nothing you draw appears until `pygame.display.flip()`. Pygame builds the frame
off-screen and shows it in one go, so you never catch it half finished.

Finally `clock.tick(60)` waits just long enough that the loop runs about 60
times a second. Without it the loop runs as fast as the computer can manage,
and the ball becomes a blur.

**Try it:**

- Change `dx` and `dy` and watch the angle of the bounce change.
- Make the ball leave a trail by moving `screen.fill(BACKGROUND)` to just above
  `running = True`, so the screen is only wiped once.
- Draw a second ball travelling the other way. You will need a second set of
  `x`, `y`, `dx` and `dy` variables — which starts to feel repetitive, and is
  exactly the problem the next page solves.
