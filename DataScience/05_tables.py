# NumPy: two dimensions, and what "axis" means.
import numpy as np

# Four test scores for each of five students. One row per student.
students = ["Aisha", "Ben", "Chen", "Dara", "Eve"]
tests = ["Test 1", "Test 2", "Test 3", "Test 4"]

scores = np.array([
    [68, 72, 79, 84],
    [55, 61, 58, 66],
    [91, 88, 94, 96],
    [47, 52, 63, 71],
    [76, 74, 80, 78],
])

print("shape:", scores.shape, "-> 5 students, 4 tests")
print()

# axis=1 collapses the columns, leaving one number per student.
for name, average in zip(students, scores.mean(axis=1)):
    print(f"{name:6} average {average:5.1f}")

print()

# axis=0 collapses the rows, leaving one number per test.
for test, average in zip(tests, scores.mean(axis=0)):
    print(f"{test:7} class average {average:5.1f}")

print()
print("whole cohort:", round(scores.mean(), 1))

# Slicing reads a row, a column, or a block.
print()
print("Chen's scores :", scores[2])
print("Test 4 scores :", scores[:, 3])
print("first 2 tests :")
print(scores[:, :2])
