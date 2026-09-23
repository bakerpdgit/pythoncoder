# CSV 2 solution: Club members by year

A model solution for **CSV 2**. Run it and try 2019, 2021 and 2018.

## Worth noticing

`line.strip().split(",")` does both steps in one statement.

`int(fields[3]) == searchYear` converts the year from the file to an integer before comparing. Comparing the string `"2019"` with the integer `2019` would always be `False`, with no error to warn you.

The message about the number of matches can only be decided **after** the loop has looked at every line, so it sits outside the loop.
