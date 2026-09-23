import pygame
pygame.init()
WIDTH, HEIGHT = 800, 650
screen = pygame.display.set_mode((WIDTH, HEIGHT))
WHITE = (255, 255, 255)
BLACK = (0,0,0)
LILAC = (220,208,255)
NAVY = (44,23,149)
RED = (253,60,99)
BLUE = (78,158,238)
CELL_DIM = 25
BOARD_SIZE = 15
GRIDWIDTH, GRIDHEIGHT = CELL_DIM * BOARD_SIZE, CELL_DIM * BOARD_SIZE
STARTX = (WIDTH - GRIDWIDTH) // 2
STARTY = ((HEIGHT - GRIDHEIGHT) // 2)+50
LILAC = (220,208,255)
LILACDIM = (187,162,255)
LILACDRAGGING = (236,229,255)
GREEN = (166,255,193)
GREENDIM = (115,255,157)
GREENDRAGGING = (206,255,221)
YELLOW = (255,252,144)
YELLOWDIM = (255,250,78)
YELLOWDRAGGING = (255,254,192)
PINK = (255,176,224)
PINKDIM = (255,132,207)
PINKDRAGGING = (255,215,240)

 
################
# GROUP A: OOP #
################ 

class Piece():
    def __init__(self, piece_num, cells, player_ID, colour, dimcolour, dragging_col, dragging_col_dim, position, moved):
        #######################
        # GROUP B: Dictionary #
        #######################
        self.data = {
        "_orig_pixel_pos": (position[0] * CELL_DIM, position[1] * CELL_DIM),
        "_orig_pos": position,
        "_piece_num": piece_num,
        "_cells": cells,
        "_playerID": player_ID,
        "_colour": colour,
        "_dimcolour": dimcolour,
        "pos": position,
        "pixel_pos": (position[0] * CELL_DIM, position[1] * CELL_DIM),
        "_coordx": 0,
        "_coordy": 0,
        "_occupied_positions": [],
        "_is_first_move": False,
        "_moved": moved,
        "dragging_col": dragging_col,
        "dragging_col_dim": dragging_col_dim,
        "_piece_moves_left": 0,
        }
        
    def set_moved(self):
        self.data["_moved"] = True

    def set_piece_colour(self,colour, dim, dragging):
        self.data["_colour"] = colour
        self.data["_dimcolour"] = dim
        self.data["dragging_col"] = dragging
        self.data["dragging_col_dim"] = dragging

    def draw_piece_pixel(self):
        pixel_rects = []
        for cell in self.data["_cells"]:
            x = self.data["pixel_pos"][0] + cell[0] * CELL_DIM
            y = self.data["pixel_pos"][1] + cell[1] * CELL_DIM
            pixel_rect = pygame.Rect(x, y, CELL_DIM, CELL_DIM)
            pixel_rects.append(pixel_rect)
            pygame.draw.rect(screen, self.data["_colour"], pixel_rect)
            pygame.draw.rect(screen, self.data["_dimcolour"], pixel_rect, 5)
            pygame.draw.rect(screen, BLACK, pixel_rect, 1)
        return pixel_rects

    def get_piece_rects(self):
        rects = []
        for cell in self.data["_cells"]:
            x = self.data["pixel_pos"][0] + cell[0] * CELL_DIM
            y = self.data["pixel_pos"][1] + cell[1] * CELL_DIM
            pixel_rect = pygame.Rect(x, y, CELL_DIM, CELL_DIM)
            rects.append(pixel_rect)
        return rects

    def get_chosen_piece(self, mouse_pos):
        rects = self.get_piece_rects()
        for rect in rects:
            if rect.collidepoint(mouse_pos):
                return True
        return False

    def get_position(self):
        return self.data["pos"]

    def get_pixel_pos(self):
        return self.data["pixel_pos"]

    def update_position(self,new_pos):
        self.data["pos"] = new_pos
        self.data["pixel_pos"] = (new_pos[0] * CELL_DIM, new_pos[1] * CELL_DIM)

    def set_pixel_pos(self,pixel_pos):
        self.data["pixel_pos"] = pixel_pos
        self.data["pos"] = (pixel_pos[0] // CELL_DIM, pixel_pos[1] // CELL_DIM)

    def occupied(self,positions, new_x, new_y):
        for cell in self.data["_cells"]:
            x = (new_x // CELL_DIM) + cell[0]
            y = (new_y // CELL_DIM) + cell[1]
            if (x, y) in positions:
                return True
        return False

    def update_occupied_pos(self,new_pos):
        self.data["_occupied_positions"].extend(new_pos)

    def get_occupied_pos(self):
        return self.data["_occupied_positions"]

    def calc_points(self):
        return len(self.data["_cells"])

    # place the piece in the cell which is closest to the drop off point 
    def piece_trial(self,starting_coord, all_occupied_pos, board_size ):
        grid_x = round((self.data["pixel_pos"][0] - starting_coord[0]) / CELL_DIM) * CELL_DIM + starting_coord[0]
        grid_y = round((self.data["pixel_pos"][1] - starting_coord[1]) / CELL_DIM) * CELL_DIM + starting_coord[1]
        piece_within_bounds = True

        for cell in self.data["_cells"]:
            cell_x = grid_x + cell[0] * CELL_DIM
            cell_y = grid_y + cell[1] * CELL_DIM
            max_x = starting_coord[0] + board_size * CELL_DIM
            min_x = starting_coord[0]
            max_y = starting_coord[1] + board_size * CELL_DIM
            min_y = starting_coord[1]

            if not (min_x <= cell_x < max_x and min_y <= cell_y < max_y):
                piece_within_bounds = False

        if piece_within_bounds and not self.occupied(all_occupied_pos, grid_x, grid_y):
            for cell in self.data["_cells"]:
                x = grid_x + cell[0] * CELL_DIM
                y = grid_y + cell[1] * CELL_DIM
                pixel_rect = pygame.Rect(x, y, CELL_DIM, CELL_DIM)
                pygame.draw.rect(screen, self.data["dragging_col"], pixel_rect)
                pygame.draw.rect(screen, self.data["dragging_col_dim"], pixel_rect, 5)
                pygame.draw.rect(screen, BLACK, pixel_rect, 1)

    # place the piece onto the grid 
    def place_onto_grid(self,starting_coord, all_occupied_pos, piece_occupied_pos, first_move, board_size):
        grid_x = round((self.data["pixel_pos"][0] - starting_coord[0]) / CELL_DIM) * CELL_DIM + starting_coord[0]
        grid_y = round((self.data["pixel_pos"][1] - starting_coord[1]) / CELL_DIM) * CELL_DIM + starting_coord[1]
        piece_within_bounds = True
        new_occupied_positions = []

        for cell in self.data["_cells"]:
            cell_x = grid_x + cell[0] * CELL_DIM
            cell_y = grid_y + cell[1] * CELL_DIM
            max_x = starting_coord[0] + board_size * CELL_DIM
            min_x = starting_coord[0]
            max_y = starting_coord[1] + board_size * CELL_DIM
            min_y = starting_coord[1]
            if not (min_x <= cell_x < max_x and min_y <= cell_y < max_y):
                piece_within_bounds = False
            else:
                new_occupied_positions.append((cell_x // CELL_DIM, cell_y // CELL_DIM))

        if piece_within_bounds and not self.occupied(all_occupied_pos, grid_x, grid_y):
            if first_move and not self.valid_corner((grid_x, grid_y), piece_occupied_pos):
                self.set_pixel_pos(self.data["_orig_pixel_pos"])
                return False

            self.set_pixel_pos((grid_x, grid_y))
            piece_occupied_pos.extend(new_occupied_positions)
            return True
        else:
            self.set_pixel_pos(self.data["_orig_pixel_pos"])
            return False


    def ai_move(self,row, col, piece_occupied_pos):
        new_occupied_positions = []
        self.set_pixel_pos((row, col))
        for cell in self.data["_cells"]:
            cell_x = row + cell[0] * CELL_DIM
            cell_y = col + cell[1] * CELL_DIM
            new_occupied_positions.append((cell_x // CELL_DIM, cell_y // CELL_DIM))
        piece_occupied_pos.extend(new_occupied_positions)

    def update_position_with_occupied(self,pos):
        self.set_pixel_pos((pos[0], pos[1]))
        new_occupied_positions = []
        for cell in self.data["_cells"]:
            cell_x = pos[0] + cell[0] * CELL_DIM
            cell_y = pos[1] + cell[1] * CELL_DIM
            new_occupied_positions.append((cell_x // CELL_DIM, cell_y // CELL_DIM))
        self.data["_occupied_positions"].extend(new_occupied_positions)

    # check to see whether a piece has any moves left 
    def moves_left(self,max_x, min_x, max_y, min_y, row, col, all_occupied_pos, piece_occupied_pos, first_move):
        piece_within_bounds = True
        for cell in self.data["_cells"]:
            cell_x = row + cell[0] * CELL_DIM
            cell_y = col + cell[1] * CELL_DIM

            if not (min_x <= cell_x < max_x and min_y <= cell_y < max_y):
                piece_within_bounds = False

        if piece_within_bounds and not self.occupied(all_occupied_pos, row, col):
            if self.valid_corner((row, col), piece_occupied_pos) or not first_move:
                return (row, col)
        return False

    # return all the moves that piece can make 
    def all_moves_left(self, max_x, min_x, max_y, min_y, row, col, all_occupied_pos, piece_occupied_pos, first_move):
        piece_within_bounds = True
        all_moves_left = []
        for cell in self.data["_cells"]:
            cell_x = row + cell[0] * CELL_DIM
            cell_y = col + cell[1] * CELL_DIM
            if not (min_x <= cell_x < max_x and min_y <= cell_y < max_y):
                piece_within_bounds = False
        if piece_within_bounds and not self.occupied(all_occupied_pos, row, col):
            if self.valid_corner((row, col), piece_occupied_pos) or not first_move:
                all_moves_left.append((row, col))
        return all_moves_left

    # checking to see if the piece is touching the corner of another piece played by the same player 
    def valid_corner(self,snapped_pos, occupied_positions):
        diagonals = [(-1, 1), (-1, -1), (1, 1), (1, -1)]
        sides = [(0, 1), (0, -1), (1, 0), (-1, 0)]
        valid_corner_touch = False

        for cell in self.data["_cells"]:
            cell_x = snapped_pos[0] + cell[0] * CELL_DIM
            cell_y = snapped_pos[1] + cell[1] * CELL_DIM
            grid_cell_x = cell_x // CELL_DIM
            grid_cell_y = cell_y // CELL_DIM

            for val in diagonals:
                diagonal_x = grid_cell_x + val[0]
                diagonal_y = grid_cell_y + val[1]
                if (diagonal_x, diagonal_y) in occupied_positions:
                    valid_corner_touch = True

            for val in sides:
                side_x = grid_cell_x + val[0]
                side_y = grid_cell_y + val[1]
                if (side_x, side_y) in occupied_positions:
                    return False

        return valid_corner_touch