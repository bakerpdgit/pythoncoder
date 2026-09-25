# Choices: check boxes, radio buttons and lists

Typing is not always the best way in. When there is a fixed set of answers,
let the user pick one.

| Widget | For | Read it with |
| --- | --- | --- |
| `Radiobutton` | **one** choice from a few | the shared variable's `.get()` |
| `Checkbutton` | yes/no, any number of them | each one's own variable |
| `Listbox` | one (or more) from a longer list | `.curselection()` and `.get(i)` |
| `OptionMenu` | one from a drop-down | the variable's `.get()` |

## Radiobuttons share one variable

```python
size = tk.StringVar(value="Medium")
tk.Radiobutton(sizes, text="Small", variable=size, value="Small")
```

All the size buttons use the **same** `size` variable. Clicking one sets `size`
to that button's `value`, and the others switch off. `value="Medium"` at the
start decides which is chosen first.

## Checkbuttons have one variable each

```python
extras[name] = tk.BooleanVar()
tk.Checkbutton(toppings, text=name, variable=extras[name])
```

A dictionary of variables keeps one per topping, so the program can loop over
them later: `[name for name in extras if extras[name].get()]` is a list of the
ticked ones.

## Listbox

`insert(tk.END, "Thin")` adds an item at the end. `curselection()` gives a
**tuple of positions** of the selected items, possibly empty, so check before
using `picked[0]`. `exportselection=False` stops the listbox forgetting its
choice when you click in another box.

## LabelFrame

A `LabelFrame` is a Frame with a border and a title, a neat way to group
related choices.

## Try this

- Add a "Drinks" Listbox with prices, and add the chosen drink to the total.
- Only allow three toppings: if more are ticked, show a warning in the summary.
- Add a Scale (`tk.Scale(root, from_=1, to=5, orient="horizontal")`) for how
  many pizzas.
