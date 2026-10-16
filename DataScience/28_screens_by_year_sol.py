# Task: screen time by year group, drawn by pandas.
import pandas as pd
import matplotlib.pyplot as plt

survey = pd.read_csv("data/survey.csv")

# 1. The mean screen time for each year group: one value per year group.
screen_by_year = survey.groupby("year_group")["screen_time"].mean()

# 2. Let the Series draw itself as a bar chart; keep the axes it hands back.
ax = screen_by_year.plot(kind="bar")

# 3. Title and both axis labels.
ax.set_title("Screen time by year group")
ax.set_xlabel("Year group")
ax.set_ylabel("Hours a day")

plt.show()
