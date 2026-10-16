# Task: journey time by travel mode

Which way of getting to school is quickest, and which is least predictable? A box
plot shows both:

![preview](chartpreview)

| Part | Detail |
| --- | --- |
| Boxes | `sns.boxplot` from the `survey` DataFrame: `travel_mode` across, `minutes_to_school` up |
| Title | `Journey time by travel mode` |
| x axis | `Travel mode` |
| y axis | `Minutes` |

Use the column names, as on page 33. Leave out `hue` and `palette` this time: plain
boxes are what is asked for.

The program prints each group's median first. Check the line in the middle of each
box agrees with it.

## How it is marked

Your chart is compared with the expected one: every box, whisker and outlier, the
title and the axis labels.
