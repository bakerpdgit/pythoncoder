from player import Player
import time
import random
from computer import Computer
import copy
from stack import Stack

class Othello:
    WHITE = 2
    BLACK = 1

    def __init__(self, player1, player2, turn):
        ###################################
        #skill group A - composition
        ###################################


        ###################################
        #skill group A - Complex user defined OOP
        ###################################

        self.__Board = [[0 for i in range(8)] for j in range(8)] 
        ###################################
        # skill group B - multidimensional arrays
        ###################################
        self.__Player1 = player1
        self.__Player2 = player2
        self.__Turn = turn
        self.__movedirections = [[-1,1], [0,1], [1,1], [1,0], [1,-1], [0,-1], [-1,-1], [-1,0]]
        self.__Gamemode = 0
        self.__Boards = Stack()
    

    def setupGame(self):
        '''
            Method: setupGame
            Parameters: None
            Returns: None
            Does: Sets up the game by placing the initial pieces
        '''
        self.__Board = [[0 for i in range(8)] for j in range(8)]
        self.__Board[3][3] = Othello.BLACK
        self.__Board[4][4] = Othello.BLACK
        self.__Board[3][4] = Othello.WHITE
        self.__Board[4][3] = Othello.WHITE

        if self.__Gamemode == 1:
            self.__Player2 = Computer("Computer")
            self.__Player2.setDifficulty(int(input("Enter the difficulty of the computer (1,2,3,4): ")))

        self.__Boards.push(copy.deepcopy(self.__Board))
            
    def getWhiteScore(self, board):
        ###################################
        #skill group C - linear searches 
        ###################################
        '''
            Method: getWhiteScore
            Parameters: board
            Returns: count
            Does: Calculates the number of white pieces on the board
        '''
        count = 0
        for row in range(8):
            for col in range(8):
                if board[row][col] == Othello.WHITE:
                    count += 1

        return count
    
    def getBlackScore(self, board):
        '''
            Method: getBlackScore
            Parameters: board
            Returns: count
            Does: Calculates the number of black pieces on the board
        '''
        count = 0
        for row in range(8):
            for col in range(8):
                if board[row][col] == Othello.BLACK:
                    count += 1
        
        return count

    def playGame(self, board,  col, row, colour, direction):
        '''
            Method: playGame
            Parameters: board, col, row, colour, direction
            Returns: None
            Does: places a piece on the board and flips the pieces by moving in the direction specified in the parameter so that all enemy pieces in that direction are flipped.
        '''
        if board:
            # minimax only
            for dir in direction:
                i = 1
                while True:
                    nextrow = row + i*dir[0]
                    nextcol = col + i*dir[1]
                    try:
                        if board[nextrow][nextcol] == colour or board[nextrow][nextcol] == 0:
                            break
                        else:
                            board[nextrow][nextcol] = colour
                            i+=1
                    except:
                        break
            board[row][col] = colour
        else:

            for dir in direction:
                i = 1
                while True:
                    nextrow = row + i*dir[0]
                    nextcol = col + i*dir[1]
                    if self.__Board[nextrow][nextcol] == colour or self.__Board[nextrow][nextcol] == 0:
                        break
                    else:
                        self.__Board[nextrow][nextcol] = colour
                        i+=1
            self.__Board[row][col] = colour

    def calculateScore(self, board, colour):
        '''
            Method: calculateScore
            Parameters: board, colour
            Returns: score

            Does: Calculates the score of the board for a certain player. Adds friendly pieces and subtracts enemy pieces.
        '''

        matrix = [[100, -10, 11, 6, 6, 11, -10, 100],
                  [-10, -20, 1, 2, 2, 1, -20, -10],
                  [11, 1, 5, 4, 4, 5, 1, 11],
                  [6, 2, 4, 2, 2, 4, 2, 6],
                  [6, 2, 4, 2, 2, 4, 2, 6],
                  [11, 1, 5, 4, 4, 5, 1, 11],
                  [-10, -20, 1, 2, 2, 1, -20, -10],
                  [100, -10, 11, 6, 6, 11, -10, 100]]
        score = 0
        for row in range(8):
            for col in range(8):
                if board[row][col] == colour:
                    score += matrix[row][col]
                elif board[row][col] == 0:
                    pass
                else:
                    score -= matrix[row][col]
        return score
    
    def checkgameover(self, board):
        '''
            Method: checkgameover
            Parameters: board
            Returns: True or False
            Does: Checks if there are any empty spaces left on a board
        '''
        if len(self.getValidMoves(board, Othello.BLACK)) == 0 and len(self.getValidMoves(board, Othello.WHITE)) == 0:
            return True
        return False
    
    def calculateWinner(self):
        '''
            Method: calculateWinner
            Parameters: None
            Returns: None
            Does: Calculates the winner of the game
        '''
        white = 0
        black = 0
        for row in range(8):
            for col in range(8):
                if self.__Board[row][col] == Othello.BLACK:
                    black += 1
                elif self.__Board[row][col] == Othello.WHITE:
                    white += 1
        return black, white


    def isvalidmove(self, board, col, row, colour):
        ###################################
        #skill group A - complex user defined algorithms
        ###################################
        '''
            Method: isvalidmove
            Parameters: board, col, row, colour
            Returns: True or False
            Does: Checks if a move is valid
        '''
        valid = False
        moves = []
        for direction in self.__movedirections:
            if self.willFlip(board, col, row, direction, colour) and board[row][col] == 0:
                moves.append(direction)
        return len(moves) > 0, moves
    
    def willFlip(self, board, col, row, direction, colour):
        '''
            Method: willFlip
            Parameters: board, col, row, direction, colour
            Returns: True or False
            Does: Checks if a move will flip any pieces
        '''
        i = 1
        while True:
            newcol = col + i*direction[1]
            newrow = row + i*direction[0]
            if self.coordValid(newrow, newcol):
                if board[newrow][newcol] == 0:
                    return False
                elif board[newrow][newcol] == colour:
                    break
                else:
                    if self.coordValid(newrow + direction[0], newcol + direction[1]):
                        i += 1
                    else:
                        return False
            else:
                break
        return i > 1
    
    def getValidMoves(self, board, colour):
        '''
            Method: getValidMoves
            Parameters: board, colour
            Returns: moves
            Does: Gets all the valid moves for a certain player along with directions
        '''
        moves = []
        for row in range(8):
            for col in range(8):
                if board[row][col] == 0:
                    valid, dir = self.isvalidmove(board, col, row, colour)
                    if valid:
                        moves.append([[row, col], dir])
        return moves
    
    def displayBoard(self, board):
        '''
            Method: displayBoard
            Parameters: board
            Returns: None
            Does: Displays the board with the column and row numbers
        '''
        print("  0 1 2 3 4 5 6 7")
        for i in range(8):
            print(i, end = " ")
            for j in range(8):
                print(board[i][j], end = " ")
            print()

    def saveGame(self, choice):
        ###################################
        #skill group B - file reading and writing and text files
        ###################################
        '''
            Method: saveGame
            Parameters: None
            Returns: None
            Does: Saves the game to a file
            
            File Format:
            player1
            player2
            gamemode
            turn
            computer dificulty (0 if no computer)
            board
        '''

        ################################### 
        # Excellent Coding styles - cohesive mdules
        with open(f"game{choice}.txt", "w") as f:
            f.write(f"{self.__Player1.getName()}\n")
            f.write(f"{self.__Player2.getName()}\n")
            f.write(f"{self.__Gamemode}\n")
            f.write(f"{self.__Turn}\n")
            if self.__Gamemode == 1:
                f.write(f"{self.__Player2.getDifficulty()}\n")
            else:
                f.write("0\n")
            for row in range(8):
                for col in range(8):
                    f.write(f"{self.__Board[row][col]}")
                f.write("\n")
            print("Game saved")             

    def loadGame(self, choice):
        '''
            Method: loadGame
            Parameters: None
            Returns: None
            Does: Loads the game from a file
            
            File Format:
            player1
            player2
            gamemode
            turn
            computerdifficulty (0 if no computer)
            board
        '''     
        with open(f"game{choice}.txt", "r") as f:
            self.__Player1.setName(f.readline().strip())
            self.__Player2.setName(f.readline().strip())
            self.__Gamemode = int(f.readline().strip())
            self.__Turn = int(f.readline().strip())
            diff = int(f.readline().strip())
            if self.__Gamemode == 1:
                self.__Player2 = Computer("Computer")
                self.__Player2.setDifficulty(diff)
        
            for row in range(8):
                line = f.readline().strip()
                for col in range(8):
                    self.__Board[row][col] = int(line[col])

    def minimax(self, board, depth, ismaximising, startingcolour, a, beta):
        ###################################
        #skill group A - dynamic generaton of objects
        #skill group A - tree traversal
        ###################################
        '''
            Method: minimax
            Parameters: board, depth, ismaximising, startingcolour, a, beta
            Returns: move, value
            
            Does: Calculates the score of the board up to a certain depth using the minimax algorithm. returns the best move and the score corresponding to that
        '''  
  
        isfinished = (len(self.getValidMoves(board, 1)) == 0) and (len(self.getValidMoves(board, 2)) == 0)
        if depth == 0 or isfinished:
            if isfinished:
                # calculate who won that simulation
                blackcount = 0
                whitecount = 0
                for row in range(8):
                    for col in range(8):
                        if board[row][col] == 1:
                            blackcount += 1
                        elif board[row][col] == 2:
                            whitecount += 1
                
                if whitecount > blackcount:
                    if startingcolour == 1:
                        return None, 100000000000000
                    return None, -10000000000000
                elif blackcount > whitecount:
                    if startingcolour == 1:
                        return None, -10000000000000
                    return None, 100000000000000
                else:
                    return None, 0
            else:
                return None, self.calculateScore(board, 2)
            
        if ismaximising:
            validlocations = self.getValidMoves(board, startingcolour)
            value = -100000000000000
            try:
                move = random.choice(validlocations)
                for mov in validlocations:
                    b = copy.deepcopy(board)
                    self.playGame(b, mov[0][0], mov[0][1], 2, mov[1])
                    ###################################
                    #Skill group A - recursion
                    ###################################
                    new_score = self.minimax(b, depth - 1, False, 2, a, beta)[1]
                    if new_score > value:
                        value = new_score
                        move = mov
                    if value >= beta:
                        break
                    a = max(a, value)
                return move, value
            except:
                return None, -100000000000000
        else:
            if startingcolour == 1:
                validlocations = self.getValidMoves(board, 2)
            elif startingcolour == 2:
                validlocations = self.getValidMoves(board, 1)
            value = 100000000000000
            try:
                col = random.choice(validlocations)
                for mov in validlocations:
                    b = copy.deepcopy(board)
                    self.playGame(b, mov[0][0], mov[0][1], 1, mov[1])
                    new_score = self.minimax(b, depth - 1, True, 2, a, beta)[1]
                    if new_score < value:
                        value = new_score
                        move = mov
                    if value <= a:
                        break
                    beta = min(beta, value)
                return move, value
            except:
                return None, 100000000000000

    def getBoard(self):
        '''
            Method: getBoard
            Parameters: None
            Returns: Board
            Does: Gets the board
        '''
        return self.__Board 

    def getTurn(self):
        '''
            Method: getTurn
            Parameters: None
            Returns: Turn
            Does: Gets the turn
        '''
        return self.__Turn
    
    def setTurn(self, add):
        '''
            Method: setTurn
            Parameters: add
            Returns: None
            Does: changes the turn by add
        '''
        self.__Turn += add

    def coordValid(self, row, col):
        '''
            Method: coordValid
            Parameters: row, col
            Returns: True or False
            Does: Checks if a coordinate is valid
        '''
        return 0<=row<=7 and 0<=col<=7
    
    def setBoard(self, board):
        '''
            Method: setBoard
            Parameters: board
            Returns: None
            Does: Sets the board
        '''
        self.__Board = board

    def undo(self):
        if self.__Boards.size() > 1:
            self.__Boards.pop()
            self.__Board = copy.deepcopy(self.__Boards.peek())
            self.__Turn -= 1
            if self.__Gamemode == 1:
                self.__Turn -= 1 
            return True
    
    def getPlayer1Name(self):
        '''
            Method: getPlayer1Name
            Parameters: None
            Returns: Player1 name
            Does: Gets the player1 name
        '''
        return self.__Player1.getName()
    
    def getPlayer2Name(self):
        '''
            Method: getPlayer2Name
            Parameters: None
            Returns: Player2 name
            Does: Gets the player2 name
        '''
        return self.__Player2.getName()
    
    def setPlayer1(self,playername):
        '''
            Method: setPlayer1
            Parameters: None
            Returns: None
            Does: Sets the player1 name
        '''
        self.__Player1.setName(playername)
    
    def setPlayer2(self,playername):
        '''
            Method: setPlayer2
            Parameters: None
            Returns: None
            Does: Sets the player2 name
        '''
        self.__Player2.setName(playername)
    
    def getDifficulty(self):
        '''
            Method: getDifficulty
            Parameters: None
            Returns: Difficulty
            Does: Gets the difficulty
        '''
        try:
            return self.__Player2.getDifficulty()
        except:
            return None
        
    def setDifficult(self, difficulty):
        '''
            Method: setDifficult
            Parameters: difficulty
            Returns: None
            Does: Sets the difficulty
        '''
        self.__Player2.setDifficulty(difficulty)
     
    def getGamemode(self):
        '''
            Method: getGamemode
            Parameters: None
            Returns: Gamemode
            Does: Gets the gamemode
        '''
        return self.__Gamemode
    
    def setGamemode(self, gamemode):
        '''
            Method: setGamemode
            Parameters: None
            Returns: None
            Does: Sets the gamemode
        '''
        self.__Gamemode = gamemode

    def pushstack(self):
        '''
            Method: pushstack
            Parameters: None
            Returns: None
            Does: Pushes the board onto the stack
        '''
        self.__Boards.push(copy.deepcopy(self.__Board))
    
    def clearStack(self):
        '''
            Method: clearStack
            Parameters: None
            Returns: None
            Does: Clears the stack
        '''
        self.__Boards.clear()

    def cmove(self):
        '''
            Method: cmove
            Parameters: None
            Returns: computermove
            Does: Gets the computer move
            
            Difficulty 1: Random move
            Difficulty 2: Move which flips the most pieces
            Difficulty 3: Minimax with depth 3
            Difficulty 4: Minimax with depth 5
        '''
        move = self.getValidMoves(self.getBoard(), 2)
        #print(self.__game.getDifficulty())
        if self.getDifficulty() == 1:
            #choose a random move from the list of valid moves
            if len(move) == 0:
                return None
            computermove = random.choice(move)
        if self.getDifficulty() == 2:
            #choose the move which flips the most pieces
            same = copy.deepcopy(self.getBoard())
            maxflips = 0
            if len(move) == 0:
                return None
            computermove = random.choice(move)
            for mov in move:
                self.playGame(same, mov[0][1], mov[0][0], 2, mov[1])
                if self.getWhiteScore(same) - self.getWhiteScore(self.getBoard()) > maxflips:
                    maxflips = self.getWhiteScore(same) - self.getWhiteScore(self.getBoard())
                    computermove = mov
                same = copy.deepcopy(self.getBoard())
                
        if self.getDifficulty() == 3:
            computermove, score = self.minimax(self.getBoard(), 3, True, 2, -100000, 100000)
            print(f"minimax score: {score}")
        if self.getDifficulty() == 4:
            computermove, score = self.minimax(self.getBoard(), 5, True, 2, -100000, 100000)
            print(f"minimax score: {score}")
        return computermove
