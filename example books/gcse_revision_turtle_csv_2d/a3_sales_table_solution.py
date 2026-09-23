# CONSTANTS
NUM_QUARTERS = 4

# GLOBAL VARIABLES
names = ["Ava", "Bilal", "Cleo", "Dan"]
sales = [[1200.50, 980.00, 1430.25, 1100.00],
         [860.00, 1510.75, 990.40, 1320.00],
         [1405.10, 1230.00, 875.60, 1640.30],
         [990.00, 1045.50, 1380.00, 1210.20]]
line = ""
rowTotal = 0.0
columnTotal = 0.0
grandTotal = 0.0
quarter = 0
topIndex = 0

# MAIN
# Heading row
line = "{:<6}".format("Name")
for q in range(NUM_QUARTERS):
    line = line + "{:>9}".format("Q" + str(q + 1))
line = line + "{:>11}".format("Total")
print(line)

# One row per salesperson, with a row total at the end
for row in range(len(sales)):
    rowTotal = 0.0
    line = "{:<6}".format(names[row])
    for col in range(NUM_QUARTERS):
        line = line + "{:>9.2f}".format(sales[row][col])
        rowTotal = rowTotal + sales[row][col]
    line = line + "{:>11.2f}".format(rowTotal)
    print(line)

# Final row of column totals, then the grand total
line = "{:<6}".format("Total")
for col in range(NUM_QUARTERS):
    columnTotal = 0.0
    for row in range(len(sales)):
        columnTotal = columnTotal + sales[row][col]
    line = line + "{:>9.2f}".format(columnTotal)
    grandTotal = grandTotal + columnTotal
line = line + "{:>11.2f}".format(grandTotal)
print(line)

# Top seller in a chosen quarter
quarter = int(input("Enter a quarter (1-4): "))
while quarter < 1 or quarter > NUM_QUARTERS:
    print("Invalid - enter 1, 2, 3 or 4")
    quarter = int(input("Enter a quarter (1-4): "))

topIndex = 0
for row in range(1, len(sales)):
    if sales[row][quarter - 1] > sales[topIndex][quarter - 1]:
        topIndex = row

print("Top seller in Q" + str(quarter) + ": " + names[topIndex]
      + " (£" + "{:.2f}".format(sales[topIndex][quarter - 1]) + ")")
