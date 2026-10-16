# Task: a school survey. Replace each ____ with one line of pandas.
import pandas as pd

# 1. Read data/survey.csv into a DataFrame.
survey = ____

# 2. How many students answered (the number of rows).
students = ____

# 3. The average hours of sleep.
mean_sleep = ____

# 4. The longest journey to school, in minutes.
longest = ____

print("columns     :", list(survey.columns))
print("students    :", students)
print(f"mean sleep  : {mean_sleep:.2f} hours")
print("longest trip:", longest, "minutes")
