# Interactive charts in one call: plotly express

Matplotlib draws a picture. **Plotly** draws a small web page, so the chart in the
Display pane is **live**: hover a dot to see its row, drag to zoom in, double-click
to zoom out, click a name in the legend to hide it.

`plotly.express` (imported as `px`) makes a whole chart from a DataFrame in one call:

```python
figure = px.scatter(survey, x="screen_time", y="hours_sleep", color="travel_mode")
figure.show()
```

You name the DataFrame, then name its **columns** - not arrays, just the column
names as text.

## What one call can do

| Argument | Does |
| --- | --- |
| `color="travel_mode"` | a colour, and a legend entry, for each group |
| `hover_data=["student"]` | more columns in the box that follows the pointer |
| `title="..."` | the chart's title |
| `labels={"screen_time": "..."}` | readable names for the axes and legend |

`px.line`, `px.bar`, `px.histogram` and `px.box` take the same arguments.

## Summary tables need a column to name

`px` wants column names, but a `groupby` answer keeps the groups in its row labels.
`as_index=False` keeps them as an ordinary column instead:

```python
by_year = survey.groupby("year_group", as_index=False)["hours_sleep"].mean()
px.bar(by_year, x="year_group", y="hours_sleep")
```

Print `by_year` with and without `as_index=False` to see the difference.

**Try it:** hover over the dots at the far right of the scatter plot. Which year
groups are they from?
