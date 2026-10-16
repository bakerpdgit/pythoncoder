# pandas: choosing the rows you want, and putting them in order.
import pandas as pd

weather = pd.read_csv("data/weather.csv")

# A comparison on a column is a mask, exactly as on page 7 ...
hot = weather["max_temp"] >= 25
print("hot days:", hot.sum())

# ... and a mask inside [ ] keeps only the rows where it is True.
hot_days = weather[hot]
print(hot_days[["date", "max_temp"]].head())
print()

# Combine conditions with & and |, each side in brackets.
grey_and_wet = weather[(weather["sunshine_h"] < 1) & (weather["rain_mm"] > 10)]
print("grey, wet days:", len(grey_and_wet))
print()

# Double brackets choose several columns; sort_values puts the rows in order.
wettest = weather.sort_values("rain_mm", ascending=False)
print("the five wettest days:")
print(wettest[["date", "month", "rain_mm"]].head(5))
print()

# nlargest is the shortcut for "sort, then take the top few".
print(weather.nlargest(3, "sunshine_h")[["date", "sunshine_h"]])
