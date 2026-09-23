# DEMO CHANGE: the GUI version is a Flask website, which cannot run in the browser,
# so it has been left out of this demo. Choose t for the terminal version.
# from Gui import Gui
from terminal import Terminal

"""
Main program to run the program using GUI or Terminal output
"""

MESSAGE = """
Usage: choose 'g' for GUI or 't' for Terminal output
g : run the program using outputting to GUI
t : run the program using outputting to Terminal
"""

if __name__ == "__main__":
    print(MESSAGE)
    choice = input("Please enter your choice: ")
    check = False 
    while not check:
        if choice == 'g':
            # DEMO CHANGE: was ui = Gui()
            print("The GUI version is a website and is not included in this demo.")
            choice = input("Please enter your choice: ")
        elif choice == 't':
            ui = Terminal()
            check = True
            break
        else:
            print(f"{choice} is not valid, please try again.")
            choice = input("Please enter your choice: ")
