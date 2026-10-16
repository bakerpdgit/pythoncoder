# Task: exercise by year group, interactive

An interactive bar chart of how much exercise each year group does:

![preview](chartpreview)

| Line | Should hold |
| --- | --- |
| `by_year` | the mean `exercise_hours` for each `year_group`, with `year_group` kept as a column (`as_index=False`) |
| `figure` | `px.bar` of `by_year`: `year_group` across, `exercise_hours` up |

and give `px.bar`:

| Part | Detail |
| --- | --- |
| Title | `Exercise by year group` |
| Axis names | `labels={"year_group": "Year group", "exercise_hours": "Hours a week"}` |

Hover over the bars when it draws: each one tells you its exact value.

## How it is marked

Your chart is compared with the expected one: the bars' values, the title and the
axis titles.
