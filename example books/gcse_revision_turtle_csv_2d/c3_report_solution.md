# CSV 3 solution: Exam results report

A model solution for **CSV 3**. Run it, enter a pass mark, then open `report.csv` in the file browser to see what was written.

## Worth noticing

Two files are open at once: one for reading (`"r"`) and one for writing (`"w"`). Opening with `"w"` creates the file, or empties it if it already exists.

`inFile.readline()` reads (and throws away) the header row before the `for` loop starts, so the loop only sees student lines.

`write()` needs a single string, so the total is converted with `str()` and the newline is added by hand: `"\n"`.

`>=` matters: Carys scores exactly 100, so with a pass mark of 100 she passes.
