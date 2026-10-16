# How values spread, and what moves together

Page 19 drew a line: how something changes over time. Two more charts answer the
next two questions anyone asks of data.

## A histogram: how are the values spread?

```python
plt.hist(temps, bins=20)
```

`hist` sorts the 365 temperatures into 20 equal-width **bins** and draws a bar for
each, as tall as the number of days that fell in it. It answers "what is a typical
day like, and how unusual is a hot one?" at a glance.

| Argument | Does |
| --- | --- |
| `bins=20` | how many bars. Too few hides the shape; too many is noise |
| `edgecolor="white"` | a gap between bars, so they read as separate |

`plt.axvline(x)` draws a vertical line across the chart - here at the mean, so the
reader can see which side most days fall.

## A scatter plot: do two things move together?

```python
plt.scatter(weather["sunshine_h"], weather["max_temp"])
```

One dot per row: its x from one column, its y from another. If the cloud of dots
leans up to the right, the two rise together. `alpha=0.5` makes the dots
see-through, so where many overlap looks darker.

## Two charts, two show() calls

Each `plt.show()` finishes the chart so far and sends it to the Display pane. The
next `plt.plot`, `plt.hist` or `plt.scatter` then starts a fresh one. So this program
draws two separate charts.

**Try it:** change `bins=20` to `bins=5` and then `bins=80`. Which tells the truth
about the year best?
