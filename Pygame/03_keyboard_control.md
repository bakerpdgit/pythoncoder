# Taking control of the keyboard

Everything so far ran itself. This one belongs to you.

**Click on the canvas first** so it has the keyboard focus, then use the arrow
keys or WASD to move, `SPACE` to change colour, `C` to clear the trail and `Q`
to quit. Press **Stop** when you have had enough.

## Two ways to read the keyboard

This is the idea worth taking away from the whole page, because choosing the
wrong one is the single most common pygame mistake.

### Events: "it happened"

```python
elif event.type == pygame.KEYDOWN:
    if event.key == pygame.K_SPACE:
        colour_index = (colour_index + 1) % len(COLOURS)
```

A `KEYDOWN` event arrives **once**, at the instant the key goes down. Hold the
key for ten seconds and you still get exactly one. That is what you want for
anything that should happen a single time: fire a shot, jump, pause, drop a
piece, change colour.

Each event carries an `event.key` telling you which key it was. The names all
start `K_`: `pygame.K_SPACE`, `pygame.K_a`, `pygame.K_LEFT`, `pygame.K_ESCAPE`.
There is a `KEYUP` event too, for the moment a key is released.

### get_pressed(): "it is down now"

```python
keys = pygame.key.get_pressed()
if keys[pygame.K_LEFT] or keys[pygame.K_a]:
    player.x = player.x - SPEED
```

`pygame.key.get_pressed()` does not care about events at all. It hands back a
snapshot of the whole keyboard *right now*, which you index with the same `K_`
names to get `True` or `False`. Checking it every frame, and moving a little
each time, is what produces smooth continuous movement while a key is held.

Because it is a snapshot rather than a list of events, it can also answer
questions events cannot — like "are `LEFT` and `UP` both down?", which is how
diagonal movement works here for free.

### Which one?

> **One-off action → `KEYDOWN` event. Continuous movement → `get_pressed()`.**

Try it the wrong way round and you will feel the difference immediately. Move
the player on `KEYDOWN` and it lurches one step, pauses, then repeats at the
speed your operating system chooses to repeat keys. Change colour on
`get_pressed()` and one tap flickers through every colour, because the key was
still down for the next twenty frames.

## Staying on screen

```python
window = screen.get_rect()
player.clamp_ip(window)
```

`screen.get_rect()` gives you a Rect covering the whole window — a tidy way to
get its bounds without repeating `WIDTH` and `HEIGHT`. `clamp_ip()` then shoves
the player back inside if it has strayed out. The `ip` means **in place**: it
changes the rect it is called on, rather than returning a new one. (`clamp()`
without the `ip` leaves the original alone and hands you a moved copy. Several
Rect methods come in both flavours — `move` and `move_ip` are the pair you will
meet next.)

## The trail

```python
trail.append(player.center)
if len(trail) > 150:
    trail.pop(0)
```

`player.center` is a `(x, y)` tuple, so the trail is a list of remembered
positions, drawn as small circles each frame. Capping it at 150 matters: without
that line the list grows by 60 items a second forever, and a program that draws
every one of them gets slower the longer you play. `pop(0)` removes the oldest.

**Try it:**

- Make `SPACE` a boost instead — hold it to move at double speed. Which of the
  two techniques do you need now?
- Stop the player leaving the screen a different way: instead of `clamp_ip`,
  make it reappear on the opposite side.
- Add a `KEYUP` handler that prints which key was let go, and watch the console
  as you play.
