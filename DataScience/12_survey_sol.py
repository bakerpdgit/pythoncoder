# Task: a school survey. Replace each ____ with one line of pandas.
import pandas as pd

# 1. Read data/survey.csv into a DataFrame.
survey = pd.read_csv("data/survey.csv")

# 2. How many students answered (the number of rows).
students = len(survey)

# 3. The average hours of sleep.
mean_sleep = survey["hours_sleep"].mean()

# 4. The longest journey to school, in minutes.
longest = survey["minutes_to_school"].max()

print("columns     :", list(survey.columns))
print("students    :", students)
print(f"mean sleep  : {mean_sleep:.2f} hours")
print("longest trip:", longest, "minutes")
