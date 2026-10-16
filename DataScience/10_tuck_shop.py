# Task: the tuck shop. Replace each ____ with one line of pandas.
import pandas as pd

shop = pd.DataFrame({
    "item": ["Apple", "Cookie", "Juice", "Pasta pot", "Flapjack", "Water"],
    "price": [0.40, 0.80, 1.10, 2.50, 1.20, 0.60],
    "sold": [64, 112, 48, 37, 71, 90],
})

# 1. A new column, "takings": the price times the number sold, for every row.
shop["takings"] = ____

# 2. The total takings for the day (one number).
total = ____

# 3. The row label of the item that took the most money.
best_row = ____

print(shop)
print()
print(f"total takings: £{total:.2f}")
print("best seller  :", shop.loc[best_row, "item"])
