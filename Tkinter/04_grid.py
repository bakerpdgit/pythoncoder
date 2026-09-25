import tkinter as tk

root = tk.Tk()
root.title("Sign up")

# grid() places widgets in rows and columns, like cells in a spreadsheet.
tk.Label(root, text="Create an account", font=("Arial", 14, "bold")).grid(
    row=0, column=0, columnspan=2, pady=(10, 6))

tk.Label(root, text="Username:").grid(row=1, column=0, sticky="e", padx=5, pady=3)
username = tk.Entry(root)
username.grid(row=1, column=1, sticky="ew", padx=5)

tk.Label(root, text="Password:").grid(row=2, column=0, sticky="e", padx=5, pady=3)
password = tk.Entry(root, show="*")
password.grid(row=2, column=1, sticky="ew", padx=5)

tk.Label(root, text="Confirm:").grid(row=3, column=0, sticky="e", padx=5, pady=3)
confirm = tk.Entry(root, show="*")
confirm.grid(row=3, column=1, sticky="ew", padx=5)

status = tk.Label(root, text="", fg="red")
status.grid(row=5, column=0, columnspan=2, pady=4)


def sign_up():
    if len(username.get()) < 3:
        status.config(text="Usernames need at least 3 characters.", fg="red")
    elif len(password.get()) < 8:
        status.config(text="Passwords need at least 8 characters.", fg="red")
    elif password.get() != confirm.get():
        status.config(text="The passwords do not match.", fg="red")
    else:
        status.config(text="Welcome, " + username.get() + "!", fg="green")


tk.Button(root, text="Sign up", width=12, command=sign_up).grid(row=4, column=1, sticky="w", padx=5, pady=6)

# Column 1 takes any spare width, so the boxes stretch if the window grows.
root.columnconfigure(1, weight=1)

root.mainloop()
