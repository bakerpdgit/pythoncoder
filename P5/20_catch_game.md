# A whole game

Move the basket with the mouse and catch the falling stars. Miss three and the
game is over; click to play again.

Nearly everything from this book is in it:

- **animation** — each star's `y` grows by its own `speed` every frame;
- **the mouse** — the basket follows `mouse_x`, kept on the canvas with
  `constrain()`;
- **decisions** — a star is caught when it is low enough *and* close enough to
  the basket (`abs()` is the distance either way);
- **a list** of stars, each a dictionary of its own position and speed;
- **functions** — `new_star()` makes a fresh one, used at the start and every
  time a star is caught or missed;
- **text** — `text_align(RIGHT)` lines the lives up against the right edge,
  and `text_align(CENTER, CENTER)` centres "Game over";
- **no_loop() and loop()** — the game freezes on its last frame when it is over,
  and `mouse_pressed()` starts it again.

## Make it yours

- Speed up: make new stars a little faster as the score goes up.
- Add a bad star (a red one) that costs a life if you catch it.
- Keep a high score in a variable that survives a new game.
- Turn the stars into a class, as on page 19.

## Going further

p5 can also load pictures: put a PNG in your filesystem, then
`img = load_image("star.png")` in `setup()` and `image(img, x, y)` in
`draw()`. The p5.js reference (p5js.org/reference) lists everything: Coder
understands both spellings, p5.js's `fill`, `noStroke`, `mouseX`… and the
Python `no_stroke`, `mouse_x` used in this book.
