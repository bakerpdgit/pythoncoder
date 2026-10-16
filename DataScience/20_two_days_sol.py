# Task: two days on one chart.
import matplotlib.pyplot as plt

hours = [6, 8, 10, 12, 14, 16, 18, 20]
monday = [9.5, 11.0, 14.2, 17.8, 19.4, 18.6, 15.1, 12.3]
tuesday = [7.8, 8.4, 10.1, 12.6, 13.9, 13.2, 11.5, 9.9]

# 1. Monday's temperatures as a line with a dot at each reading, labelled "Monday".
plt.plot(hours, monday, marker="o", label="Monday")

# 2. Tuesday's as a dashed line (no dots), labelled "Tuesday".
plt.plot(hours, tuesday, linestyle="--", label="Tuesday")

# 3. The title, both axis labels and the legend.
plt.title("Temperature through the day")
plt.xlabel("Hour")
plt.ylabel("Degrees Celsius")
plt.legend()

plt.show()
