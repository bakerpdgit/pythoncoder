# 2D arrays 2: Cinema seat booking

**Level: simple - complete the missing lines**

A small cinema screen has 4 rows (A to D) of 6 seats. The 2D array `seats` stores `"-"` for a free seat and `"X"` for a taken one. `seats[0]` is row A, and `seats[0][0]` is seat A1.

The program asks for a seat, books it if it is free, then displays the seating plan.

## What to do

(1) - (3) Complete `displaySeats`. The first line of the plan (the seat numbers) is done for you. For each row, build a string starting with the row letter **left**-aligned in a width of 4, then add each seat **right**-aligned in a width of 3, then print it.

(4) Convert the row letter to a row index (A is 0, B is 1, ...) and the seat number to a column index. `ord("C") - ord("A")` is 2.

(5) If the seat is free, mark it as taken and display `Seat B2 booked`. Otherwise display `Sorry, seat B2 is already taken`.

## Example run

```
Enter row letter (A-D): B
Enter seat number (1-6): 2
Seat B2 booked
      1  2  3  4  5  6
A     -  X  X  -  -  -
B     -  X  -  X  -  -
C     X  X  -  -  -  X
D     -  -  -  -  -  -
```

## Checking your work

Try booking B2 (free), A2 (already taken) and d6 (lower case, which the provided `.upper()` handles). Check your plan lines up exactly like the example, spaces included.

When you have finished, compare your program with the model solution on the next page.
