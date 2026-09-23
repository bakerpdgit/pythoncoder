# CSV 4: Validating orders

**Level: hard - several requirements, and you must decompose the problem into subprograms**

An online stationery shop exports its orders to `orders.csv`, one order per line in the form `orderID,product,quantity,unitPrice`. Some lines have been corrupted:

```
1001,Pencil,12,0.35
1003,Eraser,,0.50
1004,Notebook,five,2.50
1008,Highlighter,6
```

## Requirements

An order is **valid** only if it has **exactly 4 fields**, the product name is **not empty**, and the quantity is a **whole number of at least 1**. You can assume every unit price is a valid number.

For each **valid** order, calculate its line total (quantity x unit price, rounded to 2 decimal places). Write the original order to `valid_orders.csv` with the line total added as a fifth field, always shown to 2 decimal places:

```
1001,Pencil,12,0.35,4.20
```

For each **invalid** order, display `Invalid order: ` followed by its order ID.

At the end, display a summary. Money must be shown with a pound sign and 2 decimal places:

```
Valid orders: 5
Invalid orders: 4
Total value: £34.59
```

## Decomposition

Your program **must** include these subprograms. Use exactly these names and parameters:

| Subprogram | What it does |
|---|---|
| `isValidOrder(orderFields)` | Takes one line already split into a list; **returns** `True` or `False` |
| `calculateLineTotal(quantity, unitPrice)` | **Returns** the line total as a real number rounded to 2 d.p. |
| `formatMoney(amount)` | **Returns** a string such as `"£7.00"` |

## Hints

Be careful about the **order** of your validation checks: you cannot look at `orderFields[2]` if the list only has 2 items. `"5".isdigit()` is `True`, but `"five".isdigit()` and `"".isdigit()` are both `False`.

`"{:.2f}".format(4.2)` gives the string `"4.20"`.

## Checking your work

Orders 1003, 1004, 1007 and 1008 should be rejected. Open `valid_orders.csv` in the file browser to check it holds exactly 5 lines, each with its line total to 2 decimal places.

Think about edge cases for `isValidOrder`: an empty quantity, a quantity of `"0"`, and a line with only 3 fields. Did you round in `calculateLineTotal`? `12 * 0.35` should give `4.2`, not `4.199999999999999`.

When you have finished, compare your program with the model solution on the next page.
