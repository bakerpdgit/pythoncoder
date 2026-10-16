# Task: by year group. Replace each ____ with one line of pandas.
import pandas as pd

survey = pd.read_csv("data/survey.csv")

# 1. The mean hours of sleep for each year group (one value per year group).
sleep_by_year = ____

# 2. The mean journey time for each way of travelling.
journey_by_mode = ____

# 3. How many students use each way of travelling.
mode_counts = ____

for year, hours in sleep_by_year.items():
    print(f"Year {year}: {hours:.2f} hours of sleep")
print()
for mode, minutes in journey_by_mode.items():
    print(f"{mode:6} {minutes:5.1f} minutes")
print()
for mode, count in mode_counts.items():
    print(f"{mode:6} {count} students")
