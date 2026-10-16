# Groups: split, summarise, combine

"Which month was wettest?" is a question about **groups** of rows. You could filter
twelve times, once per month. `groupby` does all twelve at once:

```python
weather.groupby("month")["rain_mm"].sum()
```

Read it in three steps:

1. **split** the rows into groups, one for each different `month`;
2. take the `rain_mm` column in each group;
3. **summarise** each group with `.sum()` - and combine the answers into one Series,
   one row per month.

Any summary works in the last step: `.mean()`, `.max()`, `.min()`, `.median()`,
`.count()`. `agg(["mean", "max"])` asks for several at once and gives a table.

## The order of the groups

`groupby` sorts the groups, which puts the months in alphabetical order - Apr, Aug,
Dec... `sort=False` keeps them in the order they first appear in the data, which here
is the calendar.

## The answer is a Series

So everything from pages 9 to 13 works on it: `.idxmax()` names the wettest month,
`.round(1)` tidies it, `.sort_values()` ranks it.

## Counting: value_counts

```python
weather["wet"].value_counts()
```

counts how many times each value appears in a column - here, how many days were wet
and how many dry. It is `groupby` and `count` in one word.

**Try it:** which month had the most sunshine in total? And which had the sunniest
single day? (One is `.sum()`, the other is `.max()`.)
