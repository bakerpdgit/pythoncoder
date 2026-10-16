# Task: does the weather sell ice creams?

A beach kiosk recorded the temperature and the number of ice creams sold on twelve
summer days. Replace each `____`:

| Line | Should hold |
| --- | --- |
| `slope, intercept` | the line of best fit through the points: `np.polyfit(x, y, 1)` |
| `r` | the correlation coefficient, from `np.corrcoef` |
| `predicted` | what the line predicts for a 25 degree day |

Temperature is `x` here - it is the thing that might explain the sales - and
`ice_creams` is `y`. `corrcoef` gives a 2x2 matrix; page 29 says which entry is `r`.

A line is `y = slope * x + intercept`, so the prediction needs no new function.

## How it is marked

The printed slope, intercept, `r` and prediction are checked against the right
answers. Your code must use `polyfit` and `corrcoef`.

Then ask yourself: an `r` that high, so does heat *cause* ice cream sales? Here, very
probably. Page 29 explains why the line alone cannot tell you.
