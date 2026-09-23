# 2D arrays 1: Unscramble the totals

**Level: trivial - rearrange the lines**

`results` is a 2D array (a list of lists). Each row holds a student's name followed by their marks on three tests. `results[1][0]` is `"Ben"` and `results[1][2]` is Ben's second test mark, `14`.

The program should display a table showing each student's total mark and whether they passed (a total of at least `PASS_MARK`):

```
Name     Total  Result
Asha        45    Pass
Ben         34    Fail
Chloe       56    Pass
Dev         31    Fail
```

## What to do

All of the lines of code under `# MAIN` are present, but they are in the **wrong order**. Rearrange them so the program produces the table above.

Every line already has the **correct indentation** - you only need to move lines up and down, never change their indentation. (Tip: in the editor, **Alt + Up/Down arrow** moves the current line.)

## Things to think about

Which loop goes through the rows, and which goes through the columns of one row? Why does the inner loop start at 1 rather than 0? Where must `total` be reset to 0 so that each student's total starts afresh?

`"{:<8}{:>6}{:>8}".format(...)` lays out three values: the first **left**-aligned in 8 characters, then two **right**-aligned in 6 and 8 characters.

## Checking your work

Your table must match the one above exactly, spaces included.

When you have finished, compare your program with the model solution on the next page.
