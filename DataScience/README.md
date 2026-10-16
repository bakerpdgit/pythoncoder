# Data Science learning book

Forty pages: twenty worked examples, each followed by a marked task that asks the
student to use what the example has just shown. The tasks are deliberately small.
Most give the program with a few `____` blanks to fill in; the chart tasks give the
data and the structure, and ask for the few lines that draw.

The book runs NumPy, pandas, matplotlib, seaborn and plotly in the browser. numpy,
pandas and matplotlib ship with Pyodide; seaborn and plotly are installed from PyPI
the first time a program imports them, both on Run and on Submit.

## The progression

| # | Page | Introduces | |
| --- | --- | --- | --- |
| 1 | Arrays: whole columns at a time | `np.array`, vectorised arithmetic, `shape`, `dtype` | example |
| 2 | A week of running | arithmetic on whole arrays, `sum()`, no loops | task |
| 3 | Describing a column of numbers | `mean`, `median`, `std`, `argmin`/`argmax`, `percentile`, `cumsum` | example |
| 4 | Reaction times | summary statistics; `argmin` to pick out a name | task |
| 5 | Rows, columns and axis | 2-D arrays, `axis=`, slicing `[:, 3]` | example |
| 6 | House points | `axis=0` / `axis=1`, a column slice | task |
| 7 | Filtering with masks | masks, `&` (and) and `\|` (or), `np.where` | example |
| 8 | Wet days | building and using masks | task |
| 9 | Tables with names: pandas | `DataFrame`, columns as Series, new columns, `idxmax`, `.loc` | example |
| 10 | The tuck shop | a calculated column, `idxmax` | task |
| 11 | Reading a CSV file | `read_csv`, `head`, `shape`, `dtypes`, `describe` | example |
| 12 | A school survey | reading a CSV and answering from columns | task |
| 13 | Choosing rows, and putting them in order | `df[mask]`, `&`, `[[...]]`, `sort_values`, `nlargest` | example |
| 14 | Questions for the survey | filtering on one and two conditions, sorting | task |
| 15 | Groups: split, summarise, combine | `groupby`, `agg`, `value_counts` | example |
| 16 | By year group | `groupby(...)[...].mean()`, `value_counts` | task |
| 17 | Missing and messy data | `NaN`, `isna`, `fillna`, `dropna`, `.str.strip()` | example |
| 18 | A messy reading log | counting gaps, tidying text, dropping incomplete rows | task |
| 19 | Your first chart | `plt.plot`, labels, `legend`, `show` | example |
| 20 | Two days on one chart | two labelled lines, markers, dashes, legend | task |
| 21 | Bars worth reading | `barh`, a highlight colour, labelling bars | example |
| 22 | Favourite subjects | `barh`, a colour list, `invert_yaxis` | task (colours marked) |
| 23 | How values spread, and what moves together | `hist`, `bins`, `axvline`, `scatter` | example |
| 24 | Sleep and screens | a scatter plot, then a histogram | task |
| 25 | Four charts, one story | `subplots`, `axes[r, c]`, `ax.set_title` | example |
| 26 | My week | `subplots(1, 2)`, `suptitle` | task |
| 27 | A DataFrame can draw itself | `df.plot`, `parse_dates`, plotting a groupby | example |
| 28 | Screen time by year group | `groupby(...).plot(kind="bar")` | task |
| 29 | Fitting a trend line | `polyfit`, `corrcoef`, r squared | example |
| 30 | Does the weather sell ice creams? | `polyfit`, `corrcoef`, a prediction | task |
| 31 | Seaborn: style and distributions | `set_theme`, `histplot`, `kde`, `kdeplot` | example |
| 32 | Journey times, the seaborn way | `histplot` with bins and KDE | task |
| 33 | Comparing groups | long data, `boxplot`, `violinplot` | example |
| 34 | Journey time by travel mode | `boxplot` from a DataFrame | task |
| 35 | Everything against everything | `corr`, `heatmap`, a diverging palette | example |
| 36 | What goes with what? | `corr` and an annotated heatmap | task |
| 37 | Interactive charts in one call | `px.scatter`, `px.bar`, `color`, `hover_data`, `as_index=False` | example |
| 38 | Exercise by year group, interactive | `px.bar` from a summary table | task |
| 39 | Plotly in detail, trace by trace | `go.Figure`, `add_trace`, `hovertemplate` | example |
| 40 | Two towns, trace by trace | two `go.Scatter` traces, `update_layout` | task |

Each existing example kept its id when the book grew from twelve pages, so a
student's ticks survived.

## The data

`data/` holds the files the pages read, made up but built to behave like the real
thing:

| File | Rows | What |
| --- | --- | --- |
| `weather.csv` | 365 | a year of daily weather: temperatures, rain, sunshine |
| `survey.csv` | 150 | a school survey: year group, sleep, screen time, exercise, travel |
| `bakesale.csv` | 18 | a bake sale typed in carelessly: blanks and inconsistent spellings |
| `reading_log.csv` | 30 | a class reading log, with gaps and messy genres |

Each activity lists the files it uses as `additionalFiles`, visible, so the student
can open the CSV in the file browser.

## How the tasks are marked

**Number and table tasks** check printed lines. The `print` lines are given and the
student fills in the calculation above them, so the expected output is exact.
Patterns use `"ignore": "w"`, so spacing does not matter. A couple add a code check:
page 2 refuses a `for` loop, and page 30 asks for `polyfit` and `corrcoef`.

**Chart tasks** have a hidden solution file (`NN_name_sol.py`) and a test of type
`chart`:

```json
"tests": [{ "in": [], "out": [{ "typ": "chart", "filename": "20_two_days_sol.py" }] }],
"additionalFiles": [{ "filename": "20_two_days_sol.py", "visible": false }]
```

The tester runs the student's program and the solution, and every `plt.show()` or
`fig.show()` describes the chart it would have shown instead of drawing it
(`src/python/coder_charts.py`). The descriptions are then compared:

- for matplotlib and seaborn: how the figure is divided into charts and its overall
  title; each chart's title, axis labels, legend, any text written on it, whether an
  axis is flipped or logarithmic; and every series on it - lines, bars, scatter
  points, heatmap squares, shaded areas, boxes - with its label and the numbers it
  plots (and, for lines, whether it has markers and whether it is dashed);
- for plotly: the title, the axis titles, and each trace's type, name, mode and
  numbers.

Text is compared ignoring case and spacing. Numbers are compared to about six
significant figures, so `sum(x) / len(x)` passes for `x.mean()`. Colours, sizes,
fonts and styles are **not** compared - unless the test says `"colours": true`, as
page 22's does. So any program that draws the same chart passes: `ax.bar` for
`plt.bar`, a loop for separate calls, the arguments in any order.

When a chart differs, the results list the differences in words ("The chart should
have the title 'Steps'; yours has 'steps per day'", "The line 'Monday' should have
markers at its points") and show the expected chart beside the student's.

`![preview](chartpreview)` in a guide shows the solution's chart: a picture for
matplotlib and seaborn, the live chart for plotly. A program with two charts shows
its first.

## Writing a chart task of your own

1. Write the solution, `NN_name_sol.py`. Fix any randomness with a seed
   (`np.random.default_rng(seed=...)`), or the student and the solution will plot
   different numbers.
2. Write the starter, `NN_name.py`: the solution with the drawing lines taken out.
3. Add a `chart` test naming the solution, and the solution as a hidden additional
   file.
4. Say in the guide exactly what to draw - every title and label - because every
   one of them is checked.
