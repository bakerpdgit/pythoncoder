import tkinter as tk

root = tk.Tk()
root.title("Greeter")

tk.Label(root, text="What is your name?").pack(pady=(10, 2))

# An Entry is a one-line text box. Its text is always a string.
name_box = tk.Entry(root, width=25)
name_box.pack()
name_box.focus()

# A StringVar is a variable that a widget watches: change it, and the
# label changes with it.
message = tk.StringVar(value="...")
tk.Label(root, textvariable=message, fg="blue", font=("Arial", 12)).pack(pady=8)


def greet():
    name = name_box.get().strip()
    if name == "":
        message.set("Please type your name first.")
    else:
        message.set("Hello, " + name + "!")
        name_box.delete(0, tk.END)


tk.Button(root, text="Greet me", command=greet).pack(pady=(0, 10))

# Pressing Enter in the box does the same as clicking the button.
name_box.bind("<Return>", lambda event: greet())

root.mainloop()
