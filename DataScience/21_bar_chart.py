# matplotlib: bar charts, colour used with a purpose, and less chart junk.
import numpy as np
import matplotlib.pyplot as plt

languages = ["Python", "JavaScript", "Java", "C#", "C++", "Rust"]
share = np.array([28.4, 21.7, 14.2, 9.6, 8.1, 5.3])

# One highlight colour for the leader, one quiet colour for everything else.
colours = ["#2563eb" if value == share.max() else "#93c5fd" for value in share]

plt.figure(figsize=(9, 5))
bars = plt.barh(languages, share, color=colours, edgecolor="white")

# Write each value at the end of its bar - easier to read than an axis.
for bar, value in zip(bars, share):
    plt.text(value + 0.4, bar.get_y() + bar.get_height() / 2,
             f"{value}%", va="center", fontsize=10)

plt.title("Share of new projects by language", fontsize=14, pad=15)
plt.xlim(0, share.max() * 1.15)
plt.gca().invert_yaxis()          # biggest bar at the top

# Strip the chart junk: no box, and no axis now every bar is labelled.
for side in ("top", "right", "bottom"):
    plt.gca().spines[side].set_visible(False)
plt.gca().xaxis.set_visible(False)

plt.tight_layout()
plt.show()
