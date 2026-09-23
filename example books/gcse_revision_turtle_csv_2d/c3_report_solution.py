# CONSTANTS
INPUT_FILE = "results.csv"
OUTPUT_FILE = "report.csv"

# GLOBAL VARIABLES
passMark = 0
line = ""
fields = []
total = 0
result = ""
numPassed = 0
numStudents = 0

# MAIN
passMark = int(input("Enter the pass mark (out of 160): "))

inFile = open(INPUT_FILE, "r")
outFile = open(OUTPUT_FILE, "w")

inFile.readline()                        # skip the header row
outFile.write("name,total,result\n")

for line in inFile:
    fields = line.strip().split(",")
    total = int(fields[1]) + int(fields[2])
    if total >= passMark:
        result = "Pass"
        numPassed = numPassed + 1
    else:
        result = "Fail"
    numStudents = numStudents + 1
    outFile.write(fields[0] + "," + str(total) + "," + result + "\n")

inFile.close()
outFile.close()

print("Passed: " + str(numPassed) + " of " + str(numStudents))
print("Report written to " + OUTPUT_FILE)
