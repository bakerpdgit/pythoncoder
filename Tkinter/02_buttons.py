import tkinter as tk

root = tk.Tk()
root.title("Click counter")

clicks = 0


def add_one():
    global clicks
    clicks = clicks + 1
    counter.config(text="Clicks: " + str(clicks))


def reset():
    global clicks
    clicks = 0
    counter.config(text="Clicks: 0")


def say(word):
    print("You chose", word)


counter = tk.Label(root, text="Clicks: 0", font=("Arial", 18))
counter.pack(padx=40, pady=10)

# command= takes the NAME of a function: add_one, not add_one()
tk.Button(root, text="Click me", command=add_one).pack(pady=2)
tk.Button(root, text="Reset", command=reset).pack(pady=2)

# To pass a value to the function, wrap the call in a lambda.
tk.Button(root, text="Red", command=lambda: say("red")).pack(side="left", padx=10, pady=10)
tk.Button(root, text="Blue", command=lambda: say("blue")).pack(side="right", padx=10, pady=10)

root.mainloop()
