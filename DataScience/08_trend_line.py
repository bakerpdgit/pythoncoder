# NumPy + matplotlib: fitting a straight line through a cloud of points.
import numpy as np
import matplotlib.pyplot as plt

rng = np.random.default_rng(seed=3)

# 60 students: hours of revision, and the mark they got.
hours = rng.uniform(0, 20, 60)
marks = (32 + 2.9 * hours + rng.normal(0, 7, 60)).clip(0, 100)

# polyfit finds the straight line of best fit: degree 1 = a line.
slope, intercept = np.polyfit(hours, marks, 1)
line_x = np.array([hours.min(), hours.max()])
line_y = slope * line_x + intercept

# corrcoef gives the correlation matrix; the off-diagonal entry is the r value.
r = np.corrcoef(hours, marks)[0, 1]

plt.figure(figsize=(9, 5.5))
plt.scatter(hours, marks, s=45, alpha=0.65, color="#2563eb",
            edgecolor="white", linewidth=0.8, label="A student")
plt.plot(line_x, line_y, color="#ef4444", linewidth=2.5,
         label=f"Best fit: {slope:.1f} marks per hour")

plt.title("Does revision time predict the mark?", fontsize=14)
plt.xlabel("Hours of revision")
plt.ylabel("Mark (%)")
plt.ylim(0, 100)
plt.legend(loc="lower right")
plt.grid(True, alpha=0.25)
plt.gca().spines[["top", "right"]].set_visible(False)

# Put the headline number on the chart itself.
plt.text(0.4, 92, f"r = {r:.2f}", fontsize=13, color="#334155")

plt.tight_layout()
plt.show()

print(f"line of best fit: mark = {slope:.2f} * hours + {intercept:.1f}")
print(f"correlation r   : {r:.3f}   (r squared = {r ** 2:.3f})")
print(f"so about {r ** 2 * 100:.0f}% of the variation in marks tracks revision time.")
