# NumPy: asking a question of every value at once.
import numpy as np

days = np.arange(1, 31)          # 1st to 30th of the month
temps = np.array([
    17.8, 19.2, 21.5, 24.0, 26.7, 28.9, 30.4, 31.2, 29.8, 27.1,
    24.6, 22.0, 20.3, 21.8, 23.4, 25.9, 28.2, 30.8, 32.1, 31.5,
    29.0, 26.3, 23.7, 21.1, 19.6, 18.4, 20.0, 22.5, 25.2, 27.8,
])

# A comparison on an array gives an array of True/False, one per value.
hot = temps >= 28.0
print("hot day mask (first 10):", hot[:10])
print()

# That mask can be used to pull out the values it marks.
print("hot days     :", days[hot])
print("how many     :", hot.sum(), "of", hot.size)
print("their average:", round(temps[hot].mean(), 1), "C")
print()

# Conditions combine with & (and) and | (or) - note the brackets.
pleasant = (temps >= 20.0) & (temps < 26.0)
print("pleasant days:", days[pleasant])
print()

# np.where labels every value in one go.
labels = np.where(temps >= 28.0, "hot", np.where(temps >= 20.0, "warm", "cool"))
for day, temp, label in list(zip(days, temps, labels))[:8]:
    print(f"{day:2}  {temp:5.1f}C  {label}")

print()
counts = {name: int((labels == name).sum()) for name in ("cool", "warm", "hot")}
print("counts:", counts)
