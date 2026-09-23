# Turtle 4 solution: Bar chart of scores

A model solution for **Turtle 4**. Run it and enter the number of bars, then the scores.

## Worth noticing

**Decomposition:** each subprogram does one job. `chooseColour` and `calculateHeight` are **functions** (they return a value and draw nothing), which is why they can be tested on their own. `drawBar`, `drawAxis` and `writeLabel` are **procedures** that only draw.

`getValidInteger(prompt, low, high)` is written once and used twice, with different limits for the number of bars and for each score.

Local variables (`value`, `colour`, `axisLength`) are initialised at the **start** of their subprogram, and every global variable is initialised in the GLOBAL VARIABLES section.

The scores are stored in a list first, so the drawing, the highest score and the total can all be worked out from the same data.
