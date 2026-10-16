# Task: screen time by year group

Let pandas do the drawing:

![preview](chartpreview)

| Line | Should hold |
| --- | --- |
| `screen_by_year` | the mean `screen_time` for each `year_group` (a groupby) |
| `ax` | that Series drawn as a bar chart with `.plot(kind="bar")` |

Then finish the chart with the axes `.plot()` handed back:

| Part | Detail |
| --- | --- |
| Title | `Screen time by year group` |
| x axis | `Year group` |
| y axis | `Hours a day` |

## How it is marked

Your chart is compared with the expected one: the bars' values, the title and the
axis labels. Draw it with pandas' `.plot()`, as the page asks - `plt.bar` places
its bars differently.
