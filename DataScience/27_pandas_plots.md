# A DataFrame can draw itself

Every chart so far was `plt.something(x, y)`, with the columns pulled out first.
pandas has a shortcut: **`.plot()`** on a DataFrame or a Series draws it with
matplotlib, labels and legend included.

```python
ax = weather.plot(x="date", y=["max_temp", "min_temp"])
```

| Argument | Does |
| --- | --- |
| `x="date"` | the column to go along the bottom |
| `y=[...]` | the column, or a list of columns, to draw |
| `kind="bar"` | bars instead of lines (also `"barh"`, `"hist"`, `"scatter"`) |
| `color=`, `figsize=` | as in matplotlib |

## It hands back the axes

`.plot()` returns the **axes** it drew on - the same `ax` as on page 25 - so you
finish the chart with the `ax.set_...` methods:

```python
ax.set_title("Every day of 2025")
ax.set_ylabel("Degrees Celsius")
plt.show()
```

## Dates that are dates

`parse_dates=["date"]` in `read_csv` turns the text `2025-01-01` into a real date.
The x axis then reads as a calendar, with sensible month labels, instead of 365
pieces of text crammed together.

## Group, then draw

The answer from a `groupby` is a Series, so it can draw itself straight away:

```python
weather.groupby("month", sort=False)["rain_mm"].sum().plot(kind="bar")
```

That one line is a summary and its chart. It is how most quick analysis is done.

**Try it:** change `kind="bar"` to `kind="barh"`, then add `ax.invert_yaxis()`.
