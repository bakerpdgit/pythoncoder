# Your first chart

Four lines is all it takes:

```python
plt.plot(months, london)
plt.title("...")
plt.xlabel("...")
plt.show()
```

`plt.plot` draws. `plt.show()` finishes the figure and puts it in the **Display**
pane, below the console.

## Two lines on one pair of axes

Call `plt.plot` twice before `plt.show()` and both series land on the same axes.
Give each a `label` and add `plt.legend()` so the reader knows which is which.

| Argument | Does |
| --- | --- |
| `marker="o"` | a dot at each data point |
| `linewidth=2` | a thicker line |
| `linestyle="--"` | dashes instead of a solid line |
| `label="London"` | the name used by the legend |

## Charts are for comparing, not decorating

The point of putting both cities on one chart is the *gap* between them - which
the last two lines of the program then measure. A chart that shows something you
cannot state in a sentence is usually not finished.

**Try it:** add `plt.fill_between(months, edinburgh, london, alpha=0.15)` before
`show()` to shade the gap you just measured.
