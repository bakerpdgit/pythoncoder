# Seaborn: matplotlib that has read a style guide

Seaborn is a layer on top of matplotlib. Every seaborn chart *is* a matplotlib
chart - which is why `plt.show()`, `ax.set_title` and everything else you already
know still work.

What it adds is statistics and defaults.

## One line restyles everything

```python
sns.set_theme(style="whitegrid", palette="deep")
```

That changes the grid, fonts, colours and spines for every chart drawn afterwards,
including plain `plt.plot` calls. Styles worth knowing: `whitegrid`, `darkgrid`,
`white`, `ticks`.

## Distributions without the work

| Call | Draws |
| --- | --- |
| `sns.histplot(x, bins=30)` | a histogram |
| `sns.histplot(x, kde=True)` | the same, plus a smooth density curve |
| `sns.kdeplot(x, fill=True)` | just the smooth curve, shaded |

The KDE curve is a *kernel density estimate*: a smoothed guess at the underlying
shape. It is the right tool for comparing two distributions, because two sets of
bars on one chart fight each other while two curves do not.

## Reading the right-hand chart

Both departments have a similar median, but the emergency curve has a much longer
tail to the right - a minority of patients wait far longer. The medians hide that
completely, which is exactly why you draw the distribution.

**Try it:** swap `sns.set_theme(style="whitegrid")` for `style="darkgrid"`, then
`"ticks"`. Nothing else in the program changes.
