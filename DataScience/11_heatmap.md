# Everything against everything

With six columns there are fifteen pairs to check. Nobody draws fifteen scatter
plots. They draw one heatmap.

```python
correlations = air.corr()
sns.heatmap(correlations, annot=True, cmap="RdBu_r", center=0)
```

`.corr()` gives every column's correlation with every other. The heatmap turns
that grid of numbers into a grid of colours.

## The three settings that make it honest

| Setting | Why it matters |
| --- | --- |
| `cmap="RdBu_r"` | a **diverging** palette: two colours meeting in the middle |
| `center=0` | pins white to zero, so pale always means "no relationship" |
| `vmin=-1, vmax=1` | fixes the scale, so two heatmaps can be compared |

Without `center=0` seaborn stretches the colours over whatever range happens to
be present, and a weak correlation of 0.2 can end up screaming bright red.

## Masking the top half

```python
mask = np.triu(np.ones_like(correlations, dtype=bool))
```

A correlation matrix is symmetric: the square for Wind/NO2 and the one for
NO2/Wind hold the same number, and the diagonal is all 1.00 by definition.
`np.triu` builds a True/False triangle and `mask=` hides it, leaving only the
fifteen numbers that say something.

## What this one shows

Wind speed is strongly *negative* with NO2 - wind blows pollution away. NO2 and
PM2.5 move together, because they largely come from the same sources. Traffic and
temperature drift along together without either causing the other: warmer days are
busier days, and that is all the matrix can tell you.

**Try it:** change `cmap` to `"viridis"` and remove `center=0`. The chart still
looks handsome and is much harder to read correctly - which is the point.
