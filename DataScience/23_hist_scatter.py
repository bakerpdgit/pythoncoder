# matplotlib: how values are spread, and whether two things move together.
import pandas as pd
import matplotlib.pyplot as plt

weather = pd.read_csv("data/weather.csv")
temps = weather["max_temp"]

# A histogram sorts the 365 values into bins and draws how many fell in each.
plt.figure(figsize=(8, 4.5))
plt.hist(temps, bins=20, color="#f97316", edgecolor="white")
plt.axvline(temps.mean(), color="#1e293b", linestyle="--", label="mean")
plt.title("How warm were the days of 2025?")
plt.xlabel("Maximum temperature (C)")
plt.ylabel("Number of days")
plt.legend()
plt.show()

# A scatter plot draws one dot per row: x from one column, y from another.
plt.figure(figsize=(8, 4.5))
plt.scatter(weather["sunshine_h"], weather["max_temp"], s=14, alpha=0.5, color="#0ea5e9")
plt.title("Are sunnier days warmer?")
plt.xlabel("Hours of sunshine")
plt.ylabel("Maximum temperature (C)")
plt.show()

print("mean maximum:", round(temps.mean(), 1), "C;  days above 25C:", (temps > 25).sum())
