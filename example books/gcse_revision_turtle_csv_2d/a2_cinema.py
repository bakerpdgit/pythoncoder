# CONSTANTS
SEATS_PER_ROW = 6
FREE = "-"
TAKEN = "X"
ROW_LETTERS = "ABCD"

# GLOBAL VARIABLES
seats = [["-", "X", "X", "-", "-", "-"],
         ["-", "-", "-", "X", "-", "-"],
         ["X", "X", "-", "-", "-", "X"],
         ["-", "-", "-", "-", "-", "-"]]
rowLetter = ""
seatNumber = 0
rowIndex = 0
colIndex = 0

# SUBPROGRAMS
def displaySeats():
    # Prints the plan: seat numbers across the top, row letters down the side
    line = ""

    line = "    "
    for col in range(SEATS_PER_ROW):
        line = line + "{:>3}".format(col + 1)
    print(line)

    for row in range(len(seats)):
        # (1) Start line with this row's letter, left-aligned in a width of 4
        # (2) Add every seat in the row, each right-aligned in a width of 3
        # (3) Print the line
        pass


# MAIN
rowLetter = input("Enter row letter (A-D): ").upper()
seatNumber = int(input("Enter seat number (1-6): "))

# (4) Convert rowLetter to rowIndex (A -> 0, B -> 1 ...) and seatNumber to colIndex


# (5) If the seat is free, mark it as taken and display "Seat B2 booked"
#     otherwise display "Sorry, seat B2 is already taken"


displaySeats()
