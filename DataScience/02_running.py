# Task: a week of running. Replace each ____ with one line of NumPy.
import numpy as np

days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
km = np.array([5.2, 3.0, 8.4, 0.0, 6.1, 10.0, 4.5])
planned = np.array([5.0, 5.0, 8.0, 0.0, 5.0, 12.0, 5.0])

# 1. Every distance in miles (1 km is 0.621371 miles) - one line, no loop.
miles = ____

# 2. How far each run was over (+) or under (-) the plan.
difference = ____

# 3. The total distance for the week, in km.
total = ____

print("miles     :", np.round(miles, 2).tolist())
print("difference:", np.round(difference, 1).tolist())
print("total km  :", round(float(total), 1))
print("days run  :", km.size - (km == 0).sum(), "of", km.size)
