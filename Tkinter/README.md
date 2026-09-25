# Tkinter learning book

Twelve examples introducing tkinter, Python's built-in GUI library, from a
single label to a to-do list saved to a file. All twelve are examples rather
than assessed activities, in the same style as the [Pygame](../Pygame/README.md)
book.

tkinter is not in Edexcel's GCSE Programming Language Subset. It is here
because it is what most A-level NEA projects use for their interface, and
because event-driven programming (callbacks, events, state kept between
clicks) is a genuinely different way of structuring a program.

## The progression

| # | Page | Introduces |
| --- | --- | --- |
| 1 | Your first window | `Tk`, `Label`, `pack`, `mainloop`, and what is different in Coder |
| 2 | Buttons and callbacks | `command=`, the `command=f()` mistake, `lambda`, `config` |
| 3 | Typing: Entry and StringVar | `Entry.get/delete/insert`, `StringVar`, `bind("<Return>")` |
| 4 | Laying out a form with grid | `grid`, `sticky`, `columnspan`, `columnconfigure(weight=)`, never mixing pack and grid |
| 5 | Frames: building a whole window | `Frame`, how `pack` carves up space, `fill` vs `expand` |
| 6 | Check boxes, radio buttons and lists | `Radiobutton`, `Checkbutton`, `Listbox`, `OptionMenu`, `LabelFrame` |
| 7 | Message boxes and checking input | `messagebox`, `try/except ValueError`, `destroy` |
| 8 | Keep the logic out of the window | a logic module with no tkinter (traceable on its own), the loop-and-lambda trap |
| 9 | Drawing on a Canvas | coordinates, `create_*`, item ids, `itemconfig`, `move`, `coords` |
| 10 | Animation with after() | why not `while`/`sleep`, `after`, bouncing, pausing |
| 11 | Keys and the mouse | `bind`, the event object, focus, `find_overlapping`, tags |
| 12 | A whole app | `ttk`, `Style`, `Treeview`, `Combobox`, saving and loading a file |

## How tkinter runs in Coder

Pyodide has no Tcl/Tk, so Coder provides its own `tkinter` package
(`src/python/tkinter`) that draws windows in the Display pane. It follows the
standard API closely enough that these programs run unchanged in IDLE. Page 1's
guide lists the differences students may notice, and page 12's lists what
changes when a program is taken home.
