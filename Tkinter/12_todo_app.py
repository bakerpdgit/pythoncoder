import tkinter as tk
from tkinter import ttk, messagebox

FILENAME = "todo.txt"


# ── Saving and loading: plain functions, no tkinter ────────────────────────

def load_tasks():
    tasks = []
    try:
        with open(FILENAME) as f:
            for line in f:
                line = line.rstrip("\n")
                if "," in line:
                    priority, text = line.split(",", 1)
                    tasks.append((priority, text))
    except FileNotFoundError:
        pass
    return tasks


def save_tasks(tasks):
    with open(FILENAME, "w") as f:
        for priority, text in tasks:
            f.write(priority + "," + text + "\n")


# ── The window ─────────────────────────────────────────────────────────────

root = tk.Tk()
root.title("To-do list")

style = ttk.Style()
style.configure("Treeview", rowheight=22)
style.configure("Add.TButton", font=("Segoe UI", 9, "bold"))

top = ttk.Frame(root, padding=8)
top.pack(fill="x")
ttk.Label(top, text="Task:").pack(side="left")
task_box = ttk.Entry(top, width=28)
task_box.pack(side="left", padx=4)
priority = ttk.Combobox(top, values=["High", "Medium", "Low"], width=8, state="readonly")
priority.current(1)
priority.pack(side="left", padx=4)

table = ttk.Treeview(root, columns=("priority", "task"), show="headings", height=8)
table.heading("priority", text="Priority")
table.heading("task", text="Task")
table.column("priority", width=80, anchor="center")
table.column("task", width=260)
table.tag_configure("High", background="#ffd6d6")
table.pack(fill="both", expand=True, padx=8)

status = ttk.Label(root, text="", padding=(8, 4))
status.pack(fill="x")


def current_tasks():
    return [tuple(table.item(row, "values")) for row in table.get_children()]


def refresh_status():
    status.config(text=str(len(table.get_children())) + " task(s) - saved to " + FILENAME)


def add_task():
    text = task_box.get().strip()
    if not text:
        messagebox.showwarning("No task", "Type a task first.")
        return
    table.insert("", "end", values=(priority.get(), text), tags=(priority.get(),))
    task_box.delete(0, "end")
    save_tasks(current_tasks())
    refresh_status()


def remove_selected():
    chosen = table.selection()
    if not chosen:
        messagebox.showinfo("Nothing selected", "Click a task in the list first.")
        return
    if messagebox.askyesno("Remove", "Remove " + str(len(chosen)) + " task(s)?"):
        table.delete(*chosen)
        save_tasks(current_tasks())
        refresh_status()


buttons = ttk.Frame(root, padding=8)
buttons.pack(fill="x")
ttk.Button(buttons, text="Add", style="Add.TButton", command=add_task).pack(side="left")
ttk.Button(buttons, text="Remove selected", command=remove_selected).pack(side="left", padx=6)
ttk.Button(buttons, text="Quit", command=root.destroy).pack(side="right")
task_box.bind("<Return>", lambda event: add_task())

for p, text in load_tasks():
    table.insert("", "end", values=(p, text), tags=(p,))
refresh_status()
task_box.focus()

root.mainloop()
