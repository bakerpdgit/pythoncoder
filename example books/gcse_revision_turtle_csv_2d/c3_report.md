# CSV 3: Exam results report

**Level: medium - the task is described, you write the code**

`results.csv` holds each student's marks on two exam papers, each out of 80. Unlike the earlier files, its **first line is a header row**:

```
name,paper1,paper2
Aisha,62,71
Ben,35,28
```

## Requirements

Ask the user for the pass mark (out of 160) with the prompt `Enter the pass mark (out of 160): `

Read every student from `INPUT_FILE`, skipping the header row. Work out each student's total, and whether they `Pass` (total is **greater than or equal to** the pass mark) or `Fail`.

Write a new file, `OUTPUT_FILE` (`report.csv`), with its own header row followed by one line per student:

```
name,total,result
Aisha,133,Pass
Ben,63,Fail
```

When finished, close both files and display how many students passed, e.g. `Passed: 3 of 6`

## Hints

`readline()` reads a single line, which is a neat way to skip a header row before a `for line in file` loop.

`write()` only accepts a **string**, and does not add a newline for you.

## Checking your work

With a pass mark of 100 you should get `Passed: 3 of 6` - Carys scores exactly 100, so she passes. With 90 you should get `Passed: 4 of 6`. Open `report.csv` in the file browser after each run to check what your program wrote.

When you have finished, compare your program with the model solution on the next page.
