# NumPy: the summary statistics that describe a column of numbers.
import numpy as np

# Monthly rainfall in millimetres, England, over one year.
months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
rainfall = np.array([78.1, 55.4, 61.9, 47.2, 52.8, 49.3,
                     46.7, 63.5, 58.0, 89.4, 92.6, 84.3])

print("total    ", round(rainfall.sum(), 1), "mm")
print("mean     ", round(rainfall.mean(), 1), "mm")
print("median   ", round(np.median(rainfall), 1), "mm")
print("std dev  ", round(rainfall.std(), 1), "mm")
print("driest   ", months[rainfall.argmin()], rainfall.min(), "mm")
print("wettest  ", months[rainfall.argmax()], rainfall.max(), "mm")

# Percentiles say where a value sits in the pack.
print()
print("25% of months had less than", round(np.percentile(rainfall, 25), 1), "mm")
print("75% of months had less than", round(np.percentile(rainfall, 75), 1), "mm")

# A running total is a single call, not a loop with an accumulator.
print()
print("rain so far, by the end of each month:")
print(np.round(np.cumsum(rainfall), 1))
