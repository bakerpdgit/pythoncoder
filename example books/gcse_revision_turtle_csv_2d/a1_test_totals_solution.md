# 2D arrays 1 solution: Unscramble the totals

A model solution for **2D arrays 1**. Run it to see the table.

## Worth noticing

The **outer** loop goes through the rows (students); the **inner** loop goes through the columns (marks) of one row. `results[row][col]` is "row first, then column".

The inner loop starts at 1 because column 0 holds the name, not a mark.

`total = 0` is inside the outer loop but before the inner loop, so each student's total starts again from zero.

The heading and each data row use the **same** format string, which is what keeps the columns lined up.
