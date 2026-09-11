# A chart the reader can interrogate

Everything so far has produced a picture. Plotly produces a small web page, and
the Display pane shows it - so this chart is **live**:

- **hover** a point to read its exact value,
- **drag** across the chart to zoom into a range, double-click to zoom back out,
- **click** a name in the legend to hide that region; double-click to show it
  alone,
- use the toolbar in the top right to download it as a PNG.

None of that is extra code. It is what plotly.js does once the figure exists.

## graph_objects: one trace per series

```python
figure = go.Figure()
figure.add_trace(go.Scatter(x=months, y=values, name="North", mode="lines+markers"))
```

Each `add_trace` adds one series. `plotly.express` would draw the same chart in a
single line from a DataFrame; `graph_objects` is the longer road that lets you set
every detail, which is what this example is for.

## The hover template is the interesting part

```python
hovertemplate="<b>%{fullData.name}</b><br>%{x|%b %Y}<br>£%{y:.1f}k<extra></extra>"
```

| Piece | Does |
| --- | --- |
| `%{x|%b %Y}` | formats the date as `Mar 2024` |
| `%{y:.1f}` | one decimal place |
| `<br>` | a line break inside the tooltip |
| `<extra></extra>` | removes plotly's default grey trace label |

With `hovermode="x unified"`, hovering anywhere shows **all four** regions for that
month in one box - which turns a line chart into a comparison tool.

## When to reach for plotly

Use matplotlib for a chart that will be printed, pasted into a document, or put in
a slide. Use plotly when the reader needs to *explore*: many series, a long time
axis, or values too precise to read off an axis.

**Try it:** swap `shape="spline"` for `shape="hv"` to get a step chart, or add
`figure.update_xaxes(rangeslider=dict(visible=True))` for a draggable range
selector under the chart.
