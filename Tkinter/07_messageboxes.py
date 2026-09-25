import tkinter as tk
from tkinter import messagebox
import random

root = tk.Tk()
root.title("Guess the number")

secret = random.randint(1, 100)
guesses = 0

tk.Label(root, text="I'm thinking of a number from 1 to 100.").pack(padx=20, pady=(12, 4))
guess_box = tk.Entry(root, width=8, justify="center", font=("Arial", 14))
guess_box.pack()
guess_box.focus()
hint = tk.Label(root, text="", font=("Arial", 11))
hint.pack(pady=6)


def new_game():
    global secret, guesses
    secret = random.randint(1, 100)
    guesses = 0
    hint.config(text="")
    guess_box.delete(0, tk.END)


def check():
    global guesses
    text = guess_box.get()
    # Anything typed into an Entry is a string, and may not be a number at all.
    try:
        guess = int(text)
    except ValueError:
        messagebox.showerror("Not a number", repr(text) + " is not a whole number.")
        return
    if guess < 1 or guess > 100:
        messagebox.showwarning("Out of range", "Guess between 1 and 100.")
        return
    guesses = guesses + 1
    guess_box.delete(0, tk.END)
    if guess < secret:
        hint.config(text=str(guess) + " is too low", fg="blue")
    elif guess > secret:
        hint.config(text=str(guess) + " is too high", fg="red")
    else:
        messagebox.showinfo("Correct!", "You got it in " + str(guesses) + " guesses.")
        # askyesno waits for an answer, then gives back True or False.
        if messagebox.askyesno("Play again?", "Would you like another game?"):
            new_game()
        else:
            root.destroy()


tk.Button(root, text="Guess", command=check).pack(pady=(0, 12))
guess_box.bind("<Return>", lambda event: check())

root.mainloop()
