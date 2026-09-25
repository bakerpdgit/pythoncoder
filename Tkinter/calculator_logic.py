# The calculator's logic, with no tkinter in it at all.
# Every function takes plain values and returns plain values, so it can be
# tested and traced on its own - open this file and press Trace.


def press(display, key):
    """What the display shows after pressing `key` on a display showing `display`."""
    if key == "C":
        return "0"
    if key == "=":
        return evaluate(display)
    if display == "0" or display == "Error":
        display = ""
    if key in "+-*/" and (display == "" or display[-1] in "+-*/"):
        return display or "0"
    return display + key


def evaluate(expression):
    """Work out a sum like '12+3*4', doing * and / before + and -."""
    try:
        numbers, operators = split(expression)
        # First pass: multiplication and division.
        i = 0
        while i < len(operators):
            if operators[i] in "*/":
                a, b = numbers[i], numbers[i + 1]
                if operators[i] == "/" and b == 0:
                    return "Error"
                numbers[i:i + 2] = [a * b if operators[i] == "*" else a / b]
                operators.pop(i)
            else:
                i = i + 1
        # Second pass: addition and subtraction, left to right.
        total = numbers[0]
        for op, n in zip(operators, numbers[1:]):
            total = total + n if op == "+" else total - n
        return tidy(total)
    except (ValueError, IndexError):
        return "Error"


def split(expression):
    """'12+3*4' -> ([12.0, 3.0, 4.0], ['+', '*'])"""
    numbers = []
    operators = []
    current = ""
    for ch in expression:
        if ch in "+-*/":
            numbers.append(float(current))
            operators.append(ch)
            current = ""
        else:
            current = current + ch
    numbers.append(float(current))
    return numbers, operators


def tidy(value):
    """Show 4.0 as '4', and round long decimals."""
    if value == int(value):
        return str(int(value))
    return str(round(value, 8))


if __name__ == "__main__":
    # A quick self-check, run when this file is run on its own.
    for sums, expected in [("2+3", "5"), ("12+3*4", "24"), ("7/2", "3.5"), ("1/0", "Error")]:
        print(sums, "=", evaluate(sums), "(expected " + expected + ")")
