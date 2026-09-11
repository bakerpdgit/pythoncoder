# Rows, columns and `axis`

Real data is a table. A NumPy array with two dimensions *is* that table: one row
per student, one column per test.

```python
scores.shape   # (5, 4) -> 5 rows, 4 columns
```

## The `axis` argument is the whole lesson

`scores.mean()` averages everything into one number. To average in a *direction*
you say which axis to collapse:

| Call | Collapses | Leaves | Means |
| --- | --- | --- | --- |
| `scores.mean(axis=1)` | the columns | one value per **row** | each student's average |
| `scores.mean(axis=0)` | the rows | one value per **column** | each test's class average |

The rule of thumb: **`axis` names the direction that disappears.** `axis=1` is the
test direction, so the tests vanish and the students remain.

## Slicing a table

`scores[2]` is row 2 - everything Chen scored. To take a *column* you have to say
something about both dimensions: `scores[:, 3]` means "every row, column 3". The
colon is "all of them".

`scores[:, :2]` takes every row and the first two columns - a block, not a line.

**Try it:** `scores.max(axis=0)` gives the top mark in each test. Can you work out
which student got it? (`scores.argmax(axis=0)`.)
