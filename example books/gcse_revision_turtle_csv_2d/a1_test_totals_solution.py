# CONSTANTS
PASS_MARK = 40

# GLOBAL VARIABLES
results = [["Asha", 12, 15, 18],
           ["Ben", 9, 14, 11],
           ["Chloe", 17, 19, 20],
           ["Dev", 8, 10, 13]]
total = 0
outcome = ""

# MAIN
print("{:<8}{:>6}{:>8}".format("Name", "Total", "Result"))
for row in range(len(results)):
    total = 0
    for col in range(1, len(results[row])):
        total = total + results[row][col]
    if total >= PASS_MARK:
        outcome = "Pass"
    else:
        outcome = "Fail"
    print("{:<8}{:>6}{:>8}".format(results[row][0], total, outcome))
