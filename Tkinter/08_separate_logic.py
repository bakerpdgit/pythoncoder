import tkinter as tk
from calculator_logic import press

# This file is only the interface. Every decision about sums is made by
# calculator_logic.py, which knows nothing about windows or buttons.

root = tk.Tk()
root.title("Calculator")
root.resizable(False, False)

display = tk.StringVar(value="0")
tk.Label(root, textvariable=display, anchor="e", font=("Consolas", 20), bg="white",
         relief="sunken", bd=2, padx=8, width=12).grid(row=0, column=0, columnspan=4, padx=6, pady=6, sticky="ew")


def on_key(key):
    display.set(press(display.get(), key))


KEYS = [
    ["7", "8", "9", "/"],
    ["4", "5", "6", "*"],
    ["1", "2", "3", "-"],
    ["C", "0", "=", "+"],
]
for r, row in enumerate(KEYS, start=1):
    for c, key in enumerate(row):
        colour = "#f0b050" if key in "+-*/=" else "#f0f0f0"
        # key=key fixes this button's key now; a plain lambda would see only
        # the last key in the loop by the time it was clicked.
        tk.Button(root, text=key, width=4, font=("Arial", 14), bg=colour,
                  command=lambda key=key: on_key(key)).grid(row=r, column=c, padx=2, pady=2)

# The keyboard works too.
root.bind("<Key>", lambda event: on_key(event.char) if event.char in "0123456789+-*/" else None)
root.bind("<Return>", lambda event: on_key("="))
root.bind("<Escape>", lambda event: on_key("C"))

root.mainloop()
