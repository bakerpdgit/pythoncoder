# The keyboard

Click the sketch first, so that it has the keyboard.

There are two ways to react to keys, like the two for the mouse:

- `key_is_down(LEFT_ARROW)` is `True` **for as long as** the key is held. Check
  it in `draw()` for smooth movement.
- `key_pressed()` is called **once** each time a key goes down. Use it for
  one-off actions — here, Space picks a new random colour.

Inside them:

| Variable | Holds |
| --- | --- |
| `key` | the last key pressed: `"a"`, `"A"`, `" "`, or a name like `"ArrowLeft"`, `"Enter"` |
| `key_code` | its number: `LEFT_ARROW`, `RIGHT_ARROW`, `UP_ARROW`, `DOWN_ARROW`, `ENTER`, `ESCAPE`, `SHIFT`… |
| `key_is_pressed` | `True` while any key is held |

`key_is_down()` also takes a letter: `key_is_down("w")`. There are
`key_released()` and `key_typed()` functions too.

## Try this

- Add WASD controls alongside the arrows.
- Make Shift a "run" key that doubles the speed.
- Leave a trail of small circles behind the square.
