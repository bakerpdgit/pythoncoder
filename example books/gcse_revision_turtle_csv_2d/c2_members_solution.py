# CONSTANTS
FILENAME = "members.csv"

# GLOBAL VARIABLES
searchYear = 0
line = ""
fields = []
matches = 0

# MAIN
searchYear = int(input("Enter a year: "))

theFile = open(FILENAME, "r")
for line in theFile:
    fields = line.strip().split(",")
    if int(fields[3]) == searchYear:
        print(fields[0] + " " + fields[1] + " " + fields[2])
        matches = matches + 1
theFile.close()

if matches == 0:
    print("No members joined in " + str(searchYear))
else:
    print(str(matches) + " member(s) joined in " + str(searchYear))
