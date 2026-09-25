import tkinter as tk

root = tk.Tk()
root.title("Canvas")

# A Canvas is a drawing area. (0, 0) is the TOP-LEFT corner and y goes DOWN.
canvas = tk.Canvas(root, width=400, height=300, bg="lightblue", highlightthickness=0)
canvas.pack()

# Ground and sun
canvas.create_rectangle(0, 220, 400, 300, fill="forestgreen", outline="")
canvas.create_oval(310, 20, 370, 80, fill="gold", outline="orange", width=3)

# A house: a square body, a triangular roof, a door and a window
canvas.create_rectangle(80, 140, 200, 230, fill="tan", outline="black")
canvas.create_polygon(70, 140, 140, 80, 210, 140, fill="firebrick", outline="black")
canvas.create_rectangle(125, 180, 155, 230, fill="saddlebrown")
canvas.create_rectangle(90, 155, 115, 175, fill="white", outline="black")

# A tree
canvas.create_rectangle(270, 170, 285, 230, fill="sienna", outline="")
canvas.create_oval(245, 110, 310, 180, fill="darkgreen", outline="")

# Lines and text
canvas.create_line(0, 260, 400, 260, fill="white", width=2, dash=(8, 6))
canvas.create_text(200, 20, text="My house", font=("Arial", 16, "bold"), fill="navy")

# Every create_ call returns an id number, so a shape can be changed later.
cloud = canvas.create_oval(20, 30, 110, 70, fill="white", outline="")


def recolour():
    canvas.itemconfig(cloud, fill="grey")


tk.Button(root, text="Make it rain", command=recolour).pack(pady=6)
print("The cloud is item", cloud, "at", canvas.coords(cloud))

root.mainloop()
