# Task: reaction times. Replace each ____ with one NumPy call.
import numpy as np

names = ["Ava", "Ben", "Cal", "Dee", "Eli", "Fay", "Gus", "Hal", "Ivy", "Jo"]
# Each person's reaction time to a light coming on, in milliseconds.
times = np.array([284, 251, 319, 236, 402, 268, 247, 295, 229, 273])

average = ____
middle = ____
spread = ____

# argmin / argmax give the *position*, which picks the name out of names.
fastest = names[____]
slowest = names[____]

print(f"mean     {average:.1f} ms")
print(f"median   {middle:.1f} ms")
print(f"std dev  {spread:.1f} ms")
print("fastest ", fastest)
print("slowest ", slowest)
