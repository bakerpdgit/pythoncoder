# Task: by year group. Replace each ____ with one line of pandas.
import pandas as pd

survey = pd.read_csv("data/survey.csv")

# 1. The mean hours of sleep for each year group (one value per year group).
sleep_by_year = survey.groupby("year_group")["hours_sleep"].mean()

# 2. The mean journey time for each way of travelling.
journey_by_mode = survey.groupby("travel_mode")["minutes_to_school"].mean()

# 3. How many students use each way of travelling.
mode_counts = survey["travel_mode"].value_counts()

for year, hours in sleep_by_year.items():
    print(f"Year {year}: {hours:.2f} hours of sleep")
print()
for mode, minutes in journey_by_mode.items():
    print(f"{mode:6} {minutes:5.1f} minutes")
print()
for mode, count in mode_counts.items():
    print(f"{mode:6} {count} students")
