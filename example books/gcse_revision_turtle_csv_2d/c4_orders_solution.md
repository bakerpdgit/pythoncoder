# CSV 4 solution: Validating orders

A model solution for **CSV 4**. Run it, then open `valid_orders.csv` in the file browser.

## Worth noticing

`isValidOrder` checks the **length first**. Because it uses `elif`, the later checks are only reached when the earlier ones pass, so `orderFields[2]` is never looked at on a line that is too short.

`isdigit()` rejects `""`, `"five"` and `"-3"`, so `int()` is only called on a string that is safe to convert. A quantity of `"0"` passes `isdigit()`, which is why there is a separate check for at least 1.

`round(quantity * unitPrice, 2)` matters: `12 * 0.35` is actually `4.199999999999999` in binary floating point.

Formatting (`"{:.2f}"`) is kept separate from calculating: numbers stay as numbers until the moment they are written or displayed.
