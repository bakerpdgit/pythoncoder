# Task: what goes with what in the survey?
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

survey = pd.read_csv("data/survey.csv")
columns = ["year_group", "hours_sleep", "screen_time", "exercise_hours", "minutes_to_school"]

# 1. The correlation of every one of these columns with every other.
correlations = ____

# 2. A heatmap: numbers written in (2 decimal places), red-blue centred on 0, from -1 to 1.
sns.heatmap(correlations, ____)

# 3. A title.

plt.tight_layout()
plt.show()
