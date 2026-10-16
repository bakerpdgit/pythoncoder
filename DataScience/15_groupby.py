# pandas: splitting a table into groups and summarising each one.
import pandas as pd

weather = pd.read_csv("data/weather.csv")

# groupby("month") splits the 365 rows into 12 groups; ["rain_mm"].sum() then
# adds up the rain inside each group. The answer has one row per month.
rain_by_month = weather.groupby("month", sort=False)["rain_mm"].sum()
print(rain_by_month.round(1))
print()

# Any summary works: mean, max, min, count, median...
print("mean maximum temperature by month:")
print(weather.groupby("month", sort=False)["max_temp"].mean().round(1))
print()

# agg() asks for several at once.
summary = weather.groupby("month", sort=False)["sunshine_h"].agg(["mean", "max"]).round(1)
print(summary.head(4))
print()

# value_counts() counts how often each value appears in one column.
weather["wet"] = weather["rain_mm"] > 0
print(weather["wet"].value_counts())
print()
print("wettest month:", rain_by_month.idxmax())
