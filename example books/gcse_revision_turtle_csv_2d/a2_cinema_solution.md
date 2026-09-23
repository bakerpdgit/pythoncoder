# 2D arrays 2 solution: Cinema seat booking

A model solution for **2D arrays 2**. Run it and try booking a free seat and a taken one.

## Worth noticing

`ord(rowLetter) - ord("A")` turns A, B, C, D into 0, 1, 2, 3. Seat numbers start at 1 but indexes start at 0, hence `seatNumber - 1`.

`seats[rowIndex][colIndex] = TAKEN` changes one element of the 2D array in place.

`displaySeats` builds each line as a string and prints it once complete. The local variable `line` is initialised at the start of the subprogram.
