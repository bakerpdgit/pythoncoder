numbers = [3, 7, 11, 15, 19, 24, 31]
target = 19
low = 0
high = len(numbers) - 1
found_at = -1

while low <= high and found_at == -1:
    middle = (low + high) // 2
    if numbers[middle] == target:
        found_at = middle
    elif numbers[middle] < target:
        low = middle + 1
    else:
        high = middle - 1

print("Found at index:", found_at)
