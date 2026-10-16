# Task: sleep and screens - a scatter plot, then a histogram.
import pandas as pd
import matplotlib.pyplot as plt

survey = pd.read_csv("data/survey.csv")

# Chart 1: one dot per student, screen time across, sleep up.
plt.scatter(survey["screen_time"], survey["hours_sleep"])
plt.title("Screen time and sleep")
plt.xlabel("Screen time (hours a day)")
plt.ylabel("Sleep (hours a night)")
plt.show()

# Chart 2: how long journeys to school take, in 12 bins.
plt.hist(survey["minutes_to_school"], bins=12)
plt.title("Journey to school")
plt.xlabel("Minutes")
plt.ylabel("Students")
plt.show()
