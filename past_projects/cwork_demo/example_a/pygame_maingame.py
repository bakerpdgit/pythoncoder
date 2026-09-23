
import pygame
from pygame_pieces import Piece
from pygame_button import Button
import time
import copy
import random 
pygame.init()
CELL_DIM = 25
WIDTH, HEIGHT = 800, 650
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Main")
WHITE = (255, 255, 255)
BLACK = (0,0,0)
LILAC = (250,238,255)
NAVY = (44,23,149)
FADE_DURATION = 2000   
GREY = (235,232,236)
BEIGE = (252,226,175)
BOARDDIM = (163,239,236)
BOARDDIMS = (152, 230, 228)
LIGHTBLUE = (182,255,251)
GAMEOVERCOLOUR = (162,74,250)
REDPROP = [(253,60,99),(198, 41, 72),(255,149,185)]
BLUEPROP = [(78,158,238),(66, 125, 205),(179, 208, 252)]
LILACPROP = [(218,169,255),(198,122,255),(218,169,255)]
GREENPROP = [(92,206,74),(90,166,79),(127,218,114)]
YELLOWPROP = [(255,239,90),(223,206,48),(255,243,125)]
PINKPROP = [(255,165,226),(255,108,207),(255,185,240)]
menu_background = pygame.image.load("menu_background.png").convert_alpha() 
menu_background = pygame.transform.scale(menu_background, (WIDTH, HEIGHT))
image = pygame.image.load("logo.png").convert_alpha()  
image = pygame.transform.scale(image, (WIDTH, HEIGHT))
image2 = pygame.image.load("board_background.png").convert_alpha()  
image2 = pygame.transform.scale(image2, (WIDTH, HEIGHT))



################
# GROUP A: OOP #
################

class Menubar():
    def __init__(self):
        bubble_font_path = "Find Cartoon.ttf" 
        font_size = 25
        self.font_main = pygame.font.Font(bubble_font_path, font_size)
        self.font_sub = pygame.font.SysFont(bubble_font_path, 20)
        self.current_player = "Player 1's turn"

    # create the menubar surface and blit it into the screen
    def background(self):
        menubar = pygame.Surface((WIDTH, HEIGHT/7))
        menubar.fill((222,255,255)) 
        screen.blit(menubar, (0,0))
        
    def display_timer(self, text):
        text1 = self.render_text(text, self.font_sub, NAVY)
        screen.blit(text1, (text1.get_rect(center=(WIDTH // 2, HEIGHT / 7 - 10))).topleft)
    
    def display_points(self,point_list):
        text1 = self.render_text(point_list[0], self.font_sub, NAVY)
        text2 = self.render_text(point_list[1], self.font_sub, NAVY)
        screen.blit(text1, (text1.get_rect(center=(WIDTH // 2 - 200, HEIGHT / 7 - 40))).topleft)
        screen.blit(text2, (text2.get_rect(center=(WIDTH // 2 + 200, HEIGHT / 7 - 40))).topleft)
    
    def display_player(self, player):
        text1 = self.render_text(player, self.font_main, NAVY)
        screen.blit(text1, (text1.get_rect(center=(WIDTH // 2, HEIGHT / 7 - 40))).topleft)

    def set_current_player(self,string):
        self.current_player = string

    def get_current_player(self):
        return self.current_player
    
    # render the text surface 
    def render_text(self,text, font, text_col):
        text_surface = font.render(text, True, text_col)
        return text_surface

################
# GROUP A: OOP #
################
class Display():
    def __init__(self):
        bubble_font_path = "Find Cartoon.ttf"  
        font_size = 42
        self.font = pygame.font.Font(bubble_font_path, font_size)
        self.font1 = pygame.font.SysFont("arial", 22)
        self._font_3 = pygame.font.Font(bubble_font_path, 20)
        self._font_4 = pygame.font.SysFont("arial", 22)
        self.font_sub = pygame.font.SysFont(bubble_font_path, 22)
        self._squares = []
        self._menubar = Menubar()
        self._boardsize = 14
        self._gridwidth, self._gridheight = CELL_DIM * self._boardsize, CELL_DIM * self._boardsize
        self._startxdisplay = (WIDTH - self._gridwidth) // 2
        self._startydisplay = ((HEIGHT - self._gridheight) // 2)+50
       
    def display_fading_image(self,fade_amount):
        screen.blit(image, (0, 0))  
        background = menu_background
        background.set_alpha(fade_amount)
        screen.blit(background, (0, 0)) 
    
    def get_starting_coord(self):
        return self._startxdisplay, self._startydisplay

    def display_player_turns_over(self, text, x, y, colour):
        text1 = self.render_text(text, self.font1, colour)
        screen.blit(text1, (text1.get_rect(center=(x,y))).topleft)

    def render_text(self,text, font, text_col):
        text_surface = font.render(text, True, text_col)
        return text_surface
    
    def display_return_instructions(self):
        text = self.render_text("Return", self.font, WHITE)
        screen.blit(text, (text.get_rect(center=(WIDTH // 2, HEIGHT // 2 +175))).topleft)


    def game_over_display(self):
        x,y = (CELL_DIM * self._boardsize)+175, (CELL_DIM * self._boardsize)+175
        grid_surface = pygame.Surface((x,y))
        grid_surface.fill(LIGHTBLUE)
        screen.blit(grid_surface, (((WIDTH - x) // 2), ((HEIGHT - y) // 2)))
        border_thickness = 3
        rect = pygame.Rect(((WIDTH - x) // 2),((HEIGHT - y) // 2),x,y)
        pygame.draw.rect(screen, LIGHTBLUE, rect, border_thickness)
    
    def customise_display(self):
        screen.blit(menu_background, (0, 0))
        text = self.render_text("CUSTOMISE", self.font, WHITE)
        screen.blit(text, (text.get_rect(center=(WIDTH // 2, HEIGHT // 2 - 250))).topleft)
    
    def customise_display_withAIdifficulty(self):
        text = self.render_text("Difficulty: ", self._font_4, WHITE)
        screen.blit(text, (text.get_rect(center=(WIDTH // 2 - 120, HEIGHT // 2 - 125))).topleft)
    
    def customise_display_withseconds(self):
        text = self.render_text("No. seconds: ", self._font_4, WHITE)
        screen.blit(text, (text.get_rect(center=(WIDTH // 2 - 120, HEIGHT // 2 - 185))).topleft)
    
    def customise_display_withColours(self, player1colour, player2colour):
        text = self.render_text("Player 1: ", self._font_4, WHITE)
        screen.blit(text, (text.get_rect(center=(WIDTH // 2 - 290, HEIGHT // 2 ))).topleft)
        text = self.render_text("Player 2: ", self._font_4, WHITE)
        screen.blit(text, (text.get_rect(center=(WIDTH // 2 - 80, HEIGHT // 2 ))).topleft)
        text1 = self.render_text(player1colour, self.font_sub, WHITE)
        text2 = self.render_text(player2colour, self.font_sub, WHITE)
        screen.blit(text1, (text1.get_rect(center=(WIDTH // 2 - 200, HEIGHT // 2))).topleft)
        screen.blit(text2, (text2.get_rect(center=(WIDTH // 2 + 10, HEIGHT // 2))).topleft)
       
        
     # display the text on the instruction screen and blit it onto the screen  
    def instructions_display(self):
        screen.blit(menu_background, (0, 0))
        text = self.render_text("INSTRUCTIONS", self.font, WHITE)
        instructions_text1 = self.render_text("Place as many of your pieces on the board while blocking", self.font1, WHITE)
        instructions_text2 = self.render_text("your opponent. Your piece must touch only the corner of", self.font1, WHITE)
        instructions_text3 = self.render_text("another piece you previously played (unless it is your first go).", self.font1, WHITE)
        instructions_text4 = self.render_text("The bigger your piece is (the more squares it has) the more", self.font1, WHITE)
        instructions_text5 = self.render_text("points you get. The game is over when both players have no", self.font1, WHITE)
        instructions_text6 = self.render_text("more pieces left to play or when both players cannot make a ", self.font1, WHITE)
        instructions_text7 = self.render_text("valid move. The winner is the player who has the highest", self.font1, WHITE)
        instructions_text8 = self.render_text("number of points.", self.font1, WHITE)
         
        screen.blit(text, (text.get_rect(center=(WIDTH // 2, HEIGHT // 2 - 250))).topleft)
        screen.blit(instructions_text1, (text.get_rect(center=(WIDTH // 2 - 50, HEIGHT // 2 - 150))).topleft)
        screen.blit(instructions_text2, (text.get_rect(center=(WIDTH // 2 - 50, HEIGHT // 2 - 125))).topleft)
        screen.blit(instructions_text3, (text.get_rect(center=(WIDTH // 2 - 50, HEIGHT // 2 - 100))).topleft)
        screen.blit(instructions_text4, (text.get_rect(center=(WIDTH // 2 - 50, HEIGHT // 2 - 75))).topleft)
        screen.blit(instructions_text5, (text.get_rect(center=(WIDTH // 2 - 50, HEIGHT // 2 - 50))).topleft)
        screen.blit(instructions_text6, (text.get_rect(center=(WIDTH // 2 - 50, HEIGHT // 2 - 25))).topleft)
        screen.blit(instructions_text7, (text.get_rect(center=(WIDTH // 2 - 50, HEIGHT // 2))).topleft)
        screen.blit(instructions_text8, (text.get_rect(center=(WIDTH // 2 - 50, HEIGHT // 2 + 25))).topleft)
 
    # display the game board by iterating through each cell and drawing it
    def display_board(self):
        screen.fill(WHITE)
        screen.blit(image2, (0, 0))  
        self._menubar.background()
        self._gridwidth = self._boardsize * CELL_DIM
        self._gridheight = self._boardsize * CELL_DIM
        grid_surface = pygame.Surface((self._gridwidth, self._gridheight))
        grid_surface.fill(LIGHTBLUE)
        screen.blit(grid_surface, (((WIDTH - self._gridwidth) // 2), ((HEIGHT - self._gridheight) // 2) + 50))
        self._startxdisplay = (WIDTH - self._gridwidth) // 2
        self._startydisplay = ((HEIGHT - self._gridheight) // 2) + 50
        final_x = self._startxdisplay + self._gridwidth
        final_y = self._startydisplay + self._gridheight
        self._squares.clear()

        for row in range(self._boardsize):
            for col in range(self._boardsize):
                rect_x = self._startxdisplay + col * CELL_DIM
                rect_y = self._startydisplay + row * CELL_DIM
                rect = pygame.Rect(rect_x, rect_y, CELL_DIM, CELL_DIM)
                self._squares.append(rect)
                pygame.draw.rect(screen, BOARDDIM, rect, 5)
                pygame.draw.rect(screen, BOARDDIMS, rect, 3)

        for i in range(self._boardsize + 1):
            x = self._startxdisplay + i * CELL_DIM
            y = self._startydisplay + i * CELL_DIM
            pygame.draw.line(screen, BLACK, (x, self._startydisplay), (x, final_y), 1)
            pygame.draw.line(screen, BLACK, (self._startxdisplay, y), (final_x, y), 1)

        pygame.draw.line(screen, BLACK, (final_x, self._startydisplay), (final_x, final_y), 1)
        pygame.draw.line(screen, BLACK, (self._startxdisplay, final_y), (final_x, final_y), 1)

    def get_rects_of_squares(self):
        return self._squares
    
    def main_menu(self):
        screen.blit(menu_background, (0, 0))  
        text = self.render_text("MAIN MENU", self.font, WHITE)
        screen.blit(text, (text.get_rect(center=(WIDTH // 2, HEIGHT // 2 - 250))).topleft)


################
# GROUP A: OOP #
################      
class Player():
    def __init__(self, num, colourName, colour, dim_colour,dragging_col,dragging_col_dim, piece_pos1, piece_pos2, piece_pos3, piece_pos4, piece_pos5, piece_pos6,piece_pos7,piece_pos8,piece_pos9,piece_pos10,piece_pos11,piece_pos12,piece_pos13,piece_pos15,isAI):
        self.isAI = isAI
        self.points = 0
        self.playerID = num
        self.colour = colour 
        self.colourchosen = False
        self.colourName = colourName
        self.dim_colour = dim_colour
        self.dragging_col = dragging_col
        self.dragging_col_dim = dragging_col_dim
        self.occupied_positions = []
        self.first_moved = False
        self.game_over = False
        self.num_turns = 0
        self.num_pieces = 15
        self._player_moves_left = []
        self._num_moves_left = 0
        #####################################
        # GROUP B: Multi-dimensional arrays #
        #####################################
        # the piece objects for every piece the player has 
        self.pieces = [
            Piece("1", [(0, 0), (1, 0), (2, 0), (3, 0), (4, 0)], self.playerID, colour, dim_colour, dragging_col, dragging_col_dim,piece_pos1,False),
            Piece("2", [(0, 0), (1, 0), (0, 1), (1, 1)], self.playerID, colour,dim_colour, dragging_col, dragging_col_dim,piece_pos2,False),
            Piece("3", [(1, 0), (0, 1), (1, 1), (2, 1)], self.playerID, colour,dim_colour, dragging_col, dragging_col_dim,piece_pos3,False),
            Piece("4", [(0, 0), (1, 0), (2, 0), (2, 1)], self.playerID, colour, dim_colour, dragging_col,dragging_col_dim, piece_pos4,False),
            Piece("5", [(0, 0), (0, 1), (1, 1), (2, 1)], self.playerID, colour, dim_colour, dragging_col,dragging_col_dim, piece_pos5,False),
            Piece("6", [(0, 0), (1, 0), (1, 1), (2, 1)], self.playerID, colour, dim_colour, dragging_col,dragging_col_dim, piece_pos6,False),
            Piece("7", [(0, 0), (1, 0)], self.playerID, colour, dim_colour, dragging_col, dragging_col_dim, piece_pos7, False), 
            Piece("8", [(0, 0), (0, 1), (1, 0)], self.playerID, colour, dim_colour, dragging_col, dragging_col_dim, piece_pos8, False),  
            Piece("9", [(0, 0), (1, 0), (1, 1), (0, 2)], self.playerID, colour, dim_colour, dragging_col, dragging_col_dim, piece_pos9, False), 
            Piece("10", [(0, 0), (0, 1), (1, 1), (1, 2)], self.playerID, colour, dim_colour, dragging_col, dragging_col_dim, piece_pos10, False),  
            Piece("11", [(0, 0), (1, 0), (1, 1), (2, 1), (2, 2)], self.playerID, colour, dim_colour, dragging_col, dragging_col_dim, piece_pos11, False), 
            Piece("12", [(0, 0), (0, 1), (1, 1), (2, 1), (2, 0)], self.playerID, colour, dim_colour, dragging_col, dragging_col_dim, piece_pos12, False),  
            Piece("13", [(0, 0), (1, 0), (2, 0), (1, 1), (1, -1)], self.playerID, colour, dim_colour, dragging_col, dragging_col_dim, piece_pos13, False),  
            Piece("15", [(0, 0), (1, 0), (1, 1), (1, 2), (2, 2)], self.playerID, colour, dim_colour, dragging_col, dragging_col_dim, piece_pos15, False),

        ]

    def set_game_over(self):
        self.game_over = True

    def get_game_over(self):
        return self.game_over
    
    def add_occupied_positions(self,new_pos):
        self.occupied_positions.append(new_pos)
    
    def get_occupied_positions(self):
        return self.occupied_positions
    
    def set_player_points(self, num):
        self.points += num
    
    def get_player_points(self):
        return self.points
    
    def get_ID(self):
        return self.playerID
    
    # reset the game by setting the values back to their initial values 
    def reset(self, AI):
        self.num_pieces = 15 
        self.num_turns = 0
        self.points = 0
        self.first_moved = False
        self._moved = False
        self.game_over = False
        self.occupied_positions = []
        self.isAI = AI

        # using a dictionary to return the attributes of the pieces to their original value
        for piece in self.pieces:
            piece.data["_occupied_positions"] = []
            piece.data["pos"] = piece.data["_orig_pos"]
            piece.data["pixel_pos"] = piece.data["_orig_pixel_pos"]
            piece.data["_is_first_move"] = False
            piece.data["_moved"] = False
            piece.data["_dragging"] = False
        
    def clear_occupied_positions(self):
        self.occupied_positions = []
    
    # set the colour of the piece 
    def set_colour(self, colourName, colour, dim, dragging):
        self.colour = colour
        self.colourName = colourName
        self.dim_colour = dim
        self.dragging_col = dragging
        self.dragging_col_dim = dragging
        for piece in self.pieces:
            piece.set_piece_colour(colour, dim, dragging)

################
# GROUP A: OOP #
################      
class GameState():
    def __init__(self):
        self.Player1 = None 
        self.Player2 = None
        self._current_player = self.Player1
        self._player_game_over = False
        self._all_occupied_pos = []
            
    # deepcopy the player objects to ensure the player attributes are copied 
    # return the current player back to player one 
    def copy(self, player1, player2, occupied_pos, game_over):
        self.Player1 = copy.deepcopy(player1)
        self.Player2 = copy.deepcopy(player2)
        self._players = [self.Player1, self.Player2]
        self._current_player = self.Player1
        self._all_occupied_pos = occupied_pos
        self._display_game_over = game_over

################
# GROUP A: OOP #
################
class Game():
    def __init__(self):
        self._clicked = False
        self._active = 0
        self._button = Button()
        self._interface = Display()
        self.Player1col = (253,60,99)
        self.Player2col = (78,158,238)
        self.player1dim = (198, 41, 72)
        self.player1dragging = (255,149,185)
        self.player1draggingdim = (255,95,149)
        self.player2draggingdim = (119,174,255)
        self.player2dragging = (179, 208, 252)
        self.player2dim = (66, 125, 205)
        self.Player1 = Player(1, "Standard (Blue)", self.Player1col, self.player1dim, self.player1dragging, self.player1draggingdim,(212//25 - 7.5,187//25 +1), (212//25 -2 ,187//25 + 1), (212//25 -7.5,187//25 + 6),(212//25 - 7,187//25 +3), (212//25 -4 ,187//25 + 6), (212//25 -3 ,187//25 + 4),(212//25 -2 ,187//25 + 9),(212//25 -2 ,187//25 + 11),(212//25 -5 ,187//25 + 9),(212//25 -7.5 ,187//25 + 9),(212//25 -7 ,187//25 + 13),(212//25 -3 ,187//25 + 13.5),(212//25 -7.5 ,187//25 -1.5),(212//25 -3.5 ,187//25 -2.5),False)
        self.Player2 = Player(2,"Standard (Red)", self.Player2col, self.player2dim, self.player2dragging,self.player2draggingdim, (212//25 + 16,187//25+1), (212//25 +21.5 ,187//25 + 1), (212//25 + 16,187//25 + 6),(212//25 + 16,187//25 +3), (212//25 +20 ,187//25 + 6), (212//25 +20.5,187//25 + 4),(212//25 +21.5 ,187//25 + 9),(212//25 +21.5 ,187//25 + 11),(212//25 +19 ,187//25 + 9),(212//25 +16.5 ,187//25 + 9),(212//25 +16.5 ,187//25 + 13),(212//25 +20.5 ,187//25 + 14),(212//25 +20.5 ,187//25 - 1.5),(212//25 +16.5 ,187//25 - 2.5),False)
        self._players = [self.Player1, self.Player2]
        self._current_player = self.Player1
        self._dragging = False
        self._piece_chosen = False 
        self._piece = None
        self._dragging_piece = None
        self._identifier = 1
        self._point_list = ["Player 1 has 0 points","Player 2 has 0 points"]
        self._display_player = "Player 1's turn"
        self._timer = ""
        self._piece_rects = []
        self._text = ""
        self._count = 0
        self._display_game_over = False
        self._player_game_over = None 
        self._winner = None
        self._AI_active = False
        self.depth = 0
        self.display_colours = False
        self.Player2isAI = False
        self._display_board_sizes = False
        self._home = False
        self._state_stack = [] 
        self._gamestate = GameState()
        self._applying_move_in_progress = False
        self.time_limit = None
        self.time_remaining = self.time_limit
        self.turn_start_time = None
        self.last_print_time = None
        self.timeron = False

    # reset the game 
    # create new Button and Display objects 
    # reset the player attributes as well, including whether player 2 is AI or not 
    def reset_game(self,AI, depth, board_size, timeron, timelimit):
        self.Player1.reset(False)
        self.Player2.reset(AI)
        self._test = None
        self._clicked = False
        self._active = 0
        self._dragging = False
        self._piece = None
        self._dragging_piece = None
        self._current_player = self.Player1
        self._identifier = 1
        self._button = Button()
        self._interface = Display()
        self._point_list = ["Player 1 has 0 points","Player 2 has 0 points"]
        self._display_player = "Player 1's turn"
        self._piece_rects = []
        self._text = ""
        self._count = 0
        self._display_game_over = False
        self._player_game_over = None 
        self._winner = None
        self.depth = depth
        self._interface._boardsize = board_size
        self._time_up = False
        self.timeron = timeron
        self.time_limit = timelimit
    
    # reset the colours of the player back to their standard colour
    def reset_colours(self):
        self.Player1.set_colour("Standard (Red)",(253,60,99),(198, 41, 72),(255,149,185))
        self.Player1.colourchosen = False
        self.Player2.set_colour("Standard (Blue)",(78,158,238),(66, 125, 205),(179, 208, 252))
        self.Player2.colourchosen = False

    def all_occupied_pos(self):
        all_occupied = []
        for player in self._players:
            for val in player.get_occupied_positions():
                all_occupied.append(val)
        return all_occupied


    def display_player_points(self):
        for player in self._players:
            if player.get_ID() == 1:
                self._point_list[0] = f"Player {player.get_ID()} has {player.get_player_points()} points"
            else:
                self._point_list[1] = f"Player {player.get_ID()} has {player.get_player_points()} points"
    
    # perform suitable checks to see if player 2 is AI
    def display_player(self, player, winner):
        if player == self.Player1 and winner == None:
            self._display_player = "Player 1's turn"
        if player == self.Player2 and winner == None:
            if self.Player2.isAI:
                self._display_player = "AI player's turn"
            else:
                self._display_player = "Player 2's turn"
        if winner != None and winner != "Draw!" and winner != 1 and self.Player2.isAI:
            self._display_player = f"AI wins!"
        if winner != None and winner != "Draw!" and self.Player2.isAI == False:
            self._display_player = f"Player {winner} wins!"
        if winner == "Draw!":
            self._display_player = "Draw!"
    
    # display the amount of time the player has left 
    def timer(self, player, time):
        if time == None and player == None:
            self._timer = ""
        else:
            self._timer = f"Player {player.playerID} has {time} seconds left"
    
    # checking to see if the game is over 
    def check_game_over(self, starting_coord, player, all_occupied_pos, player_occupied_pos, first_move):
        if player.num_pieces == 0:
            player.game_over = True 
            return True 
        max_x = starting_coord[0] + self._interface._boardsize * CELL_DIM
        min_x = starting_coord[0]
        max_y = starting_coord[1] + self._interface._boardsize * CELL_DIM
        min_y = starting_coord[1]
        for piece in player.pieces:
            if not piece.data["_moved"]:
                for row in range(min_x,max_x+1, CELL_DIM):
                    for col in range(min_y,max_y+1, CELL_DIM):
                        move = piece.moves_left(max_x,min_x,max_y,min_y,row, 
                                                col, all_occupied_pos, player_occupied_pos,first_move)
                        if type(move) == tuple:
                            return move
        player.game_over = True
        return True

    ##################
    # GROUP A: Stack #
    ##################
    # push the move onto the stack 
    def push_state(self, game_state, move, player):
        piece_and_positions = []
        for piece in player.pieces:
            piece_and_pos = (piece, piece.get_occupied_pos())
            piece_and_positions.append(piece_and_pos)
        
        self._state_stack.append((
            piece_and_positions,
            player.num_pieces, 
            player.num_turns,  
            player.points,
            player.first_moved,  
            game_state.Player1.get_occupied_positions(),  
            game_state.Player2.get_occupied_positions(), 
            game_state._current_player,  
            move 
        ))

    ##################
    # GROUP A: Stack #
    ##################
    # pop the move from the stack
    def pop_state(self, game_state):
        if self._state_stack:
            state = self._state_stack.pop()
            piece_positions, num_pieces, num_turns, num_points, first_moved, occupied1, occupied2, current_player, last_move = state
            
            player = game_state._current_player
            for val in piece_positions:
                if len(val[1]) != 0:
                    position = val[1][0]
                    piece = val[0]
                    piece.update_position(position)
            
            player.num_pieces = num_pieces
            player.num_turns = num_turns
            player.first_moved = first_moved
            player.points = num_points
            game_state.Player1.occupied_positions = occupied1
            game_state.Player2.occupied_positions = occupied2
            game_state._current_player = current_player

    ###########################################
    # GROUP A: Complex user-defined algorithm #
    ###########################################
    # minimax algorithm to evaluate the best move the AI player can make 
    # alpha beta pruning to stop searches which are proving to be ineffecient 
    def minimax(self, game_state, depth, is_ai_turn, alpha=float('-inf'), beta=float('inf')):
        if depth == 0 or game_state._display_game_over:
            return self.evaluate(game_state) 

        if is_ai_turn:
            max_eval = float('-inf')
            moves = self.generate_player_moves(game_state.Player2)
            for move in moves:
                self.push_state(game_state, move, game_state.Player2)
                self.apply_move(move, game_state.Player2, game_state._players, game_state._current_player, game_state._all_occupied_pos)
                eval = self.minimax(game_state, depth - 1, False, alpha, beta)
                self.pop_state(game_state)

                ###########################
                # GROUP A: Tree Traversal #
                ###########################

                max_eval = max(max_eval, eval)
                alpha = max(alpha, eval)
                if beta <= alpha:  
                    break
            return max_eval

        else:
            min_eval = float('inf')
            moves = self.generate_player_moves(game_state.Player1)

            for move in moves:
                self.push_state(game_state, move, game_state.Player1)
                self.apply_move(move, game_state.Player1, game_state._players, game_state._current_player, game_state._all_occupied_pos)
                eval = self.minimax(game_state, depth - 1, True, alpha, beta)
                self.pop_state(game_state)

                ###########################
                # GROUP A: Tree Traversal #
                ###########################
                min_eval = min(min_eval, eval)
                beta = min(beta, eval)
                if beta <= alpha:  
                    break

            return min_eval

    def find_piece(self, player, piece_num):
        for piece in player.pieces:
            if piece._piece_num == piece_num:
                return piece
        return None
    
    
    def evaluate(self, game_state): 
        return len(self.generate_player_moves(
            game_state.Player2)) - len(self.generate_player_moves(game_state.Player1))
      
    # generate the player moves for a player 
    def generate_player_moves(self, player):
        starting_coord = self._interface.get_starting_coord()
        all_occupied_pos = self.all_occupied_pos()
        player_occupied_pos = player.get_occupied_positions()
        first_move = player.first_moved
        player._player_moves_left = []
        player._num_moves_left = 0
        max_x = starting_coord[0] + self._interface._boardsize * CELL_DIM
        min_x = starting_coord[0]
        max_y = starting_coord[1] + self._interface._boardsize * CELL_DIM
        min_y = starting_coord[1]
        player_moves = []
        for piece in player.pieces:
            if not piece.data["_moved"]:
                for row in range(min_x,max_x+1, CELL_DIM):
                    for col in range(min_y,max_y+1, CELL_DIM):
                        valid_moves = piece.all_moves_left(
                            max_x,min_x,max_y,min_y,row, col, 
                            all_occupied_pos, player_occupied_pos,first_move)
                        if valid_moves != None:
                            for val in valid_moves:
                                player_moves.append((val,piece)) 
                                player._num_moves_left += 1
        player._player_moves_left.append(player_moves)
        return player_moves

    def switch_player(self,player):
        if player == self.Player1:
            player._first_moved = True
            player = self.Player2
            self._identifier = 2
         
        else:
            player._first_moved = True
            player = self.Player1
            self._identifier = 1
        return player 
    
    # switch between player 1 and 2
    # take into account the game may be over for a player hence dont switch and remain with the current player until they are done 
    def switching_player_logic(self, player1, player2, current_player, applying_move):
        if player1.num_pieces == 0 and player2.num_pieces == 0:
            if self._applying_move_in_progress:
                self._gamestate._display_game_over = True
            else:
                self.timer(None, None)
                self._display_game_over = True
        elif player1.game_over and player2.game_over:
            if self._applying_move_in_progress:
                self._gamestate._display_game_over = True
            else:
                self.timer(None, None)
                self._display_game_over = True
        elif player1.game_over and not player2.game_over:
            if self._applying_move_in_progress:
                self._current_player = player2
            else:
                self._current_player = player2
                self._identifier = 2
        elif not player1.game_over and player2.game_over:
            if self._applying_move_in_progress:
                self._current_player = player1
            else:
                self._current_player = player1
                self._identifier = 1
        elif not applying_move:
            self._current_player = self.switch_player(current_player) 
        elif applying_move:
            return True
        
    # when the game is over, calculate the winner 
    def calc_winner(self, player1, player2):
        if player1.get_player_points() > player2.get_player_points():
            return self.Player1.playerID
        elif player1.get_player_points() < player2.get_player_points():
            return self.Player2.playerID
        else:
            return "Draw!"
    
    # during minimax, to implement moves this method will apply the move 
    def apply_move(self,move, player, players, current_player, all_occupied_pos):
        target_position, piece = move
        piece.update_position(target_position)
        piece.set_moved()
        
        if not player.first_moved:
            player.first_moved = True
      
        player.clear_occupied_positions()
        for piece in player.pieces:
           
            player.set_player_points(piece.calc_points())
            for pos in piece.get_occupied_pos():
                player.add_occupied_positions(pos)
        target_position, piece = move
      
        self.check_game_over(self._interface.get_starting_coord(), player, all_occupied_pos, player.get_occupied_positions(), player.first_moved)
        
        if self.switching_player_logic(players[0], players[1],current_player, True):
            return True 

     
    def start(self):
        run = True
        fade_start_time = pygame.time.get_ticks()
        # set the initial state to FADE
        self.state = "FADE"

        while run:
            mouse_pos = pygame.mouse.get_pos()
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    run = False
                elif event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                    run = False
            
            if self.state == "FADE":
                current_time = pygame.time.get_ticks()
                elapsed_time = current_time - fade_start_time
                fade_amount = min(255, int(255 * elapsed_time / FADE_DURATION))
                if fade_amount >= 255:
                    self.state = "MENU"
                else:
                    self._interface.display_fading_image(fade_amount)

            if self.state == "MENU":
                self._interface.main_menu()
                self._button.display_menu_buttons()
                mouse_pos = pygame.mouse.get_pos()
            
                # if the play button is clicked 
                if self._button._play_button_rect.collidepoint(mouse_pos):
                    if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                        self._clicked = True
                        self.state = "BOARD"
                    elif pygame.mouse.get_pressed()[0] == 0:
                        self._clicked = False
                if self._button._customise_button_rect.collidepoint(mouse_pos):
                    if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                        self._clicked = True
                        self.state = "CUSTOMISE"
                    elif pygame.mouse.get_pressed()[0] == 0:
                        self._clicked = False
                if self._button._instructions_button_rect.collidepoint(mouse_pos):
                    if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                        self._clicked = True
                        self.state = "INSTRUCTIONS"
                    elif pygame.mouse.get_pressed()[0] == 0:
                        self._clicked = False

            elif self.state == "INSTRUCTIONS":
                self._interface.instructions_display()
                self._button.display_instructions_button()
                self._interface.display_return_instructions()
                mouse_pos = pygame.mouse.get_pos()
                if self._button.return_back_to_main_menu_from_instructions_rect.collidepoint(mouse_pos):
                    if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                        self.state = "MENU"
                        self._clicked = True
                    elif pygame.mouse.get_pressed()[0] == 0:
                        self._clicked = False
            
            if self.state == "CUSTOMISE":
                self._interface.customise_display()
                self._button.display_customise_buttons()
                self._button.display_colour_button()
                self._button.display_board_size()
                self._button.display_time_button()
                mouse_pos = pygame.mouse.get_pos()

                if self._button._colour_rect.collidepoint(mouse_pos):
                    if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                        self.display_colours = not self.display_colours
                        self._clicked = True
                    elif pygame.mouse.get_pressed()[0] == 0:
                        self._clicked = False

                if self._button.AI_button_rect.collidepoint(mouse_pos):
                    if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                            self.Player2.isAI = not self.Player2.isAI
                            self._clicked = True
                    elif pygame.mouse.get_pressed()[0] == 0:
                        self._button.display_customise_buttons()
                        self._clicked = False

                if self._button.time_button_rect.collidepoint(mouse_pos):
                    if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                            self.timeron = not self.timeron
                            self._clicked = True
                    elif pygame.mouse.get_pressed()[0] == 0:
                        self._button.display_time_button()
                        self._clicked = False

                # if the user has selected timed conditions
                if self.timeron:
                    self._button.display_timer_colourchange()
                    self._interface.customise_display_withseconds()
                    if self._button._tens_rect.collidepoint(mouse_pos):
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                            self.time_limit = 11
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False
                    if self._button._fifteens_rect.collidepoint(mouse_pos):
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                            self.time_limit = 16
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False
                    if self._button._twentys_rect.collidepoint(mouse_pos):
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                            self.time_limit = 21
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False
                    
                    if self.time_limit == 11:
                        self._button.tens_colourchange()
                    if self.time_limit == 16:
                        self._button.fifteens_colourchange()
                    if self.time_limit == 21:
                        self._button.twentys_colourchange()

                if self._button._board_size_rect.collidepoint(mouse_pos):
                    if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                        self._display_board_sizes = not self._display_board_sizes
                        self._clicked = True
                    elif pygame.mouse.get_pressed()[0] == 0:
                        self._button.display_customise_buttons()
                        self._clicked = False
                
                
                if self._display_board_sizes:
                    self._button.display_board_sizes()
                    if self._button._ten_rect.collidepoint(mouse_pos):
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                            self._interface._boardsize = 10
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False
                    if self._button._twelve_rect.collidepoint(mouse_pos):
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                            self._interface._boardsize = 12
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False
                    if self._button._fifteen_rect.collidepoint(mouse_pos):
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                            self._interface._boardsize = 15
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False
                    
                    if self._interface._boardsize == 10:
                        self._button.ten_colourchange()
                    if self._interface._boardsize == 12:
                        self._button.twelve_colourchange()
                    if self._interface._boardsize == 15:
                        self._button.fifteen_colourchange()
                   
                        
                if self.Player2.isAI:
                    self._interface.customise_display_withAIdifficulty()
                    self._button.display_customise_buttons_AI_colourchange()
                    if self._button._easy_rect.collidepoint(mouse_pos):
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                            self.depth = 5
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False
                    if self._button._medium_rect.collidepoint(mouse_pos):
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                            self.depth = 10
                            self._button.display_customise_buttons_medium_colourchange()
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False
                    if self._button._hard_rect.collidepoint(mouse_pos):
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                            self.depth = 15
                            self._button.display_customise_buttons_hard_colourchange()
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False
                    if self.depth == 5:
                        self._button.display_customise_buttons_easy_colourchange()
                    if self.depth == 10:
                        self._button.display_customise_buttons_medium_colourchange()
                    if self.depth == 15:
                        self._button.display_customise_buttons_hard_colourchange()
                        
                else:
                    self._button.display_customise_buttons()
                
                
                if self.display_colours == True:
                    self._interface.customise_display_withColours(self.Player1.colourName, self.Player2.colourName)
                    self._button.display_colours()

                    # if the user selects green then the players colour is set to green 
                    if self._button.green.collidepoint(mouse_pos):
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                            self.Player1.set_colour("GREEN", GREENPROP[0],GREENPROP[1], GREENPROP[2]) 
                            self._clicked = True
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False

                    if self._button.lilac.collidepoint(mouse_pos):
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked: 
                            self.Player1.set_colour("LILAC", LILACPROP[0],LILACPROP[1], LILACPROP[2]) 
                            self._clicked = True
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False
                    if self._button.yellow.collidepoint(mouse_pos):
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked: 
                            self.Player1.set_colour("YELLOW", YELLOWPROP[0],YELLOWPROP[1], YELLOWPROP[2]) 
                            self._clicked = True
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False

                    if self._button.pink.collidepoint(mouse_pos):
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked: 
                            self.Player1.set_colour("PINK", PINKPROP[0],PINKPROP[1], PINKPROP[2]) 
                            self._clicked = True
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False

                    if self._button.green2.collidepoint(mouse_pos):
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked: 
                            self.Player2.set_colour("GREEN", GREENPROP[0],GREENPROP[1], GREENPROP[2]) 
                            self._clicked = True
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False

                    if self._button.lilac2.collidepoint(mouse_pos):
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked: 
                            self.Player2.set_colour("LILAC", LILACPROP[0],LILACPROP[1], LILACPROP[2]) 
                            self._clicked = True
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False

                    if self._button.yellow2.collidepoint(mouse_pos):
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked: 
                            self.Player2.set_colour("YELLOW", YELLOWPROP[0],YELLOWPROP[1], YELLOWPROP[2]) 
                            self._clicked = True
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False

                    if self._button.pink2.collidepoint(mouse_pos):
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked: 
                            self.Player2.set_colour("PINK", PINKPROP[0],PINKPROP[1], PINKPROP[2]) 
                            self._clicked = True
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False

                if self._button.return_back_to_main_menu_rect.collidepoint(mouse_pos):
                    if pygame.mouse.get_pressed()[0] == 1 and not self._clicked: 
                        self.state = "MENU" 
                        self._clicked = True
                    elif pygame.mouse.get_pressed()[0] == 0:
                        self._clicked = False


            if self.state == "BOARD":
                self._interface.display_board()
                self._button.display_home_button()
                if self._button._home_button_rect.collidepoint(mouse_pos):
                    if pygame.mouse.get_pressed()[0] == 1 and not self._clicked: 
                        self.state = "MENU" 
                        self.reset_game(False, 0,14, False, None)
                        self.timer(None, None)
                        self.reset_colours()
                        self._clicked = True
                    elif pygame.mouse.get_pressed()[0] == 0:
                        self._clicked = False
                if self._current_player.isAI:
                    self.timer(None, None)
                    self._interface._menubar.background()
                    
                   
                    self._applying_move_in_progress = True
                    if self._current_player.first_moved:
                        best_score = float('-inf')
                        best_move = None

                        # create a copy of the game state 
                        self._gamestate.copy(self.Player1, self.Player2, self.all_occupied_pos(), self._display_game_over)
                        # for every possible move player 2 can make, apply that move to the copied gamestate and call minimax to evaluate the move 
                        for move in self.generate_player_moves(self._gamestate.Player2):
                            self.push_state(self._gamestate, move, self._gamestate.Player2)  
                            for piece in self._gamestate.Player2.pieces: 
                                if piece.data["_piece_num"] == move[1].data["_piece_num"]:
                                    target_piece = piece
                                    target_position = move[0]

                            if self.apply_move((target_position, target_piece), self._gamestate.Player2, self._gamestate._players, self._gamestate.Player2, self._gamestate._all_occupied_pos):  
                                self._gamestate._current_player = self._gamestate.Player1
                            move_score = self.minimax(self._gamestate, self.depth, is_ai_turn=False)
                            # pop the applied moves in the game state
                            self.pop_state(self._gamestate)
                       
                            if move_score > best_score:
                                best_score = move_score
                                best_move = move

                        self._applying_move_in_progress = False
                        # if the best possible move the AI player can make is found then make the move 
                        if best_move:
                            self._current_player = self.Player2
                            piece = best_move[1] 
                            for target_piece in self.Player2.pieces:
                                if target_piece.data["_piece_num"] == piece.data["_piece_num"]:
                                    piece = target_piece
                                    break
                            
                            piece.ai_move(best_move[0][0], best_move[0][1],self.Player2.get_occupied_positions())
                            time.sleep(1)
                            piece.set_moved()
                            self.Player2.first_moved = True 
                            self.Player2.set_player_points(piece.calc_points())
                            self.display_player_points()
                            
                            self.Player2.num_turns += 1
                            self.Player2.num_pieces -= 1
                           
                            for pos in piece.get_occupied_pos():
                                self._current_player.add_occupied_positions(pos)
                        
                            for player in self.Player1, self.Player2:
                                self.check_game_over(self._interface.get_starting_coord(),player,self.all_occupied_pos() ,player.get_occupied_positions(),player.first_moved)
                            
                            for piece in self.Player1.pieces + self.Player2.pieces:
                                self._piece_rects.append(piece.get_piece_rects())
                                piece.draw_piece_pixel()

                            
                            for player in self.Player1, self.Player2:
                                if player.game_over == True:

                                    self._player_game_over = player.playerID
                                
                            self.switching_player_logic(self.Player1, self.Player2, self._current_player, False) 
                            self.display_player(self._current_player, None)  
                        
                            self.timer(None, None)
                           
           
                    else:
                        # the first move the AI player makes is random 
                        moves = self.generate_player_moves(self.Player2)
                        index = random.randint(0,len(moves) - 1)
                        move = moves[index]
                        piece = move[1]
                        valid_move_coord = move[0]
                        time.sleep(0.5)
                        
                        piece.ai_move(valid_move_coord[0], valid_move_coord[1],self._current_player.get_occupied_positions())
                        piece.set_moved()
                        self._current_player.first_moved = True 
                        self._current_player.set_player_points(piece.calc_points())
                        self.display_player_points()
                       
                        self._current_player.num_turns += 1
                        self._current_player.num_pieces -= 1
                        for pos in piece.get_occupied_pos():
                            self._current_player.add_occupied_positions(pos)
                       
                        for player in self._players:
                            self.check_game_over(self._interface.get_starting_coord(),player,self.all_occupied_pos() ,player.get_occupied_positions(),player.first_moved)

                        for player in self._players:
                            if player.game_over == True:
                                self._player_game_over = player.playerID
                             
                        self.switching_player_logic(self.Player1, self.Player2, self._current_player, False)    
                        self.display_player(self._current_player, None) 

                    
                else:
                    time_up = False
                    # checking to see if the user has selected timed conditions 
                    if not self._current_player.isAI and self.timeron:
                        if self.time_limit != None:
                            if self.turn_start_time is None:
                                self.turn_start_time = time.time()  
                                self.time_remaining = self.time_limit 
                                self.last_print_time = self.turn_start_time 

                            elapsed_time = time.time() - self.turn_start_time
                            self.time_remaining = max(0, self.time_limit - elapsed_time)
                            if not self._display_game_over:
                                self.timer(self._current_player, int(self.time_remaining))
                            
                            if int(time.time() - self.last_print_time) >= 1:
                                self.last_print_time = time.time() 

                       
                            if self.time_remaining <= 0:
                                time_up = True
                                
                    if not time_up or self.time_limit == None:
                        mouse_pos = pygame.mouse.get_pos()
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                            self._clicked = True
                            orig_x, orig_y = pygame.mouse.get_pos()
                            for piece in self._current_player.pieces:
                                if piece.get_chosen_piece((orig_x, orig_y)):

                                    piece._dragging = True
                                    piece_x, piece_y = piece.get_position()
                                    self.distance_x = (piece_x * CELL_DIM) - orig_x
                                    self.distance_y = (piece_y * CELL_DIM) - orig_y
                                    self._piece_chosen = True
                                    self._piece = piece
                                    self._dragging = True
                                    self._dragging_piece = piece
                            
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False
                            if self._piece_chosen and self._dragging and not self._piece.data["_moved"]:
                                self._piece._dragging = False
                                if self._piece.place_onto_grid(self._interface.get_starting_coord(), self.all_occupied_pos() ,self._current_player.get_occupied_positions(),self._current_player.first_moved, self._interface._boardsize):
                                    self._current_player.set_player_points(self._piece.calc_points())
                                    self.display_player_points()
                                    
                                    
                                    for pos in self._piece.get_occupied_pos():
                                        self._current_player.add_occupied_positions(pos)

                                    self._current_player.num_turns += 1
                                    self._current_player.num_pieces -= 1
                                    self._current_player.first_moved = True
                                    

                                    self._piece.set_moved()

                                    for player in self.Player1, self.Player2:
                                        self.check_game_over(self._interface.get_starting_coord(),player,self.all_occupied_pos() ,player.get_occupied_positions(),player.first_moved)
            
                                    for player in self.Player1, self.Player2:
                                        if player.game_over == True:
                                            self._player_game_over = player.playerID

                                    self.switching_player_logic(self.Player1, self.Player2, self._current_player, False) 
                    
                                    self.display_player(self._current_player, None)
                                    self.timer(None, None)
                                    self.time_remaining = self.time_limit
                                    self.last_print_time = None
                                    self.turn_start_time = None
                                    
                            self._clicked = False
                            self._dragging = False
                            self._piece_chosen = False
                            self._dragging_piece = None
                        
                        elif event.type == pygame.MOUSEMOTION and self._dragging and self._piece_chosen and not self._piece.data["_moved"]:
                            final_x, final_y = pygame.mouse.get_pos()
                            self._piece.set_pixel_pos((final_x + self.distance_x, final_y + self.distance_y))
                            self._piece.piece_trial(self._interface.get_starting_coord(), self.all_occupied_pos(), self._interface._boardsize)

                    else:
                        
                        self.switching_player_logic(self.Player1, self.Player2, self._current_player, False)
    
                        self.display_player(self._current_player, None)
                        self.timer(None, None)
                        self.time_remaining = self.time_limit
                        self.turn_start_time = None
                        time_up = False
                        
                    for piece in self.Player1.pieces + self.Player2.pieces:
                        self._piece_rects.append(piece.get_piece_rects())
                        if piece != self._dragging_piece:
                            piece.draw_piece_pixel()
                    
                    if self._dragging_piece:
                        self._dragging_piece.draw_piece_pixel()

                
                self._interface._menubar.display_points(self._point_list)
                self._interface._menubar.display_player(self._display_player)
                self._interface._menubar.display_timer(self._timer)
                if self.Player1.game_over:
                    self._interface.display_player_turns_over(f"Player {self.Player1.playerID} has no more moves", WIDTH // 2, HEIGHT // 7 + 40,WHITE)
                if self.Player2.game_over:
                    self._interface.display_player_turns_over(f"Player {self.Player2.playerID} has no more moves", WIDTH // 2, HEIGHT // 7 + 500,WHITE)

                # if the game is over then call the game over screen 
                if self._display_game_over:
                    self.timer(None, None)
                    winner = self.calc_winner(self.Player1, self.Player2)
                    for piece in self.Player1.pieces + self.Player2.pieces:
                        self._piece_rects.append(piece.get_piece_rects())
                        piece.draw_piece_pixel()
                    self.display_player(None, self.calc_winner(self.Player1, self.Player2))
                    self._button.display_game_over_screen_buttons()

                    if self._button.play_again_button_rect.collidepoint(mouse_pos):
                        self._clicked = False
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                            self._current_player = self.Player1
                            self.reset_game(self.Player2.isAI, self.depth, self._interface._boardsize, self.timeron, self.time_limit)  
                            self.timer(None, None)
                    
                        if pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False
                    
                    if self._button.back_to_menu_button_rect.collidepoint(mouse_pos):
                        self._clicked = False
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                            self.reset_game(False,0, 14, False, None) 
                            self.timer(None, None)
                            self.reset_colours()
                            self.state = "MENU"
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False
                    
                    if self._button.finish_button_rect.collidepoint(mouse_pos):
                        self._clicked = False
                        if pygame.mouse.get_pressed()[0] == 1 and not self._clicked:
                            pygame.quit()
                        elif pygame.mouse.get_pressed()[0] == 0:
                            self._clicked = False
                
            pygame.display.flip()
        pygame.quit()

run = Game()
run.start()


