# 2D arrays 3 solution: Sales table

A model solution for **2D arrays 3**. Run it and choose a quarter.

## Worth noticing

**Row totals** loop row by row (outer) then along the columns (inner). **Column totals** swap the loops: column by column (outer), then down the rows (inner).

The format specifiers do all the alignment: `{:<6}` left-aligns in 6 characters, `{:>9.2f}` right-aligns a number in 9 characters with 2 decimal places.

To find the top seller, `topIndex` remembers the **position** of the best so far rather than the value, so both the name and the amount can be displayed at the end.
