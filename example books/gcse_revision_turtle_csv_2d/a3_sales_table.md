# 2D arrays 3: Sales table

**Level: medium - the task is described, you write the code**

`sales` is a 2D array holding each salesperson's sales (in £) for the four quarters of the year. Row `r` belongs to `names[r]`, and column `c` is quarter `c + 1`.

## Requirements

Display the sales as a table, with a **total for each row** in the last column and a final **Total row** holding the total for each quarter and the grand total:

```
Name         Q1       Q2       Q3       Q4      Total
Ava     1200.50   980.00  1430.25  1100.00    4710.75
Bilal    860.00  1510.75   990.40  1320.00    4681.15
Cleo    1405.10  1230.00   875.60  1640.30    5151.00
Dan      990.00  1045.50  1380.00  1210.20    4625.70
Total   4455.60  4766.25  4676.25  5270.50   19168.60
```

The layout must be exact:

| Column | Format |
|---|---|
| Name (and the headings `Name`, `Total`) | left-aligned, width 6 |
| Each quarter (and headings `Q1` ...) | right-aligned, width 9, 2 decimal places |
| Row total (and heading `Total`) | right-aligned, width 11, 2 decimal places |

After the table, ask `Enter a quarter (1-4): `. If the number is not 1 to 4, display a message containing `Invalid` and ask again.

Then display the salesperson with the highest sales in that quarter:

```
Top seller in Q3: Ava (£1430.25)
```

## Hints

`"{:>9.2f}".format(980)` gives `"   980.00"`. You can build each line of the table as a string and print it once it is complete.

For the Total row, think about which loop needs to be on the outside.

## Checking your work

Your table must match the one above exactly, spaces included. The top sellers are Cleo in Q1, Bilal in Q2 (£1510.75), Ava in Q3 and Cleo in Q4 (£1640.30). Try some invalid quarters such as 0 and 5 first.

When you have finished, compare your program with the model solution on the next page.
