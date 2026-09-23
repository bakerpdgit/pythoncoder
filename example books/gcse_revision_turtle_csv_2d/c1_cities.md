# CSV 1: Big cities

**Level: trivial - fill in the blanks**

The file `cities.csv` holds one city per line in the form `city,country,population`, where the population is in millions:

```
London,UK,8.9
Paris,France,2.1
Tokyo,Japan,14.0
```

The program asks for a minimum population, then displays every city with at least that population, in the form `London (UK)`, followed by how many cities were found.

## What to do

Replace each blank (`___`) with the correct code. There are **6** blanks.

The file is opened for **reading**. Each line needs its newline character removed before it is split into a list of fields at every **comma**. Remember that list indexes start at 0, so the country is `fields[1]`. Finally, the file must be closed.

## Example run

```
Enter minimum population (millions): 10
Tokyo (Japan)
Lagos (Nigeria)
Lima (Peru)
Cities found: 3
```

## Checking your work

Try minimums of 5, 10 and 20. You should find 5 cities, 3 cities (as above) and 0 cities.

When you have finished, compare your program with the model solution on the next page.
