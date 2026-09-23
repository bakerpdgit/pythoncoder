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
        line = "{:<4}".format(ROW_LETTERS[row])
        for col in range(SEATS_PER_ROW):
            line = line + "{:>3}".format(seats[row][col])
        print(line)


# MAIN
rowLetter = input("Enter row letter (A-D): ").upper()
seatNumber = int(input("Enter seat number (1-6): "))

rowIndex = ord(rowLetter) - ord("A")
colIndex = seatNumber - 1

if seats[rowIndex][colIndex] == FREE:
    seats[rowIndex][colIndex] = TAKEN
    print("Seat " + rowLetter + str(seatNumber) + " booked")
else:
    print("Sorry, seat " + rowLetter + str(seatNumber) + " is already taken")

displaySeats()
