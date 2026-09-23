# Example E: a Train Tracks puzzle

Train Tracks is a logic puzzle. A railway runs across a grid from one edge to another, and the numbers along the top and side tell you how many squares in each column and row contain track. A few pieces are given; you have to work out the rest. This program **generates** new puzzles, **solves** them to check they have a solution, and lets you **play** them, with a timer, hints, undo and saving.

## Running it

Press **Run**. The rules are explained the first time. Then:

- Enter `1` to play, then `G` to generate a board, and choose a size from 4 to 10 (6 is a good start).
- Enter a square as `row,column` (counting from 0, top left is `0,0`), then a shape: `H` horizontal, `V` vertical, `LU`, `LD`, `RU` or `RD` for the corners (the letters say which two sides the track joins), a `.` for "track goes here but I don't know which piece", or `X` for "no track here".
- `u` undoes, `s` shows the solution and `h` gives a hint (after 3 minutes). `SAVE` saves the board to a file you can load later with `F`.

Option `M` lets you type in a puzzle from a newspaper or a puzzle book, and the program will try to solve it.

## Techniques to look for

The whole program is in one file, `main.py` — over 3,000 lines.

- **Puzzle generation.** `GenerateRandomPath.dfs` builds a random route across the board. Starting from a square on the edge, it steps one square at a time in a random direction, using a stack and a set of visited squares so that the track never crosses itself. The route has to finish on an edge, be the right length and pass through every row and column; if it gets stuck or breaks a rule, the attempt is thrown away and a new one begins.
- **A rule-based solver.** `Solver.Solve` works like a person would: it repeatedly applies logical rules ("this row already has its total, so the other squares must be empty", "this square can only connect in two directions, so it must be this shape") until nothing changes. For a generated puzzle, whenever the rules get stuck it reveals one more piece of the answer as a starting piece and carries on — so every puzzle it gives you can be solved by logic alone. For a puzzle you type in, it makes a guess instead and backtracks if the guess leads to a contradiction.
- **Stacks.** Undo keeps a stack of previous moves.
- **Files.** Your settings and statistics are kept in `account.csv`, and saved puzzles are written with Python's `pickle` module.

## Changes made for this demo

- The code is unchanged.
- The program normally creates `account.csv` itself with hints and "show solution" turned off. This demo includes one with both turned on, and the percentage-complete display too, so visitors can try them. They can be changed from the settings menu (option `3`).
