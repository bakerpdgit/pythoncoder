# Missing and messy data

Real data has gaps and typos. This bake sale was typed in by several people, and
every one of them spelt things their own way:

```text
Brownie,1.50,24
brownie ,1.50,18
FLAPJACK,1.20,
```

## Gaps arrive as NaN

A blank cell becomes **NaN** - *not a number*. It is not zero: a sum skips it, and
a mean ignores it, so a missing figure quietly changes your answers.

```python
sales.isna().sum()      # how many blanks in each column
```

Notice `sold` prints as `24.0`, not `24`. A column with a NaN in it has to hold
decimals, because NaN is a decimal.

## Two ways to deal with a gap

| Code | When |
| --- | --- |
| `sales["price"].fillna(0.80)` | you *know* what the value should be |
| `sales.dropna(subset=["sold"])` | you cannot know, so the row has to go |

Both blank prices are Cookies, and a Cookie is always 80p, so they can be filled in.
Nobody can guess how many were sold, so those rows are dropped. Deciding which is
which is a judgement, and in a real report you would say what you did.

## Text that should match, and does not

To pandas, `"Brownie"`, `"brownie "` and `" Brownie"` are three different items,
and a `groupby` would give three groups. `.str` applies a string method to every
value in a column:

```python
sales["item"] = sales["item"].str.strip().str.capitalize()
```

`strip()` takes the spaces off both ends; `capitalize()` makes the first letter a
capital and the rest small. `.str.lower()` and `.str.upper()` work too. Print
`unique()` before and after to see the twelve spellings become six items.

**Try it:** comment out the `.str.strip()` and run it again. How many items are
there now, and why?
