# Example C: a Boolean algebra simplifier

Boolean algebra is the maths of logic gates and of `if` conditions: variables are either 1 (true) or 0 (false), `*` means AND, `+` means OR and `!` means NOT. This program takes an expression, turns it into a tree, and simplifies it step by step, naming each law of Boolean algebra as it applies it. It can also produce truth tables and generate random expressions to practise on.

## Running it

Press **Run** and choose from the menu. Option **1** simplifies an expression. Put brackets round every pair — the program reads `*` and `+` from left to right, so brackets make sure it groups things the way you mean. Some to try:

- `A * (A + B)` — absorption
- `(A + !A) * B` — complement, then identity
- `(A * A) + (A * (A + B))` — three laws in a row
- `(A + (A * B)) * (C + !C)`
- `!(A + B)` — De Morgan's law

Option **2** prints a truth table and offers to save it as `truth_table.csv`, which then appears in the file browser. Option **3** generates a random expression, and option **4** lists the laws.

## Techniques to look for

The whole program is in one file, `boolean_algebra.py`.

- **Parsing.** `BooleanParser` breaks the text into tokens, then uses *recursive descent*: `parse_expr` and `parse_factor` call each other, so an expression in brackets is handled by calling the same code again for the inside.
- **Trees.** The result is an *expression tree*, which the program prints. Each operator is a node and its operands are its children: `And`, `Or` and `Not` nodes, with variables and constants as the leaves.
- **Recursion.** Nearly everything works by walking the tree recursively. `BooleanSimplifier` simplifies the children first and then checks whether a law applies to the node itself. `TreeToAlgebraConverter` turns the tree back into text, and `TruthTableGenerator` evaluates it for every combination of inputs.
- **Decorators.** `@benchmark` wraps the parser and the truth-table generator to time them — that is where the "Execution time" lines come from.
- **Files.** Every simplification is logged to `session_log.txt`, and a session can be saved to and loaded from JSON.

## Changes made for this demo

- The file has been renamed to `boolean_algebra.py`. Its original name included the student's initials.
- The code itself is unchanged.
