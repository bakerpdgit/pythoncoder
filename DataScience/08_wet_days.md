# Task: wet days

`rain` holds two weeks of rainfall in millimetres, one value per day in `days`.

Replace each `____`:

| Line | Should hold |
| --- | --- |
| `wet` | a mask: `True` on every day with any rain at all |
| `wet_days` | the day numbers (from `days`) on which it rained |
| `drizzle` | a mask for days with at least 1mm but less than 5mm |
| `labels` | `"wet"` or `"dry"` for every day, using `np.where` |

`drizzle` needs two conditions joined with `&`. Page 7 explains why each one needs
its own brackets.

## How it is marked

The printed lists and totals are checked against the right answers.
