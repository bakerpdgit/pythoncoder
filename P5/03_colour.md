# Colour

Shapes have two colours: the **fill** inside them and the **stroke** around
them. Both are set *before* the shapes they apply to, and stay set until you
change them.

```python
fill(255, 200, 0)    # red, green, blue: yellow
stroke(255)          # one number: a grey, here white
stroke_weight(4)     # the outline, 4 pixels thick
no_stroke()          # no outline at all
no_fill()            # just the outline
```

## Red, green, blue

Screens make every colour from red, green and blue light. Each is a number
from 0 (none) to 255 (full):

| Colour | Numbers |
| --- | --- |
| red | `255, 0, 0` |
| yellow | `255, 255, 0` (red and green light make yellow) |
| purple | `128, 0, 128` |
| white | `255, 255, 255`, or just `255` |
| black | `0, 0, 0`, or just `0` |

One number means a grey. Names work too: `fill("tomato")`, `fill("navy")`,
and so do hex codes like `fill("#ff8800")`.

## Transparency

A fourth number is the **alpha**: how solid the colour is, from 0 (invisible)
to 255 (solid). The blue circle in this sketch has alpha 120, so you can see
the house through it.

## Points

`point(x, y)` draws with the stroke colour, as big as the stroke weight.

## Try this

- Make the night sky a sunset orange with `background(255, 140, 60)`.
- Give the sun an orange outline 10 pixels thick.
- Draw three overlapping circles in red, green and blue, each with alpha 120,
  and look at the colours where they overlap.
