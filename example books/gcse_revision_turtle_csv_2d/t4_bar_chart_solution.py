# LIBRARIES
import turtle

# CONSTANTS
MAX_BARS = 6
MAX_SCORE = 100
BAR_WIDTH = 50
GAP = 20
START_X = -250
BASE_Y = -150
SCALE = 3
LABEL_FONT = ("Arial", 12, "normal")

# GLOBAL VARIABLES
scores = []
numBars = 0
newScore = 0
xPos = 0
highest = 0
total = 0

# SUBPROGRAMS
def getValidInteger(prompt, low, high):
    # Keeps asking until the user enters a whole number from low to high, then returns it
    value = 0
    value = int(input(prompt))
    while value < low or value > high:
        print("Invalid - enter a number from " + str(low) + " to " + str(high))
        value = int(input(prompt))
    return value


def chooseColour(score):
    # Returns the bar colour for a score
    colour = ""
    if score >= 70:
        colour = "green"
    elif score >= 40:
        colour = "orange"
    else:
        colour = "red"
    return colour


def calculateHeight(score):
    # Returns the height of a bar in pixels
    return score * SCALE


def drawAxis(barCount):
    # Draws a black baseline under the bars
    axisLength = 0
    axisLength = barCount * (BAR_WIDTH + GAP) + GAP
    turtle.penup()
    turtle.goto(START_X - GAP, BASE_Y)
    turtle.pendown()
    turtle.color("black")
    turtle.forward(axisLength)


def drawBar(x, height, colour):
    # Draws one filled bar with its bottom-left corner at (x, BASE_Y)
    turtle.penup()
    turtle.goto(x, BASE_Y)
    turtle.pendown()
    turtle.color(colour)
    turtle.begin_fill()
    for side in range(2):
        turtle.forward(BAR_WIDTH)
        turtle.left(90)
        turtle.forward(height)
        turtle.left(90)
    turtle.end_fill()


def writeLabel(x, height, score):
    # Writes the score in black just above the middle of its bar
    turtle.penup()
    turtle.goto(x + BAR_WIDTH / 2, BASE_Y + height + 5)
    turtle.color("black")
    turtle.write(score, align="center", font=LABEL_FONT)


# MAIN
numBars = getValidInteger("How many bars (1-6)? ", 1, MAX_BARS)
for count in range(numBars):
    newScore = getValidInteger("Score for bar " + str(count + 1) + ": ", 0, MAX_SCORE)
    scores.append(newScore)

drawAxis(numBars)

xPos = START_X
for index in range(len(scores)):
    drawBar(xPos, calculateHeight(scores[index]), chooseColour(scores[index]))
    writeLabel(xPos, calculateHeight(scores[index]), scores[index])
    xPos = xPos + BAR_WIDTH + GAP

    total = total + scores[index]
    if scores[index] > highest:
        highest = scores[index]

print("Highest score: " + str(highest))
print("Average score: " + str(round(total / numBars, 1)))

turtle.hideturtle()
turtle.done()
