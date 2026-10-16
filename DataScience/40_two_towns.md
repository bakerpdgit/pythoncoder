# Task: two towns, trace by trace

Visitors to two towns, month by month - a seaside town and a hill town - built the
`graph_objects` way, one trace at a time:

![preview](chartpreview)

| Part | Detail |
| --- | --- |
| Trace 1 | `go.Scatter` of `seaview` against `months`, named `"Seaview"`, `mode="lines+markers"` |
| Trace 2 | the same for `hillford`, named `"Hillford"` |
| Title | `Visitors by month` |
| x axis | `Month` (`xaxis_title=`) |
| y axis | `Visitors (thousands)` (`yaxis_title=`) |

The first trace is started for you; the second is a copy with two things changed.
Everything for the layout goes in one `update_layout(...)`.

Then hover across the chart. Which town would you rather run a cafe in?

## How it is marked

Your chart is compared with the expected one: each trace's name, numbers and mode,
the title and both axis titles.
