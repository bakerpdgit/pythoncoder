# CSV 2: Club members by year

**Level: simple - complete the missing lines**

A sports club keeps its members in `members.csv`. Each line is `memberID,firstName,surname,yearJoined`:

```
M001,Amira,Khan,2019
M002,Ben,Taylor,2021
```

The program asks for a year and lists every member who joined in that year.

## What to do

The file handling has been written for you. Complete the two numbered parts.

(1) Inside the loop, if the member joined in `searchYear`, display their ID, first name and surname separated by single spaces, and add 1 to `matches`. The year in the file is a **string**, but `searchYear` is an **integer**, so one of them needs converting before you compare them.

(2) After the loop, display either `No members joined in 2018` or `3 member(s) joined in 2019` (with the correct numbers).

## Example runs

```
Enter a year: 2019
M001 Amira Khan
M003 Chloe Evans
M006 Finn Murphy
3 member(s) joined in 2019
```

```
Enter a year: 2018
No members joined in 2018
```

## Checking your work

Try 2019 (3 members), 2021 (2 members: Ben Taylor and Ella Wright) and 2018 (none).

When you have finished, compare your program with the model solution on the next page.
