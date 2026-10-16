# matplotlib: turning a column of numbers into a picture.
import numpy as np
import matplotlib.pyplot as plt

months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
london = np.array([7.9, 8.2, 10.6, 13.4, 17.0, 20.1, 22.4, 22.0, 19.0, 15.1, 11.0, 8.3])
edinburgh = np.array([6.5, 6.9, 8.6, 11.0, 14.1, 16.8, 18.7, 18.4, 16.1, 12.7, 9.1, 6.9])

plt.figure(figsize=(9, 5))

plt.plot(months, london, marker="o", linewidth=2, label="London")
plt.plot(months, edinburgh, marker="s", linewidth=2, linestyle="--", label="Edinburgh")

plt.title("Average daily maximum temperature")
plt.xlabel("Month")
plt.ylabel("Degrees Celsius")
plt.legend()
plt.grid(True, alpha=0.3)

# show() is what puts the finished figure on screen.
plt.show()

gap = london - edinburgh
print("The gap never closes: Edinburgh is cooler every single month.")
print("largest gap:", round(float(gap.max()), 1), "C in", months[int(gap.argmax())])
