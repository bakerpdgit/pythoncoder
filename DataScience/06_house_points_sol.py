# Task: house points. Replace each ____ using axis= and slicing.
import numpy as np

houses = ["Ash", "Beech", "Cedar", "Oak"]
weeks = ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"]

# One row per house, one column per week.
points = np.array([
    [12, 15,  9, 20, 14],
    [18, 11, 16, 13, 17],
    [ 9, 14, 21, 12, 10],
    [15, 19, 11, 16, 22],
])

# 1. Each house's total over the five weeks (one number per house).
house_totals = points.sum(axis=1)

# 2. The best score in each week (one number per week).
best_each_week = points.max(axis=0)

# 3. Every house's points in Week 3 (a column).
week_3 = points[:, 2]

for house, total in zip(houses, house_totals):
    print(f"{house:6} {total}")
print("best each week:", best_each_week.tolist())
print("week 3        :", week_3.tolist())
print("winner        :", houses[house_totals.argmax()])
