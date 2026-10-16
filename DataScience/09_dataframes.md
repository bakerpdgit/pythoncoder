# Tables with names: pandas

A NumPy table only knows rows and columns by number - `scores[:, 3]` means "column
3", and you have to remember that column 3 was Test 4. **pandas** gives every
column a name, and that is most of what it is for.

```python
planets = pd.DataFrame({
    "planet": ["Mercury", "Venus", ...],
    "moons": [0, 0, ...],
})
```

A **DataFrame** is built from a dictionary: each key becomes a column heading and
each list becomes that column. Every column must be the same length.

## A column is a Series

`planets["moons"]` picks out one column. It is a **Series**: a NumPy array with a
name and row labels (the `0`, `1`, `2`... down the left when you print it). Everything
you learnt about arrays still works on it:

| Code | Gives |
| --- | --- |
| `planets["moons"].sum()` | the total of the column |
| `planets["moons"].mean()` | the average |
| `planets["moons"] > 10` | a True/False mask, one per row |
| `planets["diameter_km"] / 12742` | a whole new column of answers |

## Adding a column

Assign to a name that is not there yet and pandas adds it to the table:

```python
planets["diameter_earths"] = planets["diameter_km"] / 12742
```

No loop: the division happens to every row, exactly as with an array.

## Which row?

`idxmax()` gives the **row label** of the biggest value, the pandas version of
`argmax()`. `.loc[row, column]` then reads one cell:

```python
biggest = planets["diameter_km"].idxmax()     # 4
planets.loc[biggest, "planet"]                # 'Jupiter'
```

**Try it:** add a column `moons_per_au = planets["moons"] / planets["distance_au"]`
and find which planet has the most moons for its distance.
