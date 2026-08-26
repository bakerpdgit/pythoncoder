# Tracing learning book

All five pages are examples rather than assessed activities. They progress from a running total through selection, nested loops, binary search, and recursive merge sort.

To open this book and make **Trace** the default run button, append this query string to the deployed Coder URL:

```text
?book=https%3A%2F%2Fraw.githubusercontent.com%2Fbakerpdgit%2Fpythoncoder%2Fmain%2FTracing%2Fbook.json&mode=Trace&showFirst=true
```

The parameters may appear in any order. `mode` accepts `Debug`, `Run`, or `Trace` without regard to letter case. `showFirst` immediately opens the first example and loads its Python into the editor; without it the link opens the book's contents page as before.

To send students straight to **one** page instead, add `challenge=` with that page's `id` from `book.json` (for example `challenge=tracing-bubble-sort`). It supersedes `showFirst`, and in a book with sub-books it also accepts a sub-book's `id` to open that section's contents. Always keep `book=` pointing at the **root** `book.json` — completion ticks are recorded against it, so linking a sub-book as the root would give students a separate tick history. If the id no longer exists the link still opens the book, at its contents page.

You do not have to build these by hand: right-click any page or the book name in the Book panel and choose *Create student link to here…*, or use **Student links** in the Teacher Tools panel.
