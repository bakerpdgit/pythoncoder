# 2D arrays 4 solution: Minesweeper

A model solution for **2D arrays 4**. Run it and pick a square.

## Worth noticing

`countAdjacent` visits the 3 x 3 block centred on the square: rows `row - 1` to `row + 1` and columns `col - 1` to `col + 1`. It skips the square itself and anything outside the grid.

Every subprogram works only with its **parameters**, never with the global `minefield`, so the same code works for any grid - which is how it can be tested on grids you have never seen.

`buildNumberGrid` builds a brand new 2D list one row at a time (`newRow` is reset for each row, then appended), leaving the original grid unchanged.

`displayGrid(buildNumberGrid(minefield))` passes the value returned by one function straight into another.
