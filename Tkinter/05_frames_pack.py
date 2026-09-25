import tkinter as tk

root = tk.Tk()
root.title("Frames")
root.geometry("420x260")

# A Frame is an empty box for grouping widgets. Each frame arranges its own
# children, so different parts of a window can use different layouts.

# A toolbar along the top: a frame packed to fill the width.
toolbar = tk.Frame(root, bg="#2b579a", padx=5, pady=5)
toolbar.pack(side="top", fill="x")
for name in ["New", "Open", "Save"]:
    tk.Button(toolbar, text=name, width=6).pack(side="left", padx=2)

# A status bar along the bottom.
status = tk.Label(root, text="Ready", anchor="w", bg="#dddddd", padx=5)
status.pack(side="bottom", fill="x")

# A sidebar down the left, filling the height.
sidebar = tk.Frame(root, bg="#e8e8e8", width=110)
sidebar.pack(side="left", fill="y")
for topic in ["Home", "Scores", "Settings"]:
    tk.Label(sidebar, text=topic, bg="#e8e8e8").pack(anchor="w", padx=10, pady=4)

# The main area takes everything that is left.
main = tk.Frame(root, bg="white")
main.pack(side="left", fill="both", expand=True)
tk.Label(main, text="Main area", bg="white", font=("Arial", 14)).pack(expand=True)

# Inside a frame you may use grid even though root uses pack.
form = tk.Frame(main, bg="white")
form.pack(pady=10)
tk.Label(form, text="Search:", bg="white").grid(row=0, column=0)
tk.Entry(form, width=15).grid(row=0, column=1, padx=4)

root.mainloop()
