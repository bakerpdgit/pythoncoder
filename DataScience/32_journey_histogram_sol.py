# Task: journey times, the seaborn way.
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

survey = pd.read_csv("data/survey.csv")

# 1. Seaborn's "whitegrid" style for everything that follows.
sns.set_theme(style="whitegrid")

# 2. A histogram of minutes_to_school in 15 bins, with the smooth KDE curve.
sns.histplot(survey["minutes_to_school"], bins=15, kde=True)

# 3. A title and an x-axis label.
plt.title("How long is the journey to school?")
plt.xlabel("Minutes")

plt.show()
