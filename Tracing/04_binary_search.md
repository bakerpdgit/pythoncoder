# Binary search

Binary search repeatedly narrows a sorted search range. This trace shows how a `while` loop can discard half of the remaining values after each comparison.

Watch:

- `low` and `high` — the current inclusive search boundaries
- `middle` — the position tested during this iteration
- `found_at` — assigned when the target is found

For the target `19`, the first middle value is `15`, so `low` moves to `4`. The next middle position is `5` (`24`), so `high` moves to `4`. The final middle position is `4`, where `19` is found.
