# pandas: data as it really arrives - gaps, typos and text where numbers should be.
import pandas as pd

# A bake sale's takings, typed in by several people on one laptop.
sales = pd.read_csv("data/bakesale.csv")
print(sales)
print()

# Blank cells arrive as NaN ("not a number"). isna().sum() counts them per column.
print("missing values:")
print(sales.isna().sum())
print()

# The same item spelt five ways is five different groups to pandas.
print("before:", sorted(sales["item"].unique()))

# .str applies a string method to every value: strip spaces, then Capitalise.
sales["item"] = sales["item"].str.strip().str.capitalize()
print("after :", sorted(sales["item"].unique()))
print()

# A missing price can be filled in: both blanks are Cookies, and a Cookie is 80p.
sales["price"] = sales["price"].fillna(0.80)

# A missing number sold cannot be guessed, so those rows are dropped.
before = len(sales)
sales = sales.dropna(subset=["sold"])
print("dropped", before - len(sales), "rows with no sales figure")
print()

sales["takings"] = sales["price"] * sales["sold"]
print(sales.groupby("item")["takings"].sum().sort_values(ascending=False))
