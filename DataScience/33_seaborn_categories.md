# Comparing groups

Up to now every chart took arrays. Seaborn is happier with a **DataFrame** in
*long* form: one row per observation, and a column naming the group.

```text
   mode    minutes
0  Walk    26.4
1  Walk    21.9
2  Cycle   17.2
```

That is what `x="mode", y="minutes"` refers to - column names, not arrays. Getting
data into this shape is most of the work in real analysis, which is why
`pd.DataFrame` earns its place here.

## describe() before you draw

```python
commutes.groupby("mode")["minutes"].describe()
```

Count, mean, standard deviation, min, quartiles, max - for every group, in one
line. Read that table before drawing anything.

## Box plot or violin plot?

A **box plot** shows five numbers: the median line, the box covering the middle
half (the interquartile range), whiskers to the bulk of the rest, and dots for
outliers. Compact, and unambiguous.

A **violin plot** keeps all of that and wraps it in the shape of the distribution.
Wider means more observations at that value. It is the one to reach for when a
group might be *bimodal* - two humps that a box plot would flatten into one
innocent-looking box.

Look at Bus and Train: similar medians, but the train's spread is far wider. Some
train journeys are quick; some are nothing of the kind.

**Try it:** add `sns.stripplot(data=commutes, x="mode", y="minutes", size=2,
color="black", alpha=0.3, ax=axes[0])` to scatter the raw points over the boxes.
