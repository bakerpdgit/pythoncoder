# Asking a question of every value

`temps >= 28.0` does not give you `True` or `False`. It gives you **thirty** of
them - one answer per day. That array is called a **mask**.

```python
hot = temps >= 28.0        # [False, False, ..., True, ...]
days[hot]                  # only the days where the mask is True
temps[hot].mean()          # the average of just those temperatures
```

Indexing one array with another array's mask is the move to remember. It reads
almost as English: *the days where it was hot*.

## Combining conditions

Use `&` for "and" and `|` for "or" - not the words `and` / `or`, which only work
on single `True`/`False` values. And **bracket each side**:

```python
pleasant = (temps >= 20.0) & (temps < 26.0)
```

Without the brackets Python's operator precedence gets there first and the result
is nonsense.

## np.where labels everything at once

```python
np.where(condition, value_if_true, value_if_false)
```

Nest a second `np.where` in the false slot and you have a three-way label with no
loop at all. Counting each group is then just another mask:
`(labels == "hot").sum()`.

**Try it:** find the longest run of consecutive hot days. (Hint: `np.diff` on
`days[hot]` tells you where the run breaks.)
