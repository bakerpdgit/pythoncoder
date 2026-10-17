# Parsons problems

A Parsons problem gives the student the lines of a working program, shuffled, and asks them to put them back in order.

To make one in the book editor, choose **Parsons puzzle** when you add an exercise, or click an exercise's icon and change its kind. Then write the correct program in the code editor. That code *is* the answer.

Select lines and press **Fixed**, **Movable** or **Distractor** above the code (they are on the right-click menu too):

- **Movable** lines are shuffled, and the student puts them in order.
- **Fixed** lines stay where they are.
- **Distractors** are wrong lines mixed in with the rest. The student should hide them with the eye beside each line.

The editor marks each line with its role. Press **Preview as student** to try the puzzle.

Leave instructions in the guide about what the code should do when it is arranged correctly, e.g.

**Sequence the first four lines of the well known children's song**

The student sees one program, not a separate bank of lines. They drag each line by its ⠿ handle (or use Alt+↑ / Alt+↓), hide the lines that do not belong (they wait, struck out, below the program until shown again), and Submit checks the order. The arranged code can be run, debugged and traced like any other.

Behind the scenes the roles are plain comments in the `.py` file, so an older book still works: `#distractor` at the end of a line, and `# start` / `# end` around the movable lines.
