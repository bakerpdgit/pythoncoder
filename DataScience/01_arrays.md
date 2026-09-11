# Whole columns at a time

A data scientist rarely works with one number. They work with a *column* of them:
every reading from a sensor, every mark in a class, every day of a year.

NumPy exists so you can write the calculation once and have it happen to the
whole column:

```python
fahrenheit = celsius * 9 / 5 + 32
```

There is no loop. `celsius` holds seven temperatures, so `fahrenheit` holds seven
answers. This is called **vectorisation**, and it is the idea the rest of data
science is built on.

## What an array knows about itself

| Attribute | Meaning | Here |
| --- | --- | --- |
| `shape` | how many rows and columns | `(7,)` - seven values in one row |
| `dtype` | what kind of number | `float64` |
| `size` | how many values in total | `7` |

A Python list knows none of this. That is the trade: an array must hold one type
of number, and in exchange it can do arithmetic at the speed of C.

## Two arrays together

`celsius - overnight_low` lines the two arrays up and subtracts them one pair at a
time. Arrays only combine like this when their shapes fit - make `overnight_low`
six numbers long and NumPy will tell you exactly why it cannot.

**Try it:** print `celsius > 25`. You get an array of `True`/`False`, one per day.
Example 4 shows what that is for.
