from othello import Othello
from player import Player
from computer import Computer
import random
import copy
from ui import UI  # DEMO CHANGE: was from othelloGUI import UI

class terminal(UI):
    def __init__(self, player1, player2):
        super().__init__()
        self.__game = Othello(Player(player1), Player(player2), 1)

    def game(self, gamemode):
        '''
            Method: game
            Parameters: gamemode (int)
            Returns: None
            Does: Runs the game for the given gamemode
        '''
        self.__game.setGamemode(gamemode)
        self.__game.setupGame()


        while not self.__game.checkgameover(self.__game.getBoard()):
            self.__game.displayBoard(self.__game.getBoard())
            choice = input("""
1. Play
2. Save
3. Load
4. Quit
                           """)
            if choice == "1":
                if self.__game.getTurn() % 2 == 1:
                    print(f"Black ({self.__game.getPlayer1Name()}) turn")
                    # no valid moves
                    if len(self.__game.getValidMoves(self.__game.getBoard(), 1)) == 0:
                        print(f"{self.__game.getPlayer1Name()} has no valid moves")
                        self.__game.setTurn(1)
                        continue
                    valid = False

                    while not valid:
                        column = int(input("enter a column between 0 and 7: "))
                        row = int(input("enter a row between 0 and 7: "))
                        valid, dir = self.__game.isvalidmove(self.__game.getBoard(), column, row, 1)
                        if not valid:
                            print("Invalid move")

                    self.__game.playGame(None, column, row, 1, dir)
                # white colour in 2 player 
                elif self.__game.getGamemode() == 2 and self.__game.getTurn() % 2 == 0:
                    print(f"White ({self.__game.getPlayer2Name()}) turn")

                    if len(self.__game.getValidMoves(self.__game.getBoard(), 2)) == 0:
                        print(f"{self.__game.getPlayer2Name()} has no valid moves")
                        self.__game.setTurn(1)
                        continue
                    valid = False

                    while not valid:
                        column = int(input("enter a column between 0 and 7: "))
                        row = int(input("enter a row between 0 and 7: "))
                        valid, dir = self.__game.isvalidmove(self.__game.getBoard(), column, row, 2)
                        if not valid:
                            print("Invalid move")

                    self.__game.playGame(None, column, row, 2, dir)
                # white computer in 1 player
                elif self.__game.getGamemode() == 1 and self.__game.getTurn() % 2 == 0:
                    while True:
                        print("Computer turn")
                        if len(self.__game.getValidMoves(self.__game.getBoard(), 2)) == 0:
                            print("Computer has no valid moves")
                            # DEMO FIX: was setTurn(1) then continue, which repeated this
                            # message forever; breaking out passes the turn back to you
                            break
                        move = self.__game.cmove()
                        self.__game.playGame(None, move[0][1], move[0][0], 2, move[1])
                        
                        if len(self.__game.getValidMoves(self.__game.getBoard(), 1)) != 0:
                            break
                        else:
                            print("You have no valid moves")
                            self.__game.setTurn(1)
    

                    #self.__game.setTurn(1)
                self.__game.setTurn(1)
            elif choice == "2":
                # save game
                validchoice = False

                while not validchoice:
                    c = int(input("choose which file you want to save to (1, 2, 3, 4 to cancel): "))
                    if c in [1,2,3]:
                        validchoice = True
                    elif c == 4:
                        print("Cancelled")
                    else:
                        print("Invalid choice, try again")

                self.__game.saveGame(c)
            elif choice == "3":
                # load game
                validchoice = False

                while not validchoice:
                    c = int(input("choose which file you want to load from(1, 2, 3, 4 to cancel): "))
                    if c in [1,2,3]:
                        validchoice = True
                    elif c == 4:
                        print("Cancelled")
                    else:
                        print("Invalid choice, try again")

                self.__game.loadGame(c)
            elif choice == "4":
                return None
            

        black, white = self.__game.calculateWinner()
        print(f"Black: {black}\nWhite: {white}")


        if black > white:
            print(f"{self.__game.getPlayer1Name()} wins!")
        elif white > black:
            print(f"{self.__game.getPlayer2Name()} wins!")
        else:
            print("Tie!")

    def run(self):
        '''
            Method: startGame
            Parameters: None
            Returns: None
            Does: Starts the game
        '''
        x = input("1. 1 Player Game\n2. 2 Player Game\n3. Quit\n")
        if x == "2":
            self.game(2)
        elif x == "1":
            self.game(1)
        elif x == "3":
            return None
