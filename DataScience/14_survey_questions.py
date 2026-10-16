# Task: questions for the survey. Replace each ____ with one line of pandas.
import pandas as pd

survey = pd.read_csv("data/survey.csv")

# 1. Only the students who sleep less than 8 hours.
short_sleepers = ____

# 2. Only the students who cycle to school AND get there in under 15 minutes.
quick_cyclists = survey[(____) & (____)]

# 3. Every student, sorted by screen time with the most first.
by_screen = ____

print("short sleepers:", len(short_sleepers))
print("their mean screen time:", round(short_sleepers["screen_time"].mean(), 2), "hours")
print("quick cyclists:", len(quick_cyclists))
print()
print("most screen time:")
print(by_screen[["student", "year_group", "screen_time"]].head(3).to_string(index=False))
