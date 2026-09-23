# CONSTANTS
MINE = "*"

# GLOBAL VARIABLES
minefield = [[".", "*", ".", ".", "."],
             [".", ".", ".", "*", "."],
             ["*", ".", ".", ".", "."],
             [".", ".", "*", "*", "."]]
guessRow = 0
guessCol = 0
nearby = 0

# SUBPROGRAMS
def getValidInteger(prompt, low, high):
    # Keeps asking until the user enters a whole number from low to high, then returns it
    value = 0
    value = int(input(prompt))
    while value < low or value > high:
        print("Invalid - enter a number from " + str(low) + " to " + str(high))
        value = int(input(prompt))
    return value


def countMines(grid):
    # Returns the total number of mines in grid
    count = 0
    for r in range(len(grid)):
        for c in range(len(grid[r])):
            if grid[r][c] == MINE:
                count = count + 1
    return count


def countAdjacent(grid, row, col):
    # Returns how many of the (up to 8) cells touching grid[row][col] hold a mine
    count = 0
    for r in range(row - 1, row + 2):
        for c in range(col - 1, col + 2):
            if r >= 0 and r < len(grid) and c >= 0 and c < len(grid[r]):
                if (r != row or c != col) and grid[r][c] == MINE:
                    count = count + 1
    return count


def buildNumberGrid(grid):
    # Returns a new 2D list: a mine stays a mine, every other cell becomes
    # its adjacent-mine count as a string
    numberGrid = []
    newRow = []
    for r in range(len(grid)):
        newRow = []
        for c in range(len(grid[r])):
            if grid[r][c] == MINE:
                newRow.append(MINE)
            else:
                newRow.append(str(countAdjacent(grid, r, c)))
        numberGrid.append(newRow)
    return numberGrid


def displayGrid(grid):
    # Prints grid with column numbers across the top and row numbers down the side
    line = ""

    line = "   "
    for c in range(len(grid[0])):
        line = line + "{:>3}".format(c)
    print(line)

    for r in range(len(grid)):
        line = "{:>3}".format(r)
        for c in range(len(grid[r])):
            line = line + "{:>3}".format(grid[r][c])
        print(line)


# MAIN
print("There are " + str(countMines(minefield)) + " mines hidden in the field.")
guessRow = getValidInteger("Row (0-" + str(len(minefield) - 1) + "): ", 0, len(minefield) - 1)
guessCol = getValidInteger("Column (0-" + str(len(minefield[0]) - 1) + "): ", 0, len(minefield[0]) - 1)

if minefield[guessRow][guessCol] == MINE:
    print("BOOM! You hit a mine.")
else:
    nearby = countAdjacent(minefield, guessRow, guessCol)
    print("Safe! " + str(nearby) + " mine(s) nearby.")

print("Solution:")
displayGrid(buildNumberGrid(minefield))
