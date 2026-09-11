# Seaborn: comparing groups, with pandas doing the bookkeeping.
import numpy as np
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

rng = np.random.default_rng(seed=5)

# Commute times, in minutes, for four ways of getting to work.
modes = {
    "Walk": rng.normal(24, 6, 180),
    "Cycle": rng.normal(19, 5, 180),
    "Bus": rng.normal(38, 13, 180),
    "Train": rng.normal(31, 16, 180),
}

# Seaborn likes "long" data: one row per observation, with a column saying which
# group it belongs to.
commutes = pd.DataFrame({
    "mode": np.repeat(list(modes), 180),
    "minutes": np.concatenate(list(modes.values())).clip(min=3),
})

print(commutes.head())
print()
print(commutes.groupby("mode")["minutes"].describe().round(1))

sns.set_theme(style="whitegrid")
fig, axes = plt.subplots(1, 2, figsize=(11, 4.8), sharey=True)

# A box plot: median, middle half, whiskers, outliers.
sns.boxplot(data=commutes, x="mode", y="minutes", hue="mode",
            palette="crest", legend=False, ax=axes[0])
axes[0].set_title("Box plot: the summary")

# A violin plot: the same summary, wrapped in the shape of the data.
sns.violinplot(data=commutes, x="mode", y="minutes", hue="mode",
               palette="crest", legend=False, inner="quartile", ax=axes[1])
axes[1].set_title("Violin plot: the whole distribution")

fig.suptitle("How long is the commute?", fontsize=15)
plt.tight_layout()
plt.show()
