# Task: a chessboard

Draw an 8 by 8 chessboard that fills the 400 by 400 canvas.

![preview](p5preview)

- Each square is 50 by 50 pixels, with **no outline**.
- The top-left square is white (`255`); the squares alternate between white
  and black (`0`) along every row and down every column.
- Use two loops, one inside the other, as in the last page. The square in row
  `row` and column `col` has its top-left corner at `(col * 50, row * 50)`.

The hard part is the colour. Look at the row and column numbers of the white
squares: (0, 0), (0, 2), (1, 1), (1, 3) … What do they have in common? `%` gives
the remainder after dividing: `7 % 2` is 1.

**Submit** when your board matches.
