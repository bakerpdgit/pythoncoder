# Fitting a line, and being honest about it

A scatter plot shows whether two things move together. A **line of best fit** puts
a number on it.

```python
slope, intercept = np.polyfit(hours, marks, 1)
```

`polyfit(x, y, 1)` finds the straight line that comes closest to every point at
once - degree `1` means a line, `2` would be a parabola. It hands back the two
numbers in `y = slope * x + intercept`.

## The correlation coefficient

```python
r = np.corrcoef(hours, marks)[0, 1]
```

`corrcoef` returns a small matrix comparing each series with each other; the
off-diagonal entry is the one you want.

| r | Means |
| --- | --- |
| `1.0` | perfect: every point on the line, sloping up |
| `0.7` | strong relationship, real scatter around it |
| `0.0` | no linear relationship at all |
| `-1.0` | perfect, sloping down |

`r ** 2` is the more honest headline: it is the *share of the variation* the line
accounts for. An `r` of 0.8 sounds nearly perfect; `r squared` of 0.64 says a
third of what is going on is something else entirely.

## Correlation is not cause

This chart cannot tell you revision *causes* better marks. Students who revise
more may also attend more, or find the subject easier. The line describes the
data; it does not explain it. Say so when you present one.

**Try it:** change `rng.normal(0, 7, 60)` to `rng.normal(0, 20, 60)` - far noisier
students. The slope barely moves, but watch `r` collapse.
