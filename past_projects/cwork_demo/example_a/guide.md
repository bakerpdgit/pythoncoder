# Example A: a Blokus-style strategy game

A two-player tile-laying game written in Python with **pygame**. Players take turns dragging their pieces onto the board. After your first go, every new piece must touch one of your own pieces **only at a corner** — never along an edge — so the game is all about claiming space while blocking your opponent. Bigger pieces score more points.

Player 2 can be a **computer opponent** that looks ahead several moves to choose the best one.

## Playing

Press **Run**. After the title screen fades you get the main menu:

- **Play** starts a game. With the computer player off, two people share the mouse.
- **Customise** lets you switch the computer player on (**AI OFF** becomes **AI ON**) and pick easy, medium or hard. You can also add a turn timer and change the board size and colours. Press **Return** to go back.
- **Instructions** explains the rules.

Drag a piece from your side of the screen and drop it on the board. If the move is not allowed the piece jumps back. When the computer is playing, the screen pauses for a moment while it thinks.

## What is inside

The project is split across three Python files, which you can open from the file browser while the game runs:

| File | What it does |
| --- | --- |
| `pygame_maingame.py` | The game itself: players, turns, scoring, the menus and the computer player |
| `pygame_pieces.py` | A `Piece` class that knows its shape, where it is and whether a move is legal |
| `pygame_button.py` | Every button and menu screen |

## Techniques to look for

- **Object-oriented design.** `Game`, `Player`, `Piece`, `Button` and `Display` are all classes. Each object looks after its own data — a `Piece` works out for itself whether it touches the corner of another piece of the same colour.
- **Minimax with alpha–beta pruning.** Search `pygame_maingame.py` for `def minimax`. The computer tries each legal move, then each reply its opponent could make, and so on, building a *game tree*. It assumes you will always play your best move, and picks the move that leaves it best off. *Alpha–beta pruning* skips branches that cannot change the answer, which matters because Blokus has hundreds of legal moves on most turns.
- **A stack to undo moves.** To explore the tree the computer has to try a move and then take it back. `push_state` saves the game before a trial move and `pop_state` restores it afterwards — last in, first out.
- **A game loop with states.** One `while` loop runs the whole program. A variable called `state` (`"MENU"`, `"BOARD"`, `"CUSTOMISE"`…) decides what happens on each pass, which makes the program a simple *finite state machine*.

## Changes made for this demo

This is the student's own code. The only changes are:

- Three images had been saved with a `.png` name but were really JPEG or WebP pictures, and the menu background was a JPEG. The browser version of pygame only reads PNG, so all four were converted to real PNG files (the code now loads `menu_background.png`).
- The computer's first move is chosen at random with `random.randint(0, len(moves))`, which can pick one past the end of the list and crash. It now uses `len(moves) - 1`.
