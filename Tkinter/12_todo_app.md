# A whole app: a to-do list that remembers

This puts the pieces together into the kind of program an A-level project is
made of: a form, a table of data, buttons that change it, and a file that keeps
it between runs. Add some tasks, stop the program and run it again. They are
still there, in `todo.txt` in the Files panel.

## ttk: the themed widgets

```python
from tkinter import ttk
ttk.Button(buttons, text="Add", command=add_task)
```

`tkinter.ttk` has modern-looking versions of the common widgets (`ttk.Button`,
`ttk.Entry`, `ttk.Label`, `ttk.Frame`...) plus some that plain tkinter lacks:

- **`ttk.Combobox`**, a drop-down you can also type in (or not, with
  `state="readonly"`),
- **`ttk.Treeview`**, a table with columns (this page),
- **`ttk.Notebook`**, tabs,
- **`ttk.Progressbar`**.

ttk widgets take their look from a **style**, not from `bg=` and `fg=`.
`ttk.Button(root, bg="red")` is an error; instead:

```python
style = ttk.Style()
style.configure("Add.TButton", font=("Segoe UI", 9, "bold"))
ttk.Button(..., style="Add.TButton")
```

## The Treeview table

```python
table = ttk.Treeview(root, columns=("priority", "task"), show="headings")
table.heading("task", text="Task")
table.insert("", "end", values=("High", "Revise"))
```

| Code | Does |
| --- | --- |
| `table.get_children()` | ids of every row |
| `table.item(row, "values")` | that row's values |
| `table.selection()` | ids of the selected rows |
| `table.delete(row)` | remove a row |
| `tags=("High",)` + `tag_configure("High", background=...)` | colour rows |

One catch worth knowing: `table.item(row)["values"]` turns anything that looks
like a whole number into an `int`, so `"007"` comes back as `7`.

## Separate the data from the window

`load_tasks` and `save_tasks` are plain functions working on a list of tuples,
exactly as on page 8. The window reads the list when it starts and writes it
after every change. The file format is one task per line: `High,Revise for the test`.

## Taking your program home

Everything here is standard tkinter, so it runs in IDLE or any Python on a
computer unchanged. The differences you might notice there:

- windows open on the desktop and can be moved and resized;
- sizes, fonts and the exact look vary a little between Windows, Mac and Linux;
- an error in a callback prints to the shell rather than Coder's console;
- `todo.txt` is saved next to your program file.

## Try this

- Add a "Mark done" button that moves a task to a second, "Done" table.
- Sort the tasks by priority when the program starts.
- Add a Notebook with a "Tasks" tab and a "Stats" tab counting each priority.
