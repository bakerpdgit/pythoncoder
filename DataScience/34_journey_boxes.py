# Task: journey time by travel mode, as a box plot.
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

survey = pd.read_csv("data/survey.csv")

# A summary first: read it, then check the boxes agree with it.
print(survey.groupby("travel_mode")["minutes_to_school"].median())

sns.set_theme(style="whitegrid")

# 1. One box per travel_mode, showing minutes_to_school.
sns.boxplot(data=survey, x=____, y=____)

# 2. A title, and axis labels "Travel mode" and "Minutes".

plt.show()
