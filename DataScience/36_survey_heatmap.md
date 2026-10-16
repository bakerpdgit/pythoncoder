# Task: what goes with what?

Five numeric columns in the survey means ten pairs to check. Draw them all at once:

![preview](chartpreview)

| Line | Should hold |
| --- | --- |
| `correlations` | the correlation of every column in `columns` with every other (`.corr()`) |
| the heatmap | `sns.heatmap(correlations, ...)` with the settings below |

| Setting | Why |
| --- | --- |
| `annot=True, fmt=".2f"` | write each number in its square, to 2 decimal places |
| `cmap="RdBu_r", center=0` | red for positive, blue for negative, white for none |
| `vmin=-1, vmax=1` | the scale runs over every possible correlation |

Then the title `What goes with what?`.

## How it is marked

Your chart is compared with the expected one: every correlation, every number
written on a square, and the title.

Look at the strongest square. Is it a surprise? Page 29's warning applies here too.
