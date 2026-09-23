import pygame

pygame.init()
WIDTH, HEIGHT = 800, 650
screen = pygame.display.set_mode((WIDTH, HEIGHT))
WHITE = (255, 255, 255)
BLACK = (0,0,0)
NAVY = (44,23,149)
LILAC = (218,169,255)
GREEN = (92,206,74)
LIGHTGREEN = (192,255,198)
YELLOW = (255,239,90)
PINK = (255,176,224)


################
# GROUP A: OOP #
################ 

class Button():

    def __init__(self):

        bubble_font_path = "Find Cartoon.ttf" 
        font_size = 42
        self._font = pygame.font.Font(bubble_font_path, font_size)
        self._font_2 = pygame.font.Font(bubble_font_path, 35)
        self._font_3 = pygame.font.Font(bubble_font_path, 20)
        self._play_button, self._instructions_button,self._customise_button  = pygame.image.load("button.png").convert_alpha(), pygame.image.load("button.png").convert_alpha(), pygame.image.load("button.png").convert_alpha()
        self._home_button = pygame.image.load("home_button.png").convert_alpha()
        self._home_button = pygame.transform.scale(self._home_button, (90,90))
        self._home_button_rect = self._home_button.get_rect(center=(WIDTH // 2 - 330, HEIGHT // 2 - 280))
        
        self.green = pygame.Rect(90, 350, 150, 22)
        self.lilac = pygame.Rect(90, 375, 150, 22)
        self.yellow = pygame.Rect(90, 400, 150, 22)
        self.pink = pygame.Rect(90, 425, 150, 22)
        self.Player1_colours = [(GREEN, self.green), (LILAC, self.lilac), (YELLOW, self.yellow), (PINK,self.pink)]

        self.green2 = pygame.Rect(290, 350, 150, 22)
        self.lilac2 = pygame.Rect(290, 375, 150, 22)
        self.yellow2 = pygame.Rect(290, 400, 150, 22)
        self.pink2 = pygame.Rect(290, 425, 150, 22)
        self.Player2_colours = [(GREEN, self.green2), (LILAC, self.lilac2), (YELLOW, self.yellow2), (PINK,self.pink2)]

        # load the buttons from a path 
        self._play_again_button, self._back_to_menu_button,self._finish_button  = pygame.image.load("button.png").convert_alpha(), pygame.image.load("button.png").convert_alpha(), pygame.image.load("button.png").convert_alpha()
        self._AI_button = pygame.image.load("dark_purple_button.png").convert_alpha()
        self._time_button = pygame.image.load("dark_purple_button.png").convert_alpha()
        self._difficulty_levels = pygame.image.load("purple_button.png").convert_alpha()
        self._colour = pygame.image.load("dark_purple_button.png").convert_alpha()
        self._board_size = pygame.image.load("dark_purple_button.png").convert_alpha()
        self._sizes = pygame.image.load("purple_button.png").convert_alpha()
        self._player = pygame.image.load("dark_purple_button.png").convert_alpha()

        self._return_back_to_main_menu = pygame.image.load("button.png").convert_alpha()
        self._return_back_to_main_menu = pygame.transform.scale(self._return_back_to_main_menu, (350, 100))
        self.return_back_to_main_menu_rect = self._return_back_to_main_menu.get_rect(center=(WIDTH // 2, HEIGHT // 2 + 200))

        # transform the buttons to suitable sizing and position them onto the screen
        self._easy = pygame.transform.scale(self._difficulty_levels, (100,65))
        self._easy_rect = self._easy.get_rect(center=(WIDTH //2, HEIGHT // 2 - 125))
        self._medium = pygame.transform.scale(self._difficulty_levels, (120,65))
        self._medium_rect = self._medium.get_rect(center=(WIDTH //2 + 115, HEIGHT // 2 - 125))
        self._hard = pygame.transform.scale(self._difficulty_levels, (100,65))
        self._hard_rect = self._hard.get_rect(center=(WIDTH //2 + 230, HEIGHT // 2 - 125))

        self._tens = pygame.transform.scale(self._difficulty_levels, (100,65))
        self._tens_rect = self._easy.get_rect(center=(WIDTH //2, HEIGHT // 2 - 185))
        self._fifteens = pygame.transform.scale(self._difficulty_levels, (120,65))
        self._fifteens_rect = self._medium.get_rect(center=(WIDTH //2 + 115, HEIGHT // 2 - 185))
        self._twentys = pygame.transform.scale(self._difficulty_levels, (100,65))
        self._twentys_rect = self._hard.get_rect(center=(WIDTH //2 + 230, HEIGHT // 2 - 185))

        self._ten = pygame.transform.scale(self._sizes, (75, 50))
        self._ten_rect = self._ten.get_rect(center=(WIDTH //2 + 170, HEIGHT // 2 + 30))
        self._twelve = pygame.transform.scale(self._sizes, (75, 50))
        self._twelve_rect = self._twelve.get_rect(center=(WIDTH //2 + 170, HEIGHT // 2 + 80))
        self._fifteen = pygame.transform.scale(self._sizes, (75, 50))
        self._fifteen_rect = self._ten.get_rect(center=(WIDTH //2 + 170, HEIGHT // 2 + 130))


        self._return_back_to_main_menu_from_instructions = pygame.image.load("button.png").convert_alpha()
        self._return_back_to_main_menu_from_instructions = pygame.transform.scale(self._return_back_to_main_menu, (450, 150))
        self.return_back_to_main_menu_from_instructions_rect = self._return_back_to_main_menu.get_rect(center=(WIDTH // 2 - 50, HEIGHT // 2 + 150))

        self._AI_button = pygame.transform.scale(self._AI_button, (100, 110))
        self.AI_button_rect = self._AI_button.get_rect(center=(WIDTH // 2 - 270, HEIGHT // 2 - 125))
        self._time_button = pygame.transform.scale(self._AI_button, (100, 110))
        self.time_button_rect = self._time_button.get_rect(center=(WIDTH // 2 - 270, HEIGHT // 2 - 185))
        self._colour = pygame.transform.scale(self._colour, (350, 110))
        self._colour_rect = self._colour.get_rect(center=(WIDTH // 2 - 150, HEIGHT // 2 - 50))
        self._board_size = pygame.transform.scale(self._board_size, (250, 110))
        self._board_size_rect = self._board_size.get_rect(center=(WIDTH // 2 + 190, HEIGHT // 2 - 50))
        
        self._play_button = pygame.transform.scale(self._play_button, (450, 150))  
        self._instructions_button = pygame.transform.scale(self._instructions_button, (450, 150))  
        self._customise_button = pygame.transform.scale(self._customise_button, (450, 150)) 
       
        self._play_button_rect = self._play_button.get_rect(center=(WIDTH // 2, HEIGHT // 2 - 125))
        self._instructions_button_rect = self._instructions_button.get_rect(center=(WIDTH // 2, HEIGHT // 2))
        self._customise_button_rect = self._customise_button.get_rect(center=(WIDTH // 2, HEIGHT // 2 + 125))

        self._play_again_button = pygame.transform.scale(self._play_again_button, (350, 150))  
        self._back_to_menu_button = pygame.transform.scale(self._back_to_menu_button, (350, 150))  
        self._finish_button = pygame.transform.scale(self._finish_button, (350, 150))  
        self.play_again_button_rect = self._play_again_button.get_rect(center=(WIDTH // 2, HEIGHT // 2 - 125))
        self.back_to_menu_button_rect = self._back_to_menu_button.get_rect(center=(WIDTH // 2, HEIGHT // 2))
        self.finish_button_rect = self._finish_button.get_rect(center=(WIDTH // 2, HEIGHT // 2 + 125))

       
    def display_menu_buttons(self):
        screen.blit(self._play_button, self._play_button_rect.topleft)
        screen.blit(self._instructions_button, self._instructions_button_rect.topleft)
        screen.blit(self._customise_button, self._customise_button_rect.topleft)
        play_text_surface, play_text_rect = self.render_text_centered(
            "Play", self._font, WHITE, self._play_button_rect)
        instructions_text_surface, instructions_text_rect = self.render_text_centered(
            "Instructions", self._font, WHITE, self._instructions_button_rect)
        customise_text_surface, customise_text_rect = self.render_text_centered(
            "Customise", self._font, WHITE, self._customise_button_rect)
        screen.blit(play_text_surface, play_text_rect)
        screen.blit(instructions_text_surface, instructions_text_rect)
        screen.blit(customise_text_surface, customise_text_rect)
    
    def render_text_centered(self, text, font, color, rect):
        text_surface = font.render(text, True, color)
        text_rect = text_surface.get_rect(center=rect.center)
        return text_surface, text_rect.topleft 

    def display_game_over_screen_buttons(self):
        screen.blit(self._play_again_button, self.play_again_button_rect.topleft)
        screen.blit(self._back_to_menu_button, self.back_to_menu_button_rect.topleft)
        screen.blit(self._finish_button, self.finish_button_rect.topleft)
        play_again_text_surface, play_again_text_rect = self.render_text_centered(
            "Play again", self._font_2, WHITE, self.play_again_button_rect)
        back_to_menu_text_surface, back_to_menu_text_rect = self.render_text_centered(
            "Menu", self._font_2, WHITE, self.back_to_menu_button_rect)
        finish_text_surface, finish_text_rect = self.render_text_centered(
            "Finish", self._font_2, WHITE, self.finish_button_rect)
        screen.blit(play_again_text_surface, play_again_text_rect)
        screen.blit(back_to_menu_text_surface, back_to_menu_text_rect)
        screen.blit(finish_text_surface, finish_text_rect)
    
    def display_customise_buttons(self):
        screen.blit(self._AI_button, self.AI_button_rect.topleft)
        screen.blit(self._return_back_to_main_menu, 
                    self.return_back_to_main_menu_rect.topleft)
        AI_text_surface, AI_text_rect = self.render_text_centered(
            "AI OFF", self._font_3, WHITE, self.AI_button_rect)
        
        return_back_text_surface, return_back_text_rect = self.render_text_centered(
            "Return", self._font_2, WHITE, self.return_back_to_main_menu_rect)
        screen.blit(AI_text_surface,AI_text_rect)
        screen.blit(return_back_text_surface, return_back_text_rect)
        
    
    def display_home_button(self):
        screen.blit(self._home_button, self._home_button_rect)
    
    def display_time_button(self):
        screen.blit(self._time_button, self.time_button_rect)
        time_text_surface, time_text_rect = self.render_text_centered("Timer", self._font_3, WHITE, self.time_button_rect)
        screen.blit(time_text_surface, time_text_rect)

    def display_timer_colourchange(self):
        screen.blit(self._time_button, self.time_button_rect)
        time_text_surface, time_text_rect = self.render_text_centered("Timer", self._font_3, LIGHTGREEN, self.time_button_rect)
        screen.blit(time_text_surface, time_text_rect)

        screen.blit(self._tens, self._tens_rect.topleft)
        screen.blit(self._fifteens, self._fifteens_rect.topleft)
        screen.blit(self._twentys, self._twentys_rect.topleft)

        tens_text_surface, tens_text_rect = self.render_text_centered("10 s", self._font_3, WHITE, self._tens_rect)
        fifteens_text_surface, fifteens_text_rect = self.render_text_centered("15 s", self._font_3, WHITE, self._fifteens_rect)
        twentys_text_surface, twentys_text_rect = self.render_text_centered("20 s", self._font_3, WHITE, self._twentys_rect)
        screen.blit(tens_text_surface, tens_text_rect)
        screen.blit(fifteens_text_surface, fifteens_text_rect)
        screen.blit(twentys_text_surface, twentys_text_rect)
    
    def tens_colourchange(self):
        screen.blit(self._time_button, self.time_button_rect)
        time_text_surface, time_text_rect = self.render_text_centered("Timer", self._font_3, LIGHTGREEN, self.time_button_rect)
        screen.blit(time_text_surface, time_text_rect)

        screen.blit(self._tens, self._tens_rect.topleft)
        screen.blit(self._fifteens, self._fifteens_rect.topleft)
        screen.blit(self._twentys, self._twentys_rect.topleft)

        tens_text_surface, tens_text_rect = self.render_text_centered("10 s", self._font_3, LIGHTGREEN, self._tens_rect)
        fifteens_text_surface, fifteens_text_rect = self.render_text_centered("15 s", self._font_3, WHITE, self._fifteens_rect)
        twentys_text_surface, twentys_text_rect = self.render_text_centered("20 s", self._font_3, WHITE, self._twentys_rect)
        screen.blit(tens_text_surface, tens_text_rect)
        screen.blit(fifteens_text_surface, fifteens_text_rect)
        screen.blit(twentys_text_surface, twentys_text_rect)

    def fifteens_colourchange(self):
        screen.blit(self._time_button, self.time_button_rect)
        time_text_surface, time_text_rect = self.render_text_centered("Timer", self._font_3, LIGHTGREEN, self.time_button_rect)
        screen.blit(time_text_surface, time_text_rect)

        screen.blit(self._tens, self._tens_rect.topleft)
        screen.blit(self._fifteens, self._fifteens_rect.topleft)
        screen.blit(self._twentys, self._twentys_rect.topleft)

        tens_text_surface, tens_text_rect = self.render_text_centered("10 s", self._font_3, WHITE, self._tens_rect)
        fifteens_text_surface, fifteens_text_rect = self.render_text_centered("15 s", self._font_3, LIGHTGREEN, self._fifteens_rect)
        twentys_text_surface, twentys_text_rect = self.render_text_centered("20 s", self._font_3, WHITE, self._twentys_rect)
        screen.blit(tens_text_surface, tens_text_rect)
        screen.blit(fifteens_text_surface, fifteens_text_rect)
        screen.blit(twentys_text_surface, twentys_text_rect)

    def twentys_colourchange(self):
        screen.blit(self._time_button, self.time_button_rect)
        time_text_surface, time_text_rect = self.render_text_centered("Timer", self._font_3, LIGHTGREEN, self.time_button_rect)
        screen.blit(time_text_surface, time_text_rect)

        screen.blit(self._tens, self._tens_rect.topleft)
        screen.blit(self._fifteens, self._fifteens_rect.topleft)
        screen.blit(self._twentys, self._twentys_rect.topleft)

        tens_text_surface, tens_text_rect = self.render_text_centered("10 s", self._font_3, WHITE, self._tens_rect)
        fifteens_text_surface, fifteens_text_rect = self.render_text_centered("15 s", self._font_3, WHITE, self._fifteens_rect)
        twentys_text_surface, twentys_text_rect = self.render_text_centered("20 s", self._font_3, LIGHTGREEN, self._twentys_rect)
        screen.blit(tens_text_surface, tens_text_rect)
        screen.blit(fifteens_text_surface, fifteens_text_rect)
        screen.blit(twentys_text_surface, twentys_text_rect)



    
    def display_customise_buttons_AI_colourchange(self):
        screen.blit(self._AI_button, self.AI_button_rect.topleft)
        screen.blit(self._return_back_to_main_menu, self.return_back_to_main_menu_rect.topleft)
        AI_text_surface, AI_text_rect = self.render_text_centered("AI ON", self._font_3, LIGHTGREEN, self.AI_button_rect)
        return_back_text_surface, return_back_text_rect = self.render_text_centered("Return", self._font_2, WHITE, self.return_back_to_main_menu_rect)
        screen.blit(AI_text_surface,AI_text_rect)
        screen.blit(return_back_text_surface, return_back_text_rect)
        screen.blit(self._easy, self._easy_rect.topleft)
        screen.blit(self._medium, self._medium_rect.topleft)
        screen.blit(self._hard, self._hard_rect.topleft)

        easy_text_surface, easy_text_rect = self.render_text_centered("easy", self._font_3, WHITE, self._easy_rect)
        medium_text_surface, medium_text_rect = self.render_text_centered("medium", self._font_3, WHITE, self._medium_rect)
        hard_text_surface, hard_text_rect = self.render_text_centered("hard", self._font_3, WHITE, self._hard_rect)
        screen.blit(easy_text_surface, easy_text_rect)
        screen.blit(medium_text_surface, medium_text_rect)
        screen.blit(hard_text_surface, hard_text_rect)
        
    def display_customise_buttons_easy_colourchange(self):
        screen.blit(self._AI_button, self.AI_button_rect.topleft)
        screen.blit(self._return_back_to_main_menu, self.return_back_to_main_menu_rect.topleft)
        AI_text_surface, AI_text_rect = self.render_text_centered("AI ON", self._font_3, LIGHTGREEN, self.AI_button_rect)
        return_back_text_surface, return_back_text_rect = self.render_text_centered("Return", self._font_2, WHITE, self.return_back_to_main_menu_rect)
        screen.blit(AI_text_surface,AI_text_rect)
        screen.blit(return_back_text_surface, return_back_text_rect)
        screen.blit(self._easy, self._easy_rect.topleft)
        screen.blit(self._medium, self._medium_rect.topleft)
        screen.blit(self._hard, self._hard_rect.topleft)

        easy_text_surface, easy_text_rect = self.render_text_centered("easy", self._font_3, LIGHTGREEN, self._easy_rect)
        medium_text_surface, medium_text_rect = self.render_text_centered("medium", self._font_3, WHITE, self._medium_rect)
        hard_text_surface, hard_text_rect = self.render_text_centered("hard", self._font_3, WHITE, self._hard_rect)
        screen.blit(easy_text_surface, easy_text_rect)
        screen.blit(medium_text_surface, medium_text_rect)
        screen.blit(hard_text_surface, hard_text_rect)
    
    def display_customise_buttons_medium_colourchange(self):
        screen.blit(self._AI_button, self.AI_button_rect.topleft)
        screen.blit(self._return_back_to_main_menu, self.return_back_to_main_menu_rect.topleft)
        AI_text_surface, AI_text_rect = self.render_text_centered("AI ON", self._font_3, LIGHTGREEN, self.AI_button_rect)
        return_back_text_surface, return_back_text_rect = self.render_text_centered("Return", self._font_2, WHITE, self.return_back_to_main_menu_rect)
        screen.blit(AI_text_surface,AI_text_rect)
        screen.blit(return_back_text_surface, return_back_text_rect)
        screen.blit(self._easy, self._easy_rect.topleft)
        screen.blit(self._medium, self._medium_rect.topleft)
        screen.blit(self._hard, self._hard_rect.topleft)

        easy_text_surface, easy_text_rect = self.render_text_centered("easy", self._font_3, WHITE, self._easy_rect)
        medium_text_surface, medium_text_rect = self.render_text_centered("medium", self._font_3, LIGHTGREEN, self._medium_rect)
        hard_text_surface, hard_text_rect = self.render_text_centered("hard", self._font_3, WHITE, self._hard_rect)
        screen.blit(easy_text_surface, easy_text_rect)
        screen.blit(medium_text_surface, medium_text_rect)
        screen.blit(hard_text_surface, hard_text_rect)
    
    def display_customise_buttons_hard_colourchange(self):
        screen.blit(self._AI_button, self.AI_button_rect.topleft)
        screen.blit(self._return_back_to_main_menu, self.return_back_to_main_menu_rect.topleft)
        AI_text_surface, AI_text_rect = self.render_text_centered("AI ON", self._font_3, LIGHTGREEN, self.AI_button_rect)
        return_back_text_surface, return_back_text_rect = self.render_text_centered("Return", self._font_2, WHITE, self.return_back_to_main_menu_rect)
        screen.blit(AI_text_surface,AI_text_rect)
        screen.blit(return_back_text_surface, return_back_text_rect)
        screen.blit(self._easy, self._easy_rect.topleft)
        screen.blit(self._medium, self._medium_rect.topleft)
        screen.blit(self._hard, self._hard_rect.topleft)

        easy_text_surface, easy_text_rect = self.render_text_centered("easy", self._font_3, WHITE, self._easy_rect)
        medium_text_surface, medium_text_rect = self.render_text_centered("medium", self._font_3, WHITE, self._medium_rect)
        hard_text_surface, hard_text_rect = self.render_text_centered("hard", self._font_3, LIGHTGREEN, self._hard_rect)
        screen.blit(easy_text_surface, easy_text_rect)
        screen.blit(medium_text_surface, medium_text_rect)
        screen.blit(hard_text_surface, hard_text_rect)
   
    def display_instructions_button(self):
        screen.blit(self._return_back_to_main_menu_from_instructions, self.return_back_to_main_menu_from_instructions_rect.topleft)
    
    def display_colour_button(self):
        screen.blit(self._colour, self._colour_rect.topleft)
        colour_text_surface, colour_text_rect = self.render_text_centered("Change player colour", self._font_3, WHITE, self._colour_rect)
        screen.blit(colour_text_surface, colour_text_rect)
    
    def display_colours(self):
        for item in self.Player1_colours:
            pygame.draw.rect(screen, item[0], item[1])
        for item in self.Player2_colours:
            pygame.draw.rect(screen, item[0], item[1])
  
    def display_board_size(self):
        screen.blit(self._board_size, self._board_size_rect.topleft)
        board_size_text, board_size_rect = self.render_text_centered("Board size", self._font_3, WHITE, self._board_size_rect)
        screen.blit(board_size_text, board_size_rect)
    
    def display_board_sizes_colourchange(self):
        screen.blit(self._board_size, self._board_size_rect.topleft)
        board_size_text, board_size_rect = self.render_text_centered("Board size", self._font_3, LIGHTGREEN, self._board_size_rect)
        screen.blit(board_size_text, board_size_rect)
        screen.blit(self._ten, self._ten_rect.topleft)
        screen.blit(self._twelve, self._twelve_rect.topleft)
        ten_text_surface, ten_text_rect = self.render_text_centered("10x10", self._font_3, WHITE, self._ten_rect)
        twelve_text_surface, twelve_text_rect = self.render_text_centered("12x12", self._font_3, WHITE, self._twelve_rect)
        screen.blit(ten_text_surface, ten_text_rect)
        screen.blit(twelve_text_surface, twelve_text_rect)


    
    def display_board_sizes(self):
        screen.blit(self._ten, self._ten_rect.topleft)
        screen.blit(self._twelve, self._twelve_rect.topleft)
        screen.blit(self._fifteen, self._fifteen_rect.topleft)
        ten_text_surface, ten_text_rect = self.render_text_centered("10x10", self._font_3, WHITE, self._ten_rect)
        twelve_text_surface, twelve_text_rect = self.render_text_centered("12x12", self._font_3, WHITE, self._twelve_rect)
        fifteen_text_surface, fifteen_text_rect = self.render_text_centered("15x15", self._font_3, WHITE, self._fifteen_rect)
        screen.blit(ten_text_surface, ten_text_rect)
        screen.blit(twelve_text_surface, twelve_text_rect)
        screen.blit(fifteen_text_surface, fifteen_text_rect)

      
    def ten_colourchange(self):
        screen.blit(self._ten, self._ten_rect.topleft)
        screen.blit(self._twelve, self._twelve_rect.topleft)
        ten_text_surface, ten_text_rect = self.render_text_centered("10x10", self._font_3, LIGHTGREEN, self._ten_rect)
        twelve_text_surface, twelve_text_rect = self.render_text_centered("12x12", self._font_3, WHITE, self._twelve_rect)
        screen.blit(ten_text_surface, ten_text_rect)
        screen.blit(twelve_text_surface, twelve_text_rect)


    def twelve_colourchange(self):
        screen.blit(self._ten, self._ten_rect.topleft)
        screen.blit(self._twelve, self._twelve_rect.topleft)
        ten_text_surface, ten_text_rect = self.render_text_centered("10x10", self._font_3, WHITE, self._ten_rect)
        twelve_text_surface, twelve_text_rect = self.render_text_centered("12x12", self._font_3, LIGHTGREEN, self._twelve_rect)
        screen.blit(ten_text_surface, ten_text_rect)
        screen.blit(twelve_text_surface, twelve_text_rect)
    
    def fifteen_colourchange(self):
        screen.blit(self._ten, self._ten_rect.topleft)
        screen.blit(self._twelve, self._twelve_rect.topleft)
        screen.blit(self._fifteen, self._fifteen_rect.topleft)
        ten_text_surface, ten_text_rect = self.render_text_centered("10x10", self._font_3, WHITE, self._ten_rect)
        twelve_text_surface, twelve_text_rect = self.render_text_centered("12x12", self._font_3, WHITE, self._twelve_rect)
        fifteen_text_surface, fifteen_text_rect = self.render_text_centered("15x15", self._font_3, LIGHTGREEN, self._fifteen_rect)
        screen.blit(ten_text_surface, ten_text_rect)
        screen.blit(twelve_text_surface, twelve_text_rect)
        screen.blit(fifteen_text_surface, fifteen_text_rect)
    
   
