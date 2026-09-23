from othelloTerm import terminal
# DEMO CHANGE: the GUI uses tkinter, which cannot run in the browser
# from othelloGUI import GUI

if __name__ == "__main__":
    #skill class B - generation of objects based on simple OOP
    choice = input("Terminal or GUI? ")
    # DEMO CHANGE: always use the terminal version in the browser
    if choice.lower() != "terminal":
        print("The GUI version cannot run in the browser, so the terminal version will start.")
        choice = "terminal"
    if choice.lower() == "terminal":
        player1 = input("Enter player 1 name: ")
        player2 = input("Enter player 2 name: ")
        
        game = terminal(player1, player2)
    elif choice.lower() == "gui":
        game = GUI()  # not reached in this demo
    game.run()