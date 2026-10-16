# Task: favourite subjects, as bars worth reading.
import numpy as np
import matplotlib.pyplot as plt

subjects = ["Maths", "Art", "Science", "English", "Music", "PE"]
votes = np.array([34, 21, 28, 17, 12, 25])

# 1. Green for the winner, pale green for everything else.
colours = ["#16a34a" if v == votes.max() else "#bbf7d0" for v in votes]

# 2. Horizontal bars, coloured with that list.
plt.barh(subjects, votes, color=colours)

# 3. First subject at the top, a title, and a label for the votes axis.
plt.gca().invert_yaxis()
plt.title("Favourite subject")
plt.xlabel("Votes")

plt.show()
