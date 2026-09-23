# A quick tour of the coursework examples in this book.

examples = [
    ("A", "Blokus-style strategy game", "pygame, drag and drop, minimax AI"),
    ("B", "Metro journey planner", "graphs, Dijkstra and A*, SQLite, hand-built heap"),
    ("C", "Boolean algebra simplifier", "parsing, expression trees, recursion"),
    ("D", "Othello", "minimax with four difficulty levels, inheritance, save files"),
    ("E", "Train Tracks puzzle", "puzzle generation, a logic solver, undo stack"),
]

print("A Level Computer Science coursework showcase")
print("=" * 44)
for letter, title, highlights in examples:
    print(f"Example {letter}: {title}")
    print(f"    {highlights}")
print()
print("Open an example from the book contents to try it.")
