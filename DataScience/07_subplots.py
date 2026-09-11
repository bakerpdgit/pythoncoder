# matplotlib: four views of the same dataset, on one figure.
import numpy as np
import matplotlib.pyplot as plt

rng = np.random.default_rng(seed=7)      # a fixed seed keeps the chart repeatable

hours = np.arange(0, 24)
# A day of visitors to a website: quiet at night, a lunch bump, an evening peak.
visitors = (120 + 90 * np.sin((hours - 8) / 24 * 2 * np.pi)
            + 60 * np.exp(-((hours - 13) ** 2) / 6)
            + rng.normal(0, 12, 24)).clip(min=0)

sources = ["Search", "Social", "Direct", "Email"]
by_source = np.array([4820, 2310, 1940, 860])

fig, axes = plt.subplots(2, 2, figsize=(11, 7))
fig.suptitle("One day of website traffic", fontsize=15)

# Top left: the shape of the day.
axes[0, 0].plot(hours, visitors, color="#2563eb", linewidth=2)
axes[0, 0].fill_between(hours, visitors, alpha=0.15, color="#2563eb")
axes[0, 0].set_title("Visitors per hour")
axes[0, 0].set_xlabel("Hour of day")

# Top right: where they came from.
axes[0, 1].bar(sources, by_source, color="#0ea5e9")
axes[0, 1].set_title("Visitors by source")

# Bottom left: how long they stayed.
dwell = rng.gamma(shape=2.0, scale=1.4, size=400)
axes[1, 0].hist(dwell, bins=25, color="#14b8a6", edgecolor="white")
axes[1, 0].set_title("Time on site (minutes)")

# Bottom right: does a longer visit mean more pages?
pages = 1 + dwell * 1.6 + rng.normal(0, 1.2, 400)
axes[1, 1].scatter(dwell, pages, s=12, alpha=0.4, color="#8b5cf6")
axes[1, 1].set_title("Pages viewed vs time on site")
axes[1, 1].set_xlabel("Minutes")

for ax in axes.flat:
    ax.grid(True, alpha=0.25)
    ax.spines[["top", "right"]].set_visible(False)

plt.tight_layout()
plt.show()

print("busiest hour:", int(hours[visitors.argmax()]), "with", int(visitors.max()), "visitors")
