# Task: by year group

Do older students sleep less? Which way of getting to school is quickest?
`groupby` answers both in a line each.

Replace each `____`:

| Line | Should hold |
| --- | --- |
| `sleep_by_year` | the mean `hours_sleep` for each `year_group` |
| `journey_by_mode` | the mean `minutes_to_school` for each `travel_mode` |
| `mode_counts` | how many students use each `travel_mode` |

Each is one Series. The loops underneath print them, one line per group.

## How it is marked

Every printed line - the sleep for each year group, the journey time for each mode
and the count of each mode - is checked against the right answers. Use the default
order `groupby` gives you (no `sort=False`).
