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
# The lines below are in the wrong order - rearrange them.
# Every line already has the correct indentation: move lines, don't re-indent them.
        total = total + results[row][col]
    else:
    print("{:<8}{:>6}{:>8}".format(results[row][0], total, outcome))
for row in range(len(results)):
        outcome = "Fail"
    total = 0
        outcome = "Pass"
print("{:<8}{:>6}{:>8}".format("Name", "Total", "Result"))
    if total >= PASS_MARK:
    for col in range(1, len(results[row])):
