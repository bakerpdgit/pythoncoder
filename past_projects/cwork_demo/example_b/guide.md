# Example B: a metro journey planner

A route planner for the Singapore MRT (metro) network. You choose two stations and one of four path-finding algorithms, and it works out the route, station by station, with its distance and an estimated journey time. The network — 134 stations, the distances between them and the time it takes to change lines — is stored in an SQLite database.

The student's original also had a web-app front end with user accounts and a clickable map. That part cannot run in the browser, so this demo uses the program's terminal version.

## Running it

Press **Run**, type `t` for the terminal version, then:

- Enter a start and an end station. Station names work (`Jurong East`, `Changi Airport`, `Orchard`, `Bayfront`, `Chinatown`) and so do station codes like `NS1`.
- Choose an algorithm: `1` breadth-first search, `2` Dijkstra, `3` A-star, or `4` for the *k* shortest routes (try `k` = 3).
- Type `r` to plan another journey or `q` to quit.

Try the same journey with each algorithm and compare the routes. Breadth-first search finds the route with the **fewest stops**, which is not always the shortest.

## What is inside

| File | What it does |
| --- | --- |
| `Main.py` | Asks whether to use the terminal or the web version |
| `terminal.py` | The terminal interface: checks the stations and prints the route |
| `graphTraversal.py` | The four path-finding algorithms |
| `Graph.py` | Loads the network from the database into an *adjacency list* |
| `Station.py`, `Route.py`, `Location.py`, `heuristics.py` | Classes for stations, routes and map positions, and the straight-line distance used by `A*` |
| `custom_implementations/` | A stack, a queue, a priority queue, a binary heap and a linked list, all written from scratch |
| `data/stations.csv`, `instance/database.db` | The network data |

## Techniques to look for

- **Graphs.** The network is a *weighted graph*: stations are nodes, and each connection has a cost (a distance, or the time to change lines). `Graph.py` stores it as an adjacency list — for each station, a dictionary of its neighbours and the cost of getting to each.
- **Four graph algorithms.** Breadth-first search explores the network one stop at a time using a queue. Dijkstra's algorithm always extends the cheapest route found so far, using a priority queue. `A*` does the same, but adds an estimate of the distance still to go (worked out from each station's latitude and longitude) so that it heads towards the destination instead of searching in every direction. The *k* shortest paths option (Yen's algorithm) finds the best route and then the next-best alternatives.
- **Data structures from scratch.** Rather than using Python's built-in tools, the student wrote their own priority queue on top of a **binary heap**, which keeps the cheapest item at the top and gives it up in O(log n) time. A **stack** is used to rebuild the route backwards from the destination.
- **SQL.** `Graph.py` reads the stations, distances and interchange times from the database with `SELECT` queries.

## Changes made for this demo

- `Main.py` no longer imports the web-app version, which needs the Flask web framework. Choosing `g` now prints a message instead. The web-app files are not included.
- The database has been cut down to the four tables that describe the network. The web app's tables of user accounts and saved routes have been removed.
