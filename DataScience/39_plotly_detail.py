# Plotly: a chart you can hover, zoom and pick apart.
import numpy as np
import pandas as pd
import plotly.graph_objects as go

rng = np.random.default_rng(seed=23)

months = pd.date_range("2024-01-01", periods=24, freq="MS")
regions = {
    "North": 180, "Midlands": 240, "South West": 155, "London": 310,
}

# A gentle upward trend per region, plus a summer bump and some noise.
season = 1 + 0.22 * np.sin((np.arange(24) - 3) / 12 * 2 * np.pi)
colours = {"North": "#2563eb", "Midlands": "#14b8a6",
           "South West": "#f59e0b", "London": "#8b5cf6"}

sales = {}
for name, base in regions.items():
    growth = np.linspace(1.0, 1.35, 24)
    sales[name] = (base * growth * season * rng.normal(1, 0.05, 24)).round(1)

figure = go.Figure()
for name, values in sales.items():
    figure.add_trace(go.Scatter(
        x=months, y=values, name=name, mode="lines+markers",
        line=dict(color=colours[name], width=3, shape="spline"),
        marker=dict(size=7, line=dict(color="white", width=1)),
        # Everything in <b>...</b> appears in the box that follows the pointer.
        hovertemplate="<b>%{fullData.name}</b><br>%{x|%b %Y}<br>"
                      "£%{y:.1f}k<extra></extra>",
    ))

figure.update_layout(
    title=dict(text="Monthly sales by region", font=dict(size=20)),
    xaxis_title=None,
    yaxis_title="Sales (£ thousands)",
    hovermode="x unified",        # one box showing every region at that month
    template="plotly_white",
    legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0),
    margin=dict(l=60, r=30, t=90, b=40),
)
figure.update_yaxes(rangemode="tozero", gridcolor="#e2e8f0")
figure.update_xaxes(showgrid=False)

figure.show()

total = pd.DataFrame(sales, index=months).sum()
print("two-year totals (£k):")
print(total.round(0).sort_values(ascending=False).to_string())
