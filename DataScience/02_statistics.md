# Describing a column of numbers

Before you draw anything, you look at the numbers. NumPy gives you the standard
summaries as methods on the array itself.

| Call | Question it answers |
| --- | --- |
| `.mean()` | what is typical? |
| `np.median()` | what is typical, ignoring extremes? |
| `.std()` | how spread out are they? |
| `.min()` / `.max()` | how low and how high? |
| `.argmin()` / `.argmax()` | *which one* was lowest or highest? |

## argmin and argmax are the useful pair

`rainfall.min()` tells you the driest month had 46.7mm. `rainfall.argmin()` tells
you it was month number 6 - and because `months` is in the same order, that index
turns straight into `"Jul"`. Finding *where* something happened is usually more
interesting than the value itself.

## Mean or median?

Here they sit close together, so the year is fairly even. When they drift apart,
something lopsided is going on: one enormous value drags the mean but barely
moves the median. That gap is a signal worth noticing.

## Cumulative sums

`np.cumsum` gives a running total - rain so far by the end of each month. The same
function turns daily cases into a case total, or daily takings into
takings-to-date.

**Try it:** add a freak month of `250.0` to the end of `rainfall` and print the
mean and median again. Watch which one moves.
