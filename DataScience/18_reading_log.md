# Task: a messy reading log

A class kept a log of the books they read: the `genre`, the number of `pages` and
how many `minutes` it took. Open `data/reading_log.csv` and you will find blanks,
and genres typed every way imaginable: `fantasy`, `Fantasy `, `MYSTERY`...

Replace each `____`:

| Line | Should hold |
| --- | --- |
| `missing` | how many values are missing in each column |
| `log["genre"]` | the genre column with the spaces stripped and every letter lower case |
| `log` | only the rows that have **both** `pages` and `minutes` |

String methods chain: `.str.strip().str.lower()`. And `dropna` can be told which
columns matter with `subset=[...]`.

## How it is marked

The missing counts, the list of genres (there should be exactly four), the number
of complete rows and the reading speeds are checked against the right answers.
