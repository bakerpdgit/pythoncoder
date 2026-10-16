# Bars worth reading

A bar chart compares sizes. Everything in this example is in service of that one
job.

## Horizontal bars for named things

`plt.barh` puts the labels down the side, where long names fit and stay
horizontal. `invert_yaxis()` then puts the biggest bar at the top, which is where
a reader looks first.

## Colour with a purpose

```python
colours = ["#2563eb" if value == share.max() else "#93c5fd" for value in share]
```

Six different colours would mean six things to learn. One highlight colour and one
neutral says *this is the one to look at*. Use colour to say something, or do not
use it.

## Label the bars, then drop the axis

`plt.text` writes the value at the end of each bar. Once every value is written on
the chart, the x-axis has nothing left to tell anyone - so it goes, along with the
box around the plot:

```python
plt.gca().spines["top"].set_visible(False)
```

That is the idea behind Edward Tufte's *data-ink ratio*: every mark on the page
should carry information.

**Try it:** change `plt.barh` to `plt.bar` and see how much harder the six
language names become to read.
