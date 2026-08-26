# Rectangles, collisions and text

The bouncing ball needed four separate variables — `x`, `y`, `dx`, `dy` — and
that was for *one* thing on screen. Pygame gives you a much better container: a
**Rect**.

## What a Rect is

```python
red_block = pygame.Rect(40, 165, 70, 70)
```

A Rect stores a position **and** a size: left, top, width, height. On its own
that is only mildly useful. What makes it the workhorse of pygame is that it
knows about its own edges:

| Attribute | Meaning |
| --- | --- |
| `.x`, `.y` | left and top, the same as `.left` and `.top` |
| `.left`, `.right`, `.top`, `.bottom` | the four edges |
| `.width`, `.height` | the size |
| `.centerx`, `.centery`, `.center` | the middle |
| `.topleft`, `.bottomright`, ... | the corners |

All of them can be **read or set**, and setting one slides the whole rectangle
without changing its size. So `block.right = WIDTH` puts a block flush against
the right-hand wall, whatever size it happens to be, and `block.center = (320,
200)` centres it. Working out that sum yourself is the sort of arithmetic that
quietly goes wrong.

Note the American spelling: pygame says `center`, not `centre`.

## Collisions come free

```python
if red_block.colliderect(blue_block):
```

`colliderect()` is `True` whenever two rectangles overlap. That single method is
how most 2D games decide that a bullet hit a ship, a player reached a door, or
a ball met a bat — the shapes on screen may be anything you like, but the thing
being tested is almost always a plain rectangle.

There is a family of them: `collidepoint()` for a single point (perfect for
mouse clicks), and `collidelist()` for checking one rect against a whole list.

Watch what the collision *does* here. Both blocks reverse, which separates them
before the next frame. If they reversed but stayed overlapping, they would flip
again next frame, and again, and stick together shuddering. That is a real bug
you will meet.

## Getting text on screen

There is no `print()` onto a window. Text has to be turned into a picture
first:

```python
score_font = pygame.font.Font(None, 40)
counter = score_font.render("Hits: " + str(hits), True, WHITE)
screen.blit(counter, (20, 20))
```

Three steps, and each one matters:

1. **Make a font** once, before the loop. `Font(None, 40)` asks for pygame's own
   built-in font at size 40. Building a font is slow, so building one every
   frame would visibly stutter.
2. **Render** the text. This returns a brand new Surface with the words drawn on
   it, just big enough to hold them. The `True` in the middle turns on
   anti-aliasing — smooth edges.
3. **Blit** it. `blit` means "copy this Surface onto that one", here at position
   `(20, 20)`. Nothing appears until you do.

`render()` needs a **string**, so `str(hits)` is doing real work — pass it the
number `4` and you get a `TypeError`.

To centre text rather than fix its top-left corner, ask the rendered Surface for
its own Rect and move that:

```python
box = counter.get_rect()
box.center = (WIDTH // 2, 100)
screen.blit(counter, box)
```

You will use that trick constantly from page 4 onwards.

**Try it:**

- Give the blocks a `y` speed as well, so they bounce around the whole window
  rather than along one line.
- Show `hits` in red once it passes 5. You will need two colours and an `if`.
- Add a third block and check it against both of the others. Once you find
  yourself writing the same three lines a third time, you have discovered why
  lists of rects are coming on page 4.
