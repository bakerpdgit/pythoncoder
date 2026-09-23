# GCSE Revision: Turtle, CSV files and 2D arrays

A flat learning book of 24 pages: 12 exercises (four per topic, trivial → hard), each
followed straight away by its model solution. Every page is an example, so there is no
Submit button — students run their code, decide for themselves when they are done, and
then check the next page. Each exercise guide ends with a "Checking your work" section
listing inputs to try and the results to expect.

Every program follows the Edexcel GCSE template (`# LIBRARIES`, `# CONSTANTS`,
`# GLOBAL VARIABLES`, `# SUBPROGRAMS`, `# MAIN`) with UPPERCASE constants, camelCase
names and all variables initialised (globals at global level, locals at the start of
their subprogram; loop counters are initialised by their `for`).

Open it with `?book=<url of this folder's book.json>` — once pushed, that is
`https://raw.githubusercontent.com/bakerpdgit/pythoncoder/HEAD/example%20books/gcse_revision_turtle_csv_2d/book.json`.

## Files

`<stem>.py` / `<stem>.md` is an exercise (starter code and guide), and
`<stem>_solution.py` / `<stem>_solution.md` is its model solution. The four `.csv` files
are the data for the CSV exercises and their solutions.

## Turtle pictures in the guides

Each turtle exercise guide contains `![preview](turtlepreview)`, which the app replaces
with a drawing made by running the model solution. The app only finds that solution
through a `t` test naming it, so each turtle exercise carries one test
(`{"typ": "t", "filename": "<stem>_solution.py"}`, whose `in` gives the inputs to draw
with) and lists the solution as a hidden additional file. Because the page is marked
`isExample`, the test is never offered as a Submit — it only drives the picture.
Converting one of these pages to a task in the book editor drops its tests, and with
them the picture.

## The exercises

| Topic | Level | Task | Style |
|---|---|---|---|
| Turtle | Trivial | Fix the hexagon | 5 errors (4 syntax/runtime, 1 logic) |
| Turtle | Simple | A row of squares | complete numbered lines |
| Turtle | Medium | Archery target | task only; validation loop |
| Turtle | Hard | Bar chart of scores | 4 required subprograms |
| CSV | Trivial | Big cities | 6 blanks |
| CSV | Simple | Club members by year | complete numbered lines |
| CSV | Medium | Exam results report | task only; skip a header row, write a CSV |
| CSV | Hard | Validating orders | 3 required subprograms |
| 2D arrays | Trivial | Unscramble the totals | reorder lines, indentation already correct |
| 2D arrays | Simple | Cinema seat booking | complete numbered lines |
| 2D arrays | Medium | Sales table | task only; row/column totals, `format` widths |
| 2D arrays | Hard | Minesweeper | 4 required subprograms |
