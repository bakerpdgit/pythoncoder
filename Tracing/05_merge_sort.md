# Recursive merge sort

This final example combines recursion, selection, loops, list operations, and returned values.

Start with these columns:

- **Call depth** and **Call #**
- `merge_sort.values`
- `merge_sort.middle`
- `merge_sort.left` and `merge_sort.right`
- `merge_sort.merged`

Each recursive call has its own local values. Call depth shows how far the program has descended, while Call # distinguishes separate calls at the same depth. Use **Expand** on the list columns to see the split and merged values.

Function-entry rows show the parameter for every call. When a call returns, its result is described on the next row executed by its caller, so the unwind can be followed without separate blank exit rows.
