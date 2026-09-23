# DEMO CHANGE: this abstract UI class was moved here unchanged from othelloGUI.py,
# so the terminal version can run without importing tkinter.
from abc import ABC, abstractmethod

class UI(ABC):
    # class A skill - inheritance, polymorphism
    @abstractmethod
    def run(self):
        '''
            Method: run
            Parameters: None
            Returns: None
            Does: Runs the game
        '''
        raise NotImplementedError
