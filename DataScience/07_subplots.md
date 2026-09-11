# Four charts, one story

`plt.subplots(2, 2)` makes a grid and hands back the figure plus an array of axes:

```python
fig, axes = plt.subplots(2, 2, figsize=(11, 7))
axes[0, 0].plot(...)     # top left
axes[1, 1].scatter(...)  # bottom right
```

Each `ax` has the methods you already know, with small name changes: `ax.set_title`
instead of `plt.title`, `ax.set_xlabel` instead of `plt.xlabel`.

## Why `axes.flat`

```python
for ax in axes.flat:
    ax.grid(True, alpha=0.25)
```

`axes` is a 2x2 NumPy array. `.flat` walks all four in one loop, so shared styling
is written once instead of four times.

## Fake data that behaves like real data

There is no traffic log to hand, so the program builds one:

- a `sin` wave for the daily rhythm,
- a narrow `exp` bump for lunchtime,
- `rng.normal` noise so it is not suspiciously smooth.

`np.random.default_rng(seed=7)` fixes the random numbers, so the chart looks the
same every run. Always seed a generator in an example - a chart that changes each
time is impossible to talk about.

## Four chart types, four questions

| Chart | Answers |
| --- | --- |
| line | how does it change over time? |
| bar | how do the categories compare? |
| histogram | how are the values spread? |
| scatter | do two things move together? |

**Try it:** change `plt.subplots(2, 2)` to `plt.subplots(4, 1)` and adjust
`figsize` - the same four charts, stacked, which suits a narrow screen.
