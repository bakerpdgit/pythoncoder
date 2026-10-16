# Task: wet days. Replace each ____ with a mask, or something built from one.
import numpy as np

days = np.arange(1, 15)                     # 1st to 14th of the month
rain = np.array([0.0, 2.4, 11.8, 0.0, 0.4, 6.2, 0.0,
                 0.0, 3.1, 0.0, 17.5, 4.8, 0.2, 0.0])   # millimetres

# 1. A mask: True on every day with any rain at all.
wet = ____

# 2. The days (from days) on which it rained.
wet_days = ____

# 3. A mask for days with between 1mm and 5mm of rain (1 included, 5 not).
drizzle = ____

# 4. "wet" or "dry" for every day, in one go.
labels = np.where(____, ____, ____)

print("wet days     :", wet_days.tolist())
print("how many     :", int(wet.sum()))
print("rain on them :", round(float(rain[wet].sum()), 1), "mm")
print("drizzle days :", days[drizzle].tolist())
print("labels       :", labels.tolist())
