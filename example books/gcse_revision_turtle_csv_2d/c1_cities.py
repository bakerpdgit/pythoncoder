# CONSTANTS
FILENAME = "cities.csv"

# GLOBAL VARIABLES
minimum = 0.0
line = ""
fields = []
count = 0

# MAIN
minimum = float(input("Enter minimum population (millions): "))

theFile = open(FILENAME, "___")
for line in theFile:
    line = line._____()
    fields = line.split("___")
    if float(fields[___]) >= minimum:
        print(fields[0] + " (" + fields[___] + ")")
        count = count + 1
theFile._____()

print("Cities found: " + str(count))
