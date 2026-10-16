# Task: does the weather sell ice creams? Replace each ____ with one NumPy call.
import numpy as np

# Twelve summer days at a beach kiosk.
temperature = np.array([18.2, 21.5, 24.1, 19.8, 26.3, 28.9, 23.4, 17.6, 30.2, 25.5, 22.0, 27.4])
ice_creams = np.array([112, 148, 171, 120, 205, 226, 160, 98, 251, 188, 139, 214])

# 1. The straight line of best fit: its slope and intercept.
slope, intercept = np.polyfit(temperature, ice_creams, 1)

# 2. The correlation coefficient r.
r = np.corrcoef(temperature, ice_creams)[0, 1]

# 3. What the line predicts for a 25 degree day.
predicted = slope * 25 + intercept

print(f"slope     : {slope:.2f} more ice creams for each degree warmer")
print(f"intercept : {intercept:.1f}")
print(f"r = {r:.3f}, r squared = {r ** 2:.3f}")
print(f"a 25 degree day: about {predicted:.0f} ice creams")
