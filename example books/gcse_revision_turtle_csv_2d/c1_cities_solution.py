# CONSTANTS
FILENAME = "cities.csv"

# GLOBAL VARIABLES
minimum = 0.0
line = ""
fields = []
count = 0

# MAIN
minimum = float(input("Enter minimum population (millions): "))

theFile = open(FILENAME, "r")
for line in theFile:
    line = line.strip()
    fields = line.split(",")
    if float(fields[2]) >= minimum:
        print(fields[0] + " (" + fields[1] + ")")
        count = count + 1
theFile.close()

print("Cities found: " + str(count))
