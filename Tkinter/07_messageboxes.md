# Message boxes and checking input

Sometimes the program needs to stop and tell the user something, or ask a
question. That is what `tkinter.messagebox` is for:

```python
from tkinter import messagebox

messagebox.showinfo("Correct!", "You got it in 5 guesses.")
if messagebox.askyesno("Play again?", "Would you like another game?"):
    new_game()
```

| Function | Shows | Gives back |
| --- | --- | --- |
| `showinfo`, `showwarning`, `showerror` | a message and OK | `"ok"` |
| `askyesno` | Yes / No | `True` or `False` |
| `askokcancel` | OK / Cancel | `True` or `False` |
| `askyesnocancel` | Yes / No / Cancel | `True`, `False` or `None` |

The first argument is the box's title, the second its message. A message box
**waits**: the next line does not run until it is answered.

## Never trust what was typed

`int(guess_box.get())` crashes with a `ValueError` if the box holds `"ten"` or
nothing at all. In a GUI the crash doesn't end the program. tkinter prints the
error ("Exception in Tkinter callback") and carries on, but the button just
seems to do nothing. So check first:

```python
try:
    guess = int(text)
except ValueError:
    messagebox.showerror("Not a number", ...)
    return
```

`return` leaves the callback early; the window is still there for another go.
Then check the **range** too: a number is not necessarily a sensible number.

## Closing the window from code

`root.destroy()` closes the window, which ends `mainloop()`, just like clicking
✕. The program then runs its last lines and finishes.

## In Coder

The message box appears over the window in the Display pane. On an older
browser, one that can't pause Python while it waits, Coder uses the browser's own
pop-up boxes instead. They work the same, but look plainer.

## Try this

- Count the guesses and give up after 7, revealing the number.
- Use `simpledialog.askinteger("Range", "Highest number?")` (from
  `tkinter import simpledialog`) to choose the range at the start.
- Show the last five guesses in a Label under the hint.
