def merge_sort(values):
    if len(values) <= 1:
        return values

    middle = len(values) // 2
    left = merge_sort(values[:middle])
    right = merge_sort(values[middle:])

    merged = []
    left_index = 0
    right_index = 0

    while left_index < len(left) and right_index < len(right):
        if left[left_index] <= right[right_index]:
            merged.append(left[left_index])
            left_index = left_index + 1
        else:
            merged.append(right[right_index])
            right_index = right_index + 1

    merged.extend(left[left_index:])
    merged.extend(right[right_index:])
    return merged


numbers = [12, 11, 13, 5, 6, 7]
sorted_numbers = merge_sort(numbers)
print("Sorted:", sorted_numbers)
