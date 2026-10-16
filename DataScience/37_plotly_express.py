# plotly express: an interactive chart from a DataFrame, in one call.
import pandas as pd
import plotly.express as px

survey = pd.read_csv("data/survey.csv")

# Name the DataFrame, then name its columns. color= splits the dots into groups
# with a legend; hover_data= adds columns to the box that follows the pointer.
figure = px.scatter(
    survey,
    x="screen_time",
    y="hours_sleep",
    color="travel_mode",
    hover_data=["student", "year_group"],
    title="Screen time and sleep, by how students travel",
    labels={"screen_time": "Screen time (hours a day)",
            "hours_sleep": "Sleep (hours a night)",
            "travel_mode": "Travel"},
)
figure.show()

# The same pattern draws a bar chart from a summary table.
# as_index=False keeps year_group as an ordinary column that px can name.
by_year = survey.groupby("year_group", as_index=False)["hours_sleep"].mean()
figure = px.bar(by_year, x="year_group", y="hours_sleep",
                title="Mean sleep by year group",
                labels={"year_group": "Year group", "hours_sleep": "Hours a night"})
figure.show()

print(by_year.round(2).to_string(index=False))
