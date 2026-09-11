# NumPy: one calculation, applied to a whole column of numbers at once.
import numpy as np

# Daily maximum temperature in Cambridge, one week in July (degrees Celsius).
days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
celsius = np.array([19.4, 21.0, 24.8, 27.3, 29.1, 26.5, 22.2])

# With a plain list you would need a loop. With an array you write the sum once.
fahrenheit = celsius * 9 / 5 + 32

for day, c, f in zip(days, celsius, fahrenheit):
    print(day, c, "C  =", round(f, 1), "F")

print()
print("array type :", type(celsius).__name__)
print("shape      :", celsius.shape)
print("dtype      :", celsius.dtype)

# Arrays combine with each other element by element, too.
overnight_low = np.array([11.2, 12.8, 14.1, 16.0, 17.4, 15.9, 13.3])
swing = celsius - overnight_low
print()
print("daily swing:", np.round(swing, 1))
