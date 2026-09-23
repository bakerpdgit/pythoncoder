# Example D: Othello

The classic board game (also sold as Reversi), for two players or one player against the computer. Place a piece so that it traps a line of your opponent's pieces between two of yours, and they all flip to your colour. The computer has four levels of difficulty, and games can be saved and loaded.

The student also wrote a graphical version with logins and statistics. It uses tkinter, which cannot run in the browser, so this demo uses the program's terminal version.

## Running it

Press **Run** and answer the questions:

- Type `terminal`, then two player names.
- Choose `1` to play the computer or `2` for two players. Against the computer, pick a difficulty from `1` to `4`.
- Each turn, choose `1` to play, then type a column and a row (both 0–7).
- `2` saves the game and `3` loads one; three saved games are already there to try.

On the board, `1` is black (you), `2` is white and `0` is empty. The four centre squares start filled; a good first move for black is column 2, row 4.

## Difficulty levels

The four levels show four different ways for a computer to choose a move (see `cmove` in `othello.py`):

1. A random legal move.
2. The move that flips the most pieces right now — a *greedy* algorithm.
3. Minimax, looking 3 moves ahead.
4. Minimax, looking 5 moves ahead.

## Techniques to look for

- **Minimax with alpha–beta pruning.** `minimax` in `othello.py` builds a game tree by recursion: it tries every legal move, then every reply, and so on, assuming each player picks their best option. It prints the score of the move it chooses. Alpha–beta pruning skips branches that cannot change the result.
- **Object-oriented design.** `Computer` inherits from `Player`. The terminal interface inherits from an abstract `UI` class, which the graphical version also inherited from — so both front ends share the same `Othello` game logic.
- **A stack.** `stack.py` is a hand-written stack that stores copies of the board so that moves can be undone.
- **2D lists and files.** The board is an 8 × 8 list of lists, and `saveGame`/`loadGame` write it to a text file one row per line. Open `game2.txt` to see the format.

## Changes made for this demo

- The abstract `UI` class was moved, unchanged, from the graphical version's file into its own file, `ui.py`, so the terminal version no longer imports tkinter. `main.py` always starts the terminal version.
- When the computer had no legal move, the game printed "Computer has no valid moves" forever. That branch now passes the turn back instead (see the comment in `othelloTerm.py`).
- The player names in the saved games have been replaced with "Player 1" and "Player 2". The graphical version, its user database and the project's git history are not included.
