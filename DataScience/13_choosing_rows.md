# Choosing rows, and putting them in order

On page 7 a mask picked values out of an array. In pandas it picks **rows** out of a
table:

```python
hot = weather["max_temp"] >= 25     # a True/False for each of the 365 days
hot_days = weather[hot]             # only the rows where it is True
```

`hot_days` is still a DataFrame, with every column, just fewer rows. Most of the
time it is written in one go:

```python
weather[weather["max_temp"] >= 25]
```

Read it from the inside out: *the weather rows where max_temp is at least 25*.

## More than one condition

The rules from page 7 still apply: `&` for and, `|` for or, and **brackets round
each condition**.

```python
weather[(weather["sunshine_h"] < 1) & (weather["rain_mm"] > 10)]
```

## Which columns?

Single brackets give one column (a Series); **double** brackets give a smaller
table with the columns you list:

```python
weather[["date", "rain_mm"]]
```

## Putting rows in order

| Code | Does |
| --- | --- |
| `sort_values("rain_mm")` | smallest first |
| `sort_values("rain_mm", ascending=False)` | biggest first |
| `.head(5)` | then keep the first five |
| `nlargest(3, "sunshine_h")` | the three biggest, in one step |

`len(table)` counts the rows, which is how "how many days..." questions are
answered.

**Try it:** find the days that were both dry (`rain_mm == 0`) and colder than 3C.
Which months are they in?
