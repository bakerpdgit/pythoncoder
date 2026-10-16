# Task: a traffic light

Draw this traffic light on the 200 by 400 canvas.

![preview](p5preview)

The sky is already there: `background(200, 230, 255)`. Then, in this order:

1. With **no outline**: the pole, a rectangle filled with grey `80`, top-left
   corner (90, 300), 20 wide and 100 high.
2. Still with no outline: the box, filled with grey `30`, top-left corner
   (50, 40), 100 wide and 270 high, with rounded corners. A fifth number
   rounds a rectangle's corners: `rect(50, 40, 100, 270, 15)`.
3. Now **black outlines, 3 pixels thick**, for the three lights. Each is a
   circle 70 across, centred on x = 100:
   - red `255, 0, 0` at y = 100
   - amber `255, 165, 0` at y = 175
   - green `0, 200, 0` at y = 250

**Submit** when your light matches.

## Hint

`stroke()` and `stroke_weight()` stay set until you change them, so you only
need to set the outline once before the lights — and once (`no_stroke()`)
before the pole.
