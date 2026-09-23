# Turtle 4: Bar chart of scores

**Level: hard - several requirements, and you must decompose the problem into subprograms**

Write a program that reads in some test scores and draws them as a colour-coded bar chart.

For example, with 5 bars scoring 80, 50, 20, 95 and 65 the finished chart looks like this:

![preview](turtlepreview)

## Requirements

Ask how many bars to draw (1 to 6), then ask for a score (0 to 100) for each bar. Any number out of range must be rejected with a message containing the word `Invalid`, and the user asked again.

Draw a **black baseline** starting at (-270, -150) and going to the **right**. It should be long enough to sit under every bar: `number of bars x (BAR_WIDTH + GAP) + GAP` pixels.

Draw one filled bar per score. The first bar has its bottom-left corner at (`START_X`, `BASE_Y`), which is (-250, -150). Each bar is `BAR_WIDTH` (50) wide, with a `GAP` (20) between bars. The height of a bar is the score multiplied by `SCALE` (3).

Colour each bar by its score: **green** for 70 or more, **orange** for 40 to 69, and **red** below 40.

Write each score in black just above the middle of its bar, using `turtle.write()` with `font=LABEL_FONT`.

When the chart is drawn, display the highest score and the average score to 1 decimal place:

```
Highest score: 80
Average score: 50.0
```

## Decomposition

Your program **must** include these subprograms. Use exactly these names and parameters:

| Subprogram | What it does |
|---|---|
| `getValidInteger(prompt, low, high)` | Keeps asking until a whole number from low to high is entered, then **returns** it |
| `chooseColour(score)` | **Returns** `"green"`, `"orange"` or `"red"` for a score |
| `calculateHeight(score)` | **Returns** the height of a bar in pixels |
| `drawBar(x, height, colour)` | Draws one filled bar with its bottom-left corner at (x, `BASE_Y`) |

You may add more subprograms of your own (for example, to draw the baseline or write a label).

## Example run

```
How many bars (1-6)? 3
Score for bar 1: 80
Score for bar 2: 150
Invalid - enter a number from 0 to 100
Score for bar 2: 50
Score for bar 3: 20
Highest score: 80
Average score: 50.0
```

## Checking your work

Enter 5 bars scoring 80, 50, 20, 95 and 65: your chart should match the picture above, with a highest score of 95 and an average of 62.0. Then try the example run above, which includes an invalid score. Finally, try entering 0 or 7 bars, and a single bar of 45, which should be orange with an average of 45.0.

Test your functions on their own too, for example by temporarily adding `print(chooseColour(70))` to the end of your program. `chooseColour(70)` should return `"green"`, `chooseColour(69)` and `chooseColour(40)` `"orange"`, `chooseColour(39)` `"red"`, and `calculateHeight(50)` should return 150.

When you have finished, compare your program with the model solution on the next page.
