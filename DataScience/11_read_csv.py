# pandas: reading a whole year of data from a CSV file.
import pandas as pd

# data/weather.csv is in this activity's files: one row per day of 2025.
weather = pd.read_csv("data/weather.csv")

# The first thing to do with any new data: look at it.
print(weather.head())          # the first five rows
print()
print("rows, columns:", weather.shape)
print()

# dtypes says what pandas decided each column holds. Text is "object".
print(weather.dtypes)
print()

# describe() summarises every numeric column at once.
print(weather.describe().round(1))
print()

# Single answers come from single columns.
print("hottest day :", weather["max_temp"].max(), "C")
print("total rain  :", round(weather["rain_mm"].sum()), "mm")
print("hottest date:", weather.loc[weather["max_temp"].idxmax(), "date"])
