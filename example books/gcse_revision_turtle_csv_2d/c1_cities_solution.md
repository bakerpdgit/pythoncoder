# CSV 1 solution: Big cities

A model solution for **CSV 1**. Run it and enter a minimum population such as 5.

## The standard CSV reading pattern

```
theFile = open(FILENAME, "r")
for line in theFile:
    line = line.strip()
    fields = line.split(",")
    ...
theFile.close()
```

`strip()` removes the newline at the end of each line. Without it the last field would be `"8.9\n"` - which `float()` happens to accept, but a string comparison would not.

Every field arrives as a **string**, so the population is converted with `float()` before it is compared.
