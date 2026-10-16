# Reading a CSV file

Nobody types a year of data into a program. It arrives as a file, and the most
common kind is **CSV** - *comma-separated values*. Open `data/weather.csv` in the
file browser and you will see it is just text:

```text
date,month,max_temp,min_temp,rain_mm,sunshine_h
2025-01-01,Jan,0.4,-4.7,0.0,2.4
2025-01-02,Jan,5.8,1.6,4.0,0.0
```

The first line names the columns; every line after it is one row.

```python
weather = pd.read_csv("data/weather.csv")
```

One line, and all 365 rows are a DataFrame.

## Look before you do anything

| Code | Tells you |
| --- | --- |
| `weather.head()` | the first five rows (`head(10)` for ten) |
| `weather.shape` | `(rows, columns)` |
| `weather.dtypes` | what pandas decided each column holds |
| `weather.describe()` | count, mean, spread, min, quartiles and max of every numeric column |

`dtypes` is worth a glance every time. Numbers should be `float64` or `int64`;
text is `object`. A column of numbers that comes out as `object` has something
that is not a number hiding in it - a typo, a unit, a blank typed as `"-"` - and
page 17 is about finding it.

## describe() is a first draft of the story

Read the table it prints: the hottest day was 30.2C, half the days had no rain at
all (the median `rain_mm` is 0.0), and the mean of 2.3mm is pulled up by a few very
wet days. That is three things worth knowing before a single chart.

**Try it:** `weather["month"].value_counts()` counts the rows for each month. Do
the counts look right for a year?
