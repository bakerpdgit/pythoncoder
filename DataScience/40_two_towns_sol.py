# Task: two towns, trace by trace.
import plotly.graph_objects as go

months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
seaview = [3.1, 3.4, 5.2, 8.9, 14.6, 21.8, 30.4, 32.1, 18.7, 9.3, 4.2, 5.6]
hillford = [6.8, 6.1, 7.4, 8.2, 9.5, 10.1, 11.9, 12.4, 10.6, 9.8, 8.7, 10.3]

figure = go.Figure()

# 1. One trace per town: lines with markers, named "Seaview" and "Hillford".
figure.add_trace(go.Scatter(x=months, y=seaview, name="Seaview", mode="lines+markers"))
figure.add_trace(go.Scatter(x=months, y=hillford, name="Hillford", mode="lines+markers"))

# 2. The title and both axis titles.
figure.update_layout(
    title="Visitors by month",
    xaxis_title="Month",
    yaxis_title="Visitors (thousands)",
)

figure.show()
