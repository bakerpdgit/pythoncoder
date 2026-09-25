# Your first window

Everything you have written so far talks to the user through `print()` and
`input()`. A **GUI** (graphical user interface) talks through a window instead:
labels, buttons, boxes to type in. `tkinter` is the GUI library that comes with
Python, so it works on any computer with Python installed, no extra downloads.

Press **Run**. A small window appears in the Display pane. Close it with its ✕
and the program carries on to its last line.

## The three steps every tkinter program follows

```python
root = tk.Tk()                         # 1. make the window
greeting = tk.Label(root, text="Hi")   # 2. make widgets...
greeting.pack()                        #    ...and place them
root.mainloop()                        # 3. hand over to tkinter
```

1. **`tk.Tk()`** creates the main window. Call it once. By convention the
   window is called `root`.
2. **Widgets** are the things inside a window: `Label`, `Button`, `Entry` and
   more. The first thing you pass to any widget is the window (or frame) it
   lives in. Making a widget is not enough to see it: you must also **place**
   it, here with `pack()`, which stacks widgets top to bottom.
3. **`root.mainloop()`** is the program's last real job. It sits and waits for
   the user to do something (click, type, close the window) and does not
   return until the window is closed. That is why the `print` at the end only
   runs after you close the window.

## Options

Widgets take **keyword arguments** that set how they look:

| Option | Meaning | Example |
| --- | --- | --- |
| `text` | the words shown | `text="Hello"` |
| `font` | family, size, style | `font=("Arial", 16, "bold")` |
| `fg`, `bg` | text and background colour | `fg="grey"`, `bg="#ffe0e0"` |
| `padx`, `pady` | space around (in `pack`) | `pack(pady=20)` |

`root.title()` sets the text in the title bar and `root.geometry("320x160")`
sets the window's size in pixels.

## tkinter in Coder

Coder runs Python in your browser, and the browser has no real Tk. Instead, Coder
has its own version of tkinter that draws the window inside the page. Almost
everything works just as it does in IDLE, but a few things are different:

- **The window lives in the Display pane**, not on your desktop. Extra
  `Toplevel` windows appear underneath it. You can't drag windows around, and
  the position part of `geometry("400x300+100+50")` is ignored.
- **It looks like Windows**, with the same fonts and grey. On your own
  computer, sizes and fonts may be a pixel or two different.
- **A tkinter program always runs with Run.** Debug and Trace can't step
  through it, because its windows are part of this page. Page 8 shows a way
  round this.
- **Stop ends it**, and so does closing its window.
- **Pictures:** `PhotoImage` reads PNG and GIF files. As on a real computer,
  JPEG needs Pillow (`from PIL import Image, ImageTk`).

## Try this

- Change the text, the font and the colours.
- Add a third label. Where does it appear?
- Remove `root.mainloop()` and run it again in IDLE if you have it. The window
  flashes up and vanishes, because the program ends straight away. (Coder
  keeps the window open anyway, to be kind.)
