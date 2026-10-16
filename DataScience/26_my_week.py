# Task: my week, as two charts side by side.
import matplotlib.pyplot as plt

days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
steps = [8200, 11400, 7600, 9900, 12800, 15300, 6100]
sleep = [7.5, 8.0, 6.5, 7.0, 8.5, 9.5, 9.0]

fig, axes = plt.subplots(1, 2, figsize=(10, 4))
fig.suptitle(____)

# Left: steps as a line with dots, titled "Steps".

# Right: sleep as bars, titled "Sleep", with the y axis labelled "Hours".

plt.tight_layout()
plt.show()
