# Turtle 3 solution: Archery target

A model solution for **Turtle 3**. Run it and try entering an invalid number first.

## Worth noticing

The **validation** uses the standard pattern: one input before the loop, and the same input again inside it. The loop only ends once the value is valid.

`radius = (numRings - ring) * RING_WIDTH` makes the radius **shrink** as `ring` counts up, so the largest circle is drawn first and each smaller one sits on top of it. Drawing the smallest first would cover it up.

`turtle.circle` starts drawing at the bottom of the circle, so the turtle moves to `(0, -radius)` to centre every circle on the origin.

The pen colour (outline) and fill colour are set separately, so the white rings still have a visible black edge.
