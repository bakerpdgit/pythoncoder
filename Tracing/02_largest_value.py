numbers = [12, 5, 19, 8, 16]
largest = numbers[0]

for number in numbers[1:]:
    if number > largest:
        largest = number

print("Largest:", largest)
