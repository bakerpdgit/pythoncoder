# Task: my week

Two charts side by side, sharing one figure:

![preview](chartpreview)

`plt.subplots(1, 2)` has made the figure and its two axes for you: `axes[0]` on the
left and `axes[1]` on the right. (With one row, `axes` needs only one number.)

| Where | Detail |
| --- | --- |
| Whole figure | the overall title `My week` |
| Left | `steps` against `days` as a line with dots; title `Steps` |
| Right | `sleep` against `days` as bars; title `Sleep`; y axis label `Hours` |

Remember the small name changes from page 25: `ax.set_title`, not `plt.title`.

## How it is marked

Each of the two charts is compared with the expected one, in its own place: what it
draws, its numbers, its title and labels, plus the figure's overall title.
