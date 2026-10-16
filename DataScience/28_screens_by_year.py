# Task: screen time by year group, drawn by pandas.
import pandas as pd
import matplotlib.pyplot as plt

survey = pd.read_csv("data/survey.csv")

# 1. The mean screen time for each year group: one value per year group.
screen_by_year = ____

# 2. Let the Series draw itself as a bar chart; keep the axes it hands back.
ax = ____

# 3. Title and both axis labels.

plt.show()
