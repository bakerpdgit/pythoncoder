# Task: the tuck shop

The tuck shop's sales for one day are in a DataFrame: each item's `price` in
pounds and how many were `sold`.

Replace each `____` with one line of pandas:

| Line | Should hold |
| --- | --- |
| `shop["takings"]` | a new column: price times number sold, for every row |
| `total` | the total takings for the day |
| `best_row` | the **row label** of the item that took the most money |

Columns multiply row by row, like arrays. `best_row` is not the item's name: it is
the label that `.loc` uses to find the name, as on page 9.

## How it is marked

The printed table (with your new column), the total and the best seller are
checked against the right answers.
