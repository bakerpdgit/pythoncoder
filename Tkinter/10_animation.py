import tkinter as tk

WIDTH = 400
HEIGHT = 250
SIZE = 30

root = tk.Tk()
root.title("Bouncing ball")
canvas = tk.Canvas(root, width=WIDTH, height=HEIGHT, bg="black", highlightthickness=0)
canvas.pack()

ball = canvas.create_oval(10, 10, 10 + SIZE, 10 + SIZE, fill="orange")
dx = 4
dy = 3
running = True


def step():
    """Move the ball one frame, then ask tkinter to call step() again."""
    global dx, dy
    if not running:
        return
    canvas.move(ball, dx, dy)
    left, top, right, bottom = canvas.coords(ball)
    if left <= 0 or right >= WIDTH:
        dx = -dx
    if top <= 0 or bottom >= HEIGHT:
        dy = -dy
    # Not a while loop: after() books the next frame and returns straight
    # away, so the window stays free to handle clicks in between.
    root.after(20, step)


def toggle():
    global running
    running = not running
    button.config(text="Pause" if running else "Play")
    if running:
        step()


button = tk.Button(root, text="Pause", width=8, command=toggle)
button.pack(pady=6)

step()
root.mainloop()
