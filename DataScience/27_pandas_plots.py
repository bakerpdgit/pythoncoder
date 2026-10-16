# pandas + matplotlib: a DataFrame can draw itself.
import pandas as pd
import matplotlib.pyplot as plt

# parse_dates turns the date column into real dates, so the x axis reads as a calendar.
weather = pd.read_csv("data/weather.csv", parse_dates=["date"])

# .plot() on a DataFrame draws the columns you name against the column you choose.
# It hands back the axes, so the familiar ax.set_... methods finish the job.
ax = weather.plot(x="date", y=["max_temp", "min_temp"], figsize=(10, 4.5),
                  color=["#ef4444", "#3b82f6"], linewidth=1)
ax.set_title("Every day of 2025")
ax.set_xlabel("")
ax.set_ylabel("Degrees Celsius")
plt.show()

# A groupby answer is a Series, and a Series can draw itself too.
# sort=False keeps the months in the order they appear: Jan, Feb, Mar...
rain = weather.groupby("month", sort=False)["rain_mm"].sum()
ax = rain.plot(kind="bar", color="#0ea5e9", figsize=(9, 4.5))
ax.set_title("Rain each month")
ax.set_xlabel("")
ax.set_ylabel("Millimetres")
plt.show()

print(rain.round(0).astype(int).to_string())
