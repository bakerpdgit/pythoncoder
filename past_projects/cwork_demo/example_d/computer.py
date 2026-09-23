from player import Player

class Computer(Player):
    def __init__(self, name):
        super().__init__(name)
        self.__difficulty = None

    def getDifficulty(self):
        return self.__difficulty
    
    def setDifficulty(self, difficulty):
        if difficulty <= 4 and difficulty >= 1:
            self.__difficulty = difficulty
        else:
            self.__difficulty = 1

    def getName(self):
        return self._Name
    
    def setName(self, name):
        self._Name = name


