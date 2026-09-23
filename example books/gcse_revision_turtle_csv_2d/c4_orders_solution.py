# CONSTANTS
ORDERS_FILE = "orders.csv"
VALID_FILE = "valid_orders.csv"
NUM_FIELDS = 4

# GLOBAL VARIABLES
line = ""
fields = []
lineTotal = 0.0
grandTotal = 0.0
numValid = 0
numInvalid = 0

# SUBPROGRAMS
def isValidOrder(orderFields):
    # Returns True if orderFields (one row of the file, already split) is a valid order
    valid = True
    if len(orderFields) != NUM_FIELDS:
        valid = False
    elif orderFields[1] == "":
        valid = False
    elif not orderFields[2].isdigit():
        valid = False
    elif int(orderFields[2]) < 1:
        valid = False
    return valid


def calculateLineTotal(quantity, unitPrice):
    # Returns the cost of quantity items at unitPrice each, rounded to 2 d.p.
    return round(quantity * unitPrice, 2)


def formatMoney(amount):
    # Returns amount as a string in pounds with exactly 2 d.p., e.g. 7 -> "£7.00"
    return "£" + "{:.2f}".format(amount)


# MAIN
inFile = open(ORDERS_FILE, "r")
outFile = open(VALID_FILE, "w")

for line in inFile:
    fields = line.strip().split(",")
    if isValidOrder(fields):
        lineTotal = calculateLineTotal(int(fields[2]), float(fields[3]))
        grandTotal = grandTotal + lineTotal
        numValid = numValid + 1
        outFile.write(line.strip() + "," + "{:.2f}".format(lineTotal) + "\n")
    else:
        numInvalid = numInvalid + 1
        print("Invalid order: " + fields[0])

inFile.close()
outFile.close()

print("Valid orders: " + str(numValid))
print("Invalid orders: " + str(numInvalid))
print("Total value: " + formatMoney(grandTotal))
