import tkinter as tk
import random

WIDTH = 400
HEIGHT = 300
STEP = 15

root = tk.Tk()
root.title("Catch the coins")
canvas = tk.Canvas(root, width=WIDTH, height=HEIGHT, bg="white")
canvas.pack()
score_text = canvas.create_text(10, 10, anchor="nw", text="Score: 0", font=("Arial", 12))

player = canvas.create_rectangle(185, 135, 215, 165, fill="blue")
score = 0


def place_coin():
    x = random.randint(20, WIDTH - 20)
    y = random.randint(40, HEIGHT - 20)
    return canvas.create_oval(x - 8, y - 8, x + 8, y + 8, fill="gold", outline="orange", tags="coin")


coin = place_coin()


def move(dx, dy):
    global coin, score
    canvas.move(player, dx, dy)
    # Stop at the edges by moving back if we went too far.
    left, top, right, bottom = canvas.coords(player)
    if left < 0 or right > WIDTH or top < 0 or bottom > HEIGHT:
        canvas.move(player, -dx, -dy)
        return
    # Everything the player now overlaps, including itself.
    if coin in canvas.find_overlapping(left, top, right, bottom):
        canvas.delete(coin)
        score = score + 1
        canvas.itemconfig(score_text, text="Score: " + str(score))
        coin = place_coin()


# Keyboard: bind each key to a function. event.keysym names the key.
root.bind("<Left>", lambda event: move(-STEP, 0))
root.bind("<Right>", lambda event: move(STEP, 0))
root.bind("<Up>", lambda event: move(0, -STEP))
root.bind("<Down>", lambda event: move(0, STEP))


# Mouse: event.x and event.y say where on the canvas the click was.
def click(event):
    canvas.create_text(event.x, event.y, text="x", fill="red")


def drag(event):
    canvas.create_oval(event.x - 2, event.y - 2, event.x + 2, event.y + 2, fill="grey", outline="")


canvas.bind("<Button-1>", click)
canvas.bind("<B1-Motion>", drag)

root.mainloop()
