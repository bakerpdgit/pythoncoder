# Seaborn: the same matplotlib, with statistics and taste built in.
import numpy as np
import seaborn as sns
import matplotlib.pyplot as plt

rng = np.random.default_rng(seed=11)

# Waiting times at two hospital departments, in minutes.
minor_injuries = rng.gamma(shape=6.0, scale=7.0, size=600)
emergency = rng.gamma(shape=3.0, scale=9.0, size=600)

# One call restyles every chart that follows.
sns.set_theme(style="whitegrid", palette="deep")

fig, axes = plt.subplots(1, 2, figsize=(11, 4.5))

# histplot draws the bars and, with kde=True, the smooth curve through them.
sns.histplot(minor_injuries, bins=30, kde=True, color="#2563eb", ax=axes[0])
axes[0].set_title("Minor injuries")
axes[0].set_xlabel("Wait (minutes)")

# kdeplot alone: the shape, with the bars left out.
sns.kdeplot(minor_injuries, fill=True, color="#2563eb", label="Minor injuries", ax=axes[1])
sns.kdeplot(emergency, fill=True, color="#ef4444", label="Emergency", ax=axes[1])
axes[1].set_title("Both departments compared")
axes[1].set_xlabel("Wait (minutes)")
axes[1].legend()

fig.suptitle("How long do patients wait?", fontsize=15)
plt.tight_layout()
plt.show()

for name, data in (("minor injuries", minor_injuries), ("emergency", emergency)):
    print(f"{name:15} median {np.median(data):5.1f} min   "
          f"90th percentile {np.percentile(data, 90):5.1f} min")
