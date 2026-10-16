# Task: journey times, the seaborn way

Draw the journey times as a seaborn histogram:

![preview](chartpreview)

| Part | Detail |
| --- | --- |
| Style | `sns.set_theme(style="whitegrid")` first |
| Bars | `sns.histplot` of `survey["minutes_to_school"]` with **15** bins |
| Curve | the smooth KDE curve over the bars |
| Title | `How long is the journey to school?` |
| x axis | `Minutes` |

Seaborn charts are matplotlib charts, so `plt.title` and `plt.xlabel` work as
always. Seaborn labels the y axis `Count` by itself.

## How it is marked

Your chart is compared with the expected one: the bars, the KDE curve, the title and
the axis labels.
