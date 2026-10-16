# Task: a messy reading log. Replace each ____ with one line of pandas.
import pandas as pd

log = pd.read_csv("data/reading_log.csv")

# 1. How many values are missing in each column.
missing = ____

# 2. Tidy the genre column: strip the spaces and make every genre lower case.
log["genre"] = ____

# 3. Keep only the rows that have both pages and minutes.
log = ____

print("missing values:")
for column, count in missing.items():
    print(f"  {column:8} {count}")
print()
print("genres:", sorted(log["genre"].unique()))
print("complete rows:", len(log))
print()
pages_per_minute = log.groupby("genre")["pages"].sum() / log.groupby("genre")["minutes"].sum()
for genre, rate in pages_per_minute.items():
    print(f"{genre:12} {rate:.2f} pages a minute")
