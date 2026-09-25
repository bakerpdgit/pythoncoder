import tkinter as tk

# 1. Make the window. Every tkinter program has exactly one Tk().
root = tk.Tk()
root.title("My first window")
root.geometry("320x160")

# 2. Put something in it. A Label shows text; pack() places it.
greeting = tk.Label(root, text="Hello from tkinter!", font=("Arial", 16))
greeting.pack(pady=20)

info = tk.Label(root, text="Close this window to end the program.", fg="grey")
info.pack()

# 3. Hand over to tkinter. mainloop() waits for the user until the window closes.
root.mainloop()

print("The window was closed, so mainloop() has finished.")
