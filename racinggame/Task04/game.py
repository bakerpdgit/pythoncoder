#############################
# Library Imports
#############################
from js import document, window
from pyodide.ffi import create_proxy, jsnull

#############################
# Global Variables
#############################

# to store current position (x,y)
position = [0, 0]

# to store movement directions (x,y)
direction = [0, 0]

# to store the handle code for the timer interval to cancel it when we crash
intervalHandle = 0

# to keep JavaScript callbacks alive for Pyodide
keyProxy = None
timerProxy = None

#############################
# Sub-Programs
#############################

# the function called when a key is pressed - sets direction variable
def checkKey(event):
    event.preventDefault()
    if event.key == "ArrowRight":
        direction[0] = 1
        direction[1] = 0
    elif event.key == "ArrowLeft":
        # left arrow
        direction[0] = -1
        direction[1] = 0
    elif event.key == "ArrowUp":
        direction[1] = -1
        direction[0] = 0
    elif event.key == "ArrowDown":
        direction[1] = 1
        direction[0] = 0        

def getCell():
    cell = document.getElementById("R{}C{}".format(position[1], position[0]))
    if cell is jsnull:
        return None
    return cell

# the timer check function - runs every 300 milliseconds to update the car position
def updatePosition():
    if direction[0] != 0 or direction[1] != 0:
        # Set the cell where the car was to empty
        cell = getCell()
        cell.className = ""
        
        # Update the column position for the car
        position[0] += direction[0]
        position[1] += direction[1]

        # Re-draw the car (or report a crash)
        cell = getCell()
        if cell is None:
            handleCrash()
        else:
            cell.className = "car"

# if the car has gone off the table, this tidies up including crash message
def handleCrash():
    window.clearInterval(intervalHandle)
    document.getElementById("Message").innerText = "Oops you crashed..."

# called when the page is loaded to start the timer checks
def runGame():
    global intervalHandle, keyProxy, timerProxy
    print("Running Game")
    keyProxy = create_proxy(checkKey)
    timerProxy = create_proxy(updatePosition)
    document.addEventListener('keydown', keyProxy)
    intervalHandle = window.setInterval(timerProxy, 300)

#############################
# Main Program
#############################

runGame()
