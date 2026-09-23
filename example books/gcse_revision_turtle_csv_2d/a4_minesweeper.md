# 2D arrays 4: Minesweeper

**Level: hard - several requirements, and you must decompose the problem into subprograms**

In the game Minesweeper, a grid hides some mines. When you pick a safe square, you are told how many mines are in the squares touching it - including diagonally - so a square can have up to 8 neighbours.

The 2D array `minefield` stores `"*"` (the constant `MINE`) for a mine and `"."` for a safe square.

## Requirements

Display the number of mines hidden in the field: `There are 5 mines hidden in the field.`

Ask the player for a row (0 to 3) and then a column (0 to 4). Reject any number out of range with a message containing `Invalid`, and ask again.

If that square is a mine display `BOOM! You hit a mine.` Otherwise display, for example, `Safe! 3 mine(s) nearby.`

Finally display `Solution:` and then the whole field, with each safe square replaced by its count of neighbouring mines. Every value is right-aligned in a width of 3, with column numbers across the top and row numbers down the side:

```
Solution:
     0  1  2  3  4
  0  1  *  2  1  1
  1  2  2  2  *  1
  2  *  2  3  3  2
  3  1  2  *  *  1
```

## Decomposition

Your program **must** include these subprograms. They must work for a grid of **any** size, using only their parameters (never the global `minefield`):

| Subprogram | What it does |
|---|---|
| `countMines(grid)` | **Returns** the number of mines in the grid |
| `countAdjacent(grid, row, col)` | **Returns** the number of mines touching `grid[row][col]` (not counting the square itself) |
| `buildNumberGrid(grid)` | **Returns** a new 2D list: mines stay `"*"`, every other square becomes its count **as a string** |
| `displayGrid(grid)` | Prints a grid in the layout shown above |

A validated-input subprogram (as in Turtle 4) is a good idea too.

## Hints

Squares on the edge have fewer neighbours. Check that a row and column are **inside** the grid before looking at them - Python allows negative indexes such as `grid[-1]`, so a missing check will not crash, it will quietly count the wrong squares.

## Example run

```
There are 5 mines hidden in the field.
Row (0-3): 5
Invalid - enter a number from 0 to 3
Row (0-3): 2
Column (0-4): 2
Safe! 3 mine(s) nearby.
Solution:
     0  1  2  3  4
  0  1  *  2  1  1
  ...
```

## Checking your work

Try row 0 column 0 (1 mine nearby), row 2 column 2 (3 mines nearby) and row 0 column 1 (a mine). Try an invalid row first.

Your subprograms should work for **any** grid, not just `minefield`. Test them by temporarily adding lines such as these to the end of your program:

```
print(countAdjacent([["*", ".", "*"], [".", ".", "."], ["*", ".", "*"]], 1, 1))   # 4
print(countAdjacent([[".", "."], [".", "*"]], 0, 0))                              # 1
print(buildNumberGrid([["*", "."], [".", "."]]))       # [['*', '1'], ['1', '1']]
```

When you have finished, compare your program with the model solution on the next page.
