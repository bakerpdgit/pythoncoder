# Seaborn: a correlation matrix, read at a glance.
import numpy as np
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

rng = np.random.default_rng(seed=17)
n = 300

# A city's air quality and weather, built so that some columns really are related.
temperature = rng.normal(14, 7, n)
sunshine = (temperature * 0.35 + rng.normal(4, 2, n)).clip(0, 14)
wind = rng.gamma(shape=2.5, scale=4.0, size=n)
# Pollution builds on still, sunny days and blows away on windy ones.
no2 = (46 - 1.9 * wind + 1.1 * sunshine + rng.normal(0, 5, n)).clip(min=2)
pm25 = (0.55 * no2 + rng.normal(0, 4, n)).clip(min=1)
traffic = (2400 + 55 * temperature + rng.normal(0, 400, n)).clip(min=0)

air = pd.DataFrame({
    "Temperature": temperature,
    "Sunshine": sunshine,
    "Wind speed": wind,
    "NO2": no2,
    "PM2.5": pm25,
    "Traffic": traffic,
})

correlations = air.corr()
print(correlations.round(2))

sns.set_theme(style="white")
plt.figure(figsize=(8.5, 7))

# Hide the mirror image above the diagonal: it says nothing new.
mask = np.triu(np.ones_like(correlations, dtype=bool))

sns.heatmap(
    correlations,
    mask=mask,
    annot=True,            # write the number in each square
    fmt=".2f",
    cmap="RdBu_r",         # red for positive, blue for negative
    center=0,              # so white always means "no relationship"
    vmin=-1, vmax=1,
    square=True,
    linewidths=0.6,
    cbar_kws={"shrink": 0.7, "label": "Correlation"},
)

plt.title("What moves with what?", fontsize=15, pad=16)
plt.tight_layout()
plt.show()

# The strongest pair, found rather than eyeballed.
pairs = correlations.where(~mask).stack()
strongest = pairs.abs().idxmax()
print()
print(f"strongest relationship: {strongest[0]} and {strongest[1]} "
      f"(r = {pairs[strongest]:.2f})")
