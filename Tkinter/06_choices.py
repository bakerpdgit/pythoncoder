import tkinter as tk

root = tk.Tk()
root.title("Pizza order")

PRICES = {"Small": 6.00, "Medium": 8.50, "Large": 11.00}
TOPPING_PRICE = 0.75

# Radiobuttons: exactly one choice. They share one variable.
size = tk.StringVar(value="Medium")
sizes = tk.LabelFrame(root, text="Size", padx=8, pady=4)
sizes.grid(row=0, column=0, padx=8, pady=8, sticky="n")
for name in PRICES:
    tk.Radiobutton(sizes, text=name, variable=size, value=name).pack(anchor="w")

# Checkbuttons: any number of choices. Each has its own variable.
extras = {}
toppings = tk.LabelFrame(root, text="Toppings", padx=8, pady=4)
toppings.grid(row=0, column=1, padx=8, pady=8, sticky="n")
for name in ["Cheese", "Mushroom", "Pepperoni", "Pineapple"]:
    extras[name] = tk.BooleanVar()
    tk.Checkbutton(toppings, text=name, variable=extras[name]).pack(anchor="w")

# A Listbox: pick from a list.
tk.Label(root, text="Crust:").grid(row=1, column=0, sticky="w", padx=8)
crusts = tk.Listbox(root, height=3, exportselection=False)
for crust in ["Thin", "Classic", "Stuffed"]:
    crusts.insert(tk.END, crust)
crusts.selection_set(1)
crusts.grid(row=2, column=0, padx=8, sticky="ew")

# An OptionMenu: a drop-down list.
tk.Label(root, text="Collect or deliver:").grid(row=1, column=1, sticky="w", padx=8)
how = tk.StringVar(value="Collect")
tk.OptionMenu(root, how, "Collect", "Deliver").grid(row=2, column=1, padx=8, sticky="w")

summary = tk.Label(root, text="", justify="left", font=("Arial", 10))
summary.grid(row=4, column=0, columnspan=2, padx=8, pady=8, sticky="w")


def show_order():
    chosen = [name for name in extras if extras[name].get()]
    picked = crusts.curselection()
    crust = crusts.get(picked[0]) if picked else "Classic"
    total = PRICES[size.get()] + TOPPING_PRICE * len(chosen)
    if how.get() == "Deliver":
        total = total + 2.50
    lines = [
        size.get() + " " + crust.lower() + " crust",
        "Toppings: " + (", ".join(chosen) if chosen else "none"),
        how.get(),
        "Total: £" + format(total, ".2f"),
    ]
    summary.config(text="\n".join(lines))


tk.Button(root, text="Show my order", command=show_order).grid(row=3, column=0, columnspan=2, pady=6)

root.mainloop()
