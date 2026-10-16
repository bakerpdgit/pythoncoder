# The mouse

p5 keeps track of the mouse for you:

| Variable | Holds |
| --- | --- |
| `mouse_x`, `mouse_y` | where the mouse is on the canvas |
| `pmouse_x`, `pmouse_y` | where it was on the last frame |
| `mouse_is_pressed` | `True` while a button is held down |
| `mouse_button` | which one: `LEFT`, `RIGHT` or `CENTER` |

This sketch is a painting program. `draw()` has **no** `background()`, so
whatever it draws stays. While the button is held, it draws a line from where
the mouse was to where it is now. (Drawing a dot at the mouse instead leaves
gaps when the mouse moves quickly.)

## Functions p5 calls for you

Define a function with one of these names and p5 calls it when that happens:

| Function | Called when |
| --- | --- |
| `mouse_pressed()` | a button goes down |
| `mouse_released()` | a button comes up |
| `mouse_clicked()` | after a press and release |
| `double_clicked()` | after a double-click |
| `mouse_moved()` / `mouse_dragged()` | the mouse moves, without / with a button held |

`mouse_is_pressed` is right for things that happen *for as long as* the button
is held (painting). `mouse_pressed()` is right for things that happen *once per
click* (choosing a colour). Here, clicking a square in the palette changes the
colour, and a double-click clears the page.

## Try this

- Add a sixth colour, white, as an eraser.
- Make the line thicker the faster the mouse moves. `dist(pmouse_x, pmouse_y,
  mouse_x, mouse_y)` is how far it moved since the last frame.
