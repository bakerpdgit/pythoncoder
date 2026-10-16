"""pyp5js's name for Coder's p5: `from pyp5js import *` works as `from p5 import *`.

A pyp5js sketch defines setup() and draw() and never calls run(); Coder
starts it once the program's last line has run.
"""

from p5 import *  # noqa: F401,F403
from p5 import run  # noqa: F401
