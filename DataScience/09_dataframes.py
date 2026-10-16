# pandas: a table whose columns have names.
import pandas as pd

# A DataFrame is built from a dictionary: each key becomes a column.
planets = pd.DataFrame({
    "planet": ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"],
    "diameter_km": [4879, 12104, 12742, 6779, 139820, 116460, 50724, 49244],
    "distance_au": [0.39, 0.72, 1.00, 1.52, 5.20, 9.54, 19.19, 30.07],
    "moons": [0, 0, 1, 2, 95, 146, 28, 16],
})

print(planets)
print()
print("shape  :", planets.shape, "-> 8 rows, 4 columns")
print("columns:", list(planets.columns))
print()

# One column is a Series: a NumPy array with a name and row labels.
moons = planets["moons"]
print("total moons:", moons.sum())
print("mean moons :", round(moons.mean(), 1))
print()

# Arithmetic on a column happens to every row, exactly as with an array -
# and assigning the answer to a new name adds a column.
planets["diameter_earths"] = (planets["diameter_km"] / 12742).round(2)
print(planets[["planet", "diameter_earths"]])
print()

# idxmax() gives the row label of the biggest value; .loc[row, column] reads a cell.
biggest = planets["diameter_km"].idxmax()
print("largest planet:", planets.loc[biggest, "planet"])
print("most moons    :", planets.loc[planets["moons"].idxmax(), "planet"])
