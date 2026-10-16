# Randomness and noise

`random()` gives a different number every time it is called:

| Call | Gives |
| --- | --- |
| `random(10)` | a number from 0 up to 10 |
| `random(5, 10)` | a number from 5 up to 10 |
| `random(["red", "green"])` | one of the list |

## The same random numbers every time

The stars are drawn again on every frame, with new random positions — so
they would jump about. `random_seed(7)` at the start of `draw()` makes
`random()` give the same numbers in the same order each time, so the same stars
come out on every frame. Take it out and watch.

## Noise: smooth randomness

`random()` jumps. `noise()` wanders: nearby inputs give nearby outputs, always
between 0 and 1. Walk slowly along it and you get hills, clouds, or something
that drifts:

- The hills are `noise(x * 0.01, t)`: neighbouring x values give neighbouring
  heights, and `t` growing a little every frame makes them roll.
- The firefly's position is `noise(t)` and `noise(t + 100)` — two different
  places in the noise, so x and y wander independently.

How fast you walk through the noise decides how smooth it is: try
`x * 0.05` for spikier hills.

## begin_shape()

The hills are one shape with many corners: `begin_shape()`, a `vertex(x, y)`
for each corner, then `end_shape(CLOSE)` to join the last corner to the first.

## Try this

- Make the stars twinkle: take out `random_seed()` but only for the alpha.
- Add a second, darker row of hills behind the first.
- Give the firefly a trail by drawing the background with alpha:
  `background(10, 10, 40, 40)`.
