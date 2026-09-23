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
    # (1) If this member joined in searchYear:
    #       - display their ID, first name and surname, separated by spaces
    #       - add 1 to matches
    pass
theFile.close()

# (2) Display "No members joined in <year>" if there were no matches,
#     otherwise "<matches> member(s) joined in <year>"
