# Task: exercise by year group, interactive.
import pandas as pd
import plotly.express as px

survey = pd.read_csv("data/survey.csv")

# 1. The mean exercise_hours for each year group, with year_group kept as a column.
by_year = ____

# 2. A plotly express bar chart of it, with the title and axis labels asked for.
figure = px.bar(by_year, ____)

figure.show()
