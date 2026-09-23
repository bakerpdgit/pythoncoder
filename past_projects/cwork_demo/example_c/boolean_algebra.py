import ast
import itertools
import random
from datetime import datetime
import os
import json
import csv
import time


# Define custom nodes for boolean operations


############################################
#Group A skill: Dynamic Generation of Objects.
############################################


class BooleanAnd(ast.AST):
    _fields = ['left', 'right']
class BooleanOr(ast.AST):
    _fields = ['left', 'right']
class BooleanNot(ast.AST):
    _fields = ['operand']
class BooleanVar(ast.AST):
    _fields = ['id']
class BooleanConst(ast.AST):
    _fields = ['value']


# Performance Benchmarking
#  function is used as a "wrapper" around other functions to measure and print their execution time.
def benchmark(func):
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        print(f"Execution time for {func.__name__}: {end_time - start_time:.6f} seconds")
        return result
    return wrapper


# Session Logger


############################################
# Group B Skill: Writing and Reading from Files
############################################


# This class stores previous boolean expressions and their simplified results.
class SessionLogger:
    LOG_FILE = "session_log.txt"


    @staticmethod
    def log(expression, simplified_expression):
        try:
            with open(SessionLogger.LOG_FILE, "a") as file:
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                file.write(f"[{timestamp}] Original: {expression}, Simplified: {simplified_expression}\n")
        except Exception as e:
            print(f"Error logging session: {e}")


    @staticmethod
    def save_session(session_data, filename="saved_session.json"):
        try:
            with open(filename, "w") as file:
                json.dump(session_data, file, indent=4)
            print(f"Session saved to {filename}.")
        except Exception as e:
            print(f"Error saving session: {e}")


    @staticmethod
    def load_session(filename="saved_session.json"):
        try:
            if not os.path.exists(filename):
                print(f"File {filename} does not exist.")
                return []
            with open(filename, "r") as file:
                session_data = json.load(file)
            
            if not session_data:
                print("No previous session data found.")
            else:
                print("\nLoaded Previous Session Data:")
                for entry in session_data:
                    print(f"Original: {entry['expression']} -> Simplified: {entry['simplified']}")
                    
            return session_data
        except json.JSONDecodeError:
            print(f"Error: Session file {filename} is corrupted.")
            return []
        except Exception as e:
            print(f"Unexpected error loading session: {e}")
            return []



# Random Expression Generator

############################################
# Group A Skill: Randomized Tree Creation
############################################


# This class generates randomized boolean algebra expressions of different varying complexities
class RandomExpressionGenerator:
    @staticmethod
    def generate_random_expression(variables, difficulty="medium"):
        depth = {"easy": 2, "medium": 4, "hard": 6}[difficulty]
        return RandomExpressionGenerator._generate(variables, depth)
    @staticmethod
    def _generate(variables, depth):
        if depth == 0:
            return random.choice(variables + ["0", "1"])
        operator = random.choice(["+", "*", "!"])
        if operator == "!":
            return f"!({RandomExpressionGenerator._generate(variables, depth - 1)})"
        else:
            left = RandomExpressionGenerator._generate(variables, depth - 1)
            right = RandomExpressionGenerator._generate(variables, depth - 1)
            return f"({left} {operator} {right})"
        
# Parser Class


############################################
# Group A Skill: Parsing Boolean Expressions
############################################


# Converts a boolean algebra string into an abstract syntax tree 


class BooleanParser:
    @benchmark
    @staticmethod
    def parse(expression):
        try:
            def tokenise(expr):
                tokens = []
                valid_chars = {'(', ')', '*', '+', '!', '0', '1'}
                last_token = None
                
                for char in expr.replace(" ", ""):
                    if char.isalnum() or char in valid_chars:
                        if last_token and last_token.isalnum() and char.isalnum():
                            raise SyntaxError(f"Missing operator between '{last_token}' and '{char}' in expression: {expr}")
                        tokens.append(char)
                        last_token = char
                    else:
                        raise SyntaxError(f"Invalid character '{char}' found in expression: {expr}")
                return tokens
            
            # Precedence Handling: Ensure that * has higher precedence than + 
            def parse_expr(tokens):
                if not tokens:
                    raise SyntaxError("Empty expression is not valid.")
                left = parse_factor(tokens)
                while tokens and tokens[0] in {'*', '+'}:
                    op = tokens.pop(0)
                    if not tokens:
                        raise SyntaxError(f"Expression ends unexpectedly after operator '{op}'.")
                    right = parse_factor(tokens)
                    left = BooleanAnd(left=left, right=right) if op == '*' else BooleanOr(left=left, right=right)
                return left
            
            # Handles parentheses to ensure expressions inside brackets are evaluated first
            # Also processes ! before evaluating other operators
            def parse_factor(tokens):
                if not tokens:
                    raise SyntaxError("Unexpected end of expression.")
                
                token = tokens.pop(0)
                if token == '!':
                    if not tokens:
                        raise SyntaxError("Negation operator '!' must be followed by a variable or expression.")
                    return BooleanNot(operand=parse_factor(tokens))
                elif token == '(':
                    if not tokens:
                        raise SyntaxError("Mismatched parenthesis, expected closing ')'.")
                    expr = parse_expr(tokens)
                    if not tokens or tokens.pop(0) != ')':
                        raise SyntaxError("Mismatched parenthesis, expected closing ')'.")
                    return expr
                elif token in {'0', '1'}:
                    return BooleanConst(value=token)
                elif token.isalnum():
                    return BooleanVar(id=token)
                else:
                    raise SyntaxError(f"Unexpected token '{token}' in expression.")
            
            tokens = tokenise(expression)
            tree = parse_expr(tokens)
            if tokens:
                raise SyntaxError(f"Unexpected extra tokens in expression: {' '.join(tokens)}")
            
            print("\n--------------------------")
            print("Parsed Tree:")
            BooleanTreePrinter.print_tree(tree)
            print("--------------------------\n")
            return tree


        except SyntaxError as e:
            print(f"Syntax Error: {e}")
            return None
        except Exception as e:
            print(f"Unexpected error occurred while parsing: {e}")
            return None


    
############################################
# Group A Skill: Encapsulation and Abstraction
############################################


# Prints the abstract syntax tree (AST) in a structured format


class BooleanTreePrinter:
    @staticmethod
    def print_tree(node, level=0):
        indent = "  " * level
        if isinstance(node, BooleanVar):
            print(f"{indent}Var: {node.id}")
        elif isinstance(node, BooleanConst):
            print(f"{indent}Const: {node.value}")
        elif isinstance(node, BooleanNot):
            print(f"{indent}Not:")
            BooleanTreePrinter.print_tree(node.operand, level + 1)
        elif isinstance(node, BooleanAnd):
            print(f"{indent}And:")
            BooleanTreePrinter.print_tree(node.left, level + 1)
            BooleanTreePrinter.print_tree(node.right, level + 1)
        elif isinstance(node, BooleanOr):
            print(f"{indent}Or:")
            BooleanTreePrinter.print_tree(node.left, level + 1)
            BooleanTreePrinter.print_tree(node.right, level + 1)


# Tree-to-Algebra Converter

############################################
# Group A Skill: Tree-to-Algebra Conversion
############################################


# Converts the syntax tree back to boolean algebra


class TreeToAlgebraConverter:
    @staticmethod
    def tree_to_algebra(node):
        if isinstance(node, BooleanVar):
            return node.id
        elif isinstance(node, BooleanConst):
            return node.value
        elif isinstance(node, BooleanNot):
            return f"!({TreeToAlgebraConverter.tree_to_algebra(node.operand)})"
        elif isinstance(node, BooleanAnd):
            left = TreeToAlgebraConverter.tree_to_algebra(node.left)
            right = TreeToAlgebraConverter.tree_to_algebra(node.right)
            return f"({left} * {right})"
        elif isinstance(node, BooleanOr):
            left = TreeToAlgebraConverter.tree_to_algebra(node.left)
            right = TreeToAlgebraConverter.tree_to_algebra(node.right)
            return f"({left} + {right})"
        else:
            raise ValueError("Unknown node type")
        

    @staticmethod
    def validate_conversion(original_expr):
        parsed_tree = BooleanParser.parse(original_expr)
        if not parsed_tree:
            return False
        regenerated_expr = TreeToAlgebraConverter.tree_to_algebra(parsed_tree)
        return original_expr.replace(" ", "") == regenerated_expr.replace(" ", "")
        
# Simplifier Class


############################################
# Group A Skill: Boolean Algebra Simplification
############################################


# The main simplification class, applying all the simplification laws iteratively


class BooleanSimplifier:
    @staticmethod
    def simplify(node):
        def recursive_simplify(node):
            if isinstance(node, BooleanAnd):
                node.left = recursive_simplify(node.left)
                node.right = recursive_simplify(node.right)


                # Null Law: A * 0 = 0
                if isinstance(node.left, BooleanConst) and node.left.value == '0':
                    print("--------------------------")
                    print("Applying Null Law on tree below: A * 0 = 0")
                    BooleanTreePrinter.print_tree(node)
                    print("--------------------------")
                    return BooleanConst(value='0')
                if isinstance(node.right, BooleanConst) and node.right.value == '0':
                    print("--------------------------")
                    print("Applying Null Law on tree below: A * 0 = 0")
                    BooleanTreePrinter.print_tree(node)
                    print("--------------------------")
                    return BooleanConst(value='0')


                # Identity Law: A * 1 = A
                if isinstance(node.left, BooleanConst) and node.left.value == '1':
                    print("--------------------------")
                    print("Applying Identity Law on tree below: A * 1 = A")
                    BooleanTreePrinter.print_tree(node)
                    print("--------------------------")
                    return node.right
                if isinstance(node.right, BooleanConst) and node.right.value == '1':
                    print("--------------------------")
                    print("Applying Identity Law on tree below: A * 1 = A")
                    BooleanTreePrinter.print_tree(node)
                    print("--------------------------")
                    return node.left


                # Idempotent Law: A * A = A
                if isinstance(node.left, BooleanVar) and isinstance(node.right, BooleanVar):
                    if node.left.id == node.right.id:
                        print("--------------------------")
                        print("Applying Idempotent Law on tree below: A * A = A")
                        BooleanTreePrinter.print_tree(node)
                        print("--------------------------")
                        return node.left


                # Complement Law: A * !A = 0
                if (isinstance(node.left, BooleanVar) and isinstance(node.right, BooleanNot) and
                        isinstance(node.right.operand, BooleanVar) and node.left.id == node.right.operand.id):
                    print("--------------------------")
                    print("Applying Complement Law on tree below: A * !A = 0")
                    BooleanTreePrinter.print_tree(node)
                    print("--------------------------")
                    return BooleanConst(value='0')
                if (isinstance(node.right, BooleanVar) and isinstance(node.left, BooleanNot) and
                        isinstance(node.left.operand, BooleanVar) and node.right.id == node.left.operand.id):
                    print("--------------------------")
                    print("Applying Complement Law on tree below: A * !A = 0")
                    BooleanTreePrinter.print_tree(node)
                    print("--------------------------")
                    return BooleanConst(value='0')


                # Absorption Law: A * (A + B) = A
                if isinstance(node.right, BooleanOr) and isinstance(node.left, BooleanVar):
                    if isinstance(node.right.left, BooleanVar) and node.right.left.id == node.left.id:
                        print("--------------------------")
                        print("Applying Absorption Law on tree below: A * (A + B) = A")
                        BooleanTreePrinter.print_tree(node)
                        print("--------------------------")
                        return node.left
                if isinstance(node.left, BooleanOr) and isinstance(node.right, BooleanVar):
                    if isinstance(node.left.left, BooleanVar) and node.left.left.id == node.right.id:
                        print("--------------------------")
                        print("Applying Absorption Law on tree below: A * (A + B) = A")
                        BooleanTreePrinter.print_tree(node)
                        print("--------------------------")
                        return node.right


            elif isinstance(node, BooleanOr):
                node.left = recursive_simplify(node.left)
                node.right = recursive_simplify(node.right)


                # Null Law: A + 1 = 1
                if isinstance(node.left, BooleanConst) and node.left.value == '1':
                    print("--------------------------")
                    print("Applying Null Law on tree below: A + 1 = 1")
                    BooleanTreePrinter.print_tree(node)
                    print("--------------------------")
                    return BooleanConst(value='1')
                if isinstance(node.right, BooleanConst) and node.right.value == '1':
                    print("--------------------------")
                    print("Applying Null Law on tree below: A + 1 = 1")
                    BooleanTreePrinter.print_tree(node)
                    print("--------------------------")
                    return BooleanConst(value='1')


                # Identity Law: A + 0 = A
                if isinstance(node.left, BooleanConst) and node.left.value == '0':
                    print("--------------------------")
                    print("Applying Identity Law on tree below: A + 0 = A")
                    BooleanTreePrinter.print_tree(node)
                    print("--------------------------")
                    return node.right
                if isinstance(node.right, BooleanConst) and node.right.value == '0':
                    print("--------------------------")
                    print("Applying Identity Law on tree below: A + 0 = A")
                    BooleanTreePrinter.print_tree(node)
                    print("--------------------------")
                    return node.left


                # Idempotent Law: A + A = A
                if isinstance(node.left, BooleanVar) and isinstance(node.right, BooleanVar):
                    if node.left.id == node.right.id:
                        print("--------------------------")
                        print("Applying Idempotent Law on tree below: A + A = A")
                        BooleanTreePrinter.print_tree(node)
                        print("--------------------------")
                        return node.left


                # Complement Law: A + !A = 1
                if (isinstance(node.left, BooleanVar) and isinstance(node.right, BooleanNot) and
                        isinstance(node.right.operand, BooleanVar) and node.left.id == node.right.operand.id):
                    print("--------------------------")
                    print("Applying Complement Law on tree below: A + !A = 1")
                    BooleanTreePrinter.print_tree(node)
                    print("--------------------------")
                    return BooleanConst(value='1')
                if (isinstance(node.right, BooleanVar) and isinstance(node.left, BooleanNot) and
                        isinstance(node.left.operand, BooleanVar) and node.right.id == node.left.operand.id):
                    print("--------------------------")
                    print("Applying Complement Law on tree below: A + !A = 1")
                    BooleanTreePrinter.print_tree(node)
                    print("--------------------------")
                    return BooleanConst(value='1')


                # Absorption Law: A + (A * B) = A
                if isinstance(node.right, BooleanAnd) and isinstance(node.left, BooleanVar):
                    if isinstance(node.right.left, BooleanVar) and node.right.left.id == node.left.id:
                        print("--------------------------")
                        print("Applying Absorption Law on tree below: A + (A * B) = A")
                        BooleanTreePrinter.print_tree(node)
                        print("--------------------------")
                        return node.left
                if isinstance(node.left, BooleanAnd) and isinstance(node.right, BooleanVar):
                    if isinstance(node.left.left, BooleanVar) and node.left.left.id == node.right.id:
                        print("--------------------------")
                        print("Applying Absorption Law on tree below: A + (A * B) = A")
                        BooleanTreePrinter.print_tree(node)
                        print("--------------------------")
                        return node.right


            elif isinstance(node, BooleanNot):
                node.operand = recursive_simplify(node.operand)


                # Double Negation: !!A = A
                if isinstance(node.operand, BooleanNot):
                    print("--------------------------")
                    print("Applying Double Negation on tree below: !!A = A")
                    BooleanTreePrinter.print_tree(node)
                    print("--------------------------")
                    return node.operand.operand

                # !1 = 0 , !0 = 1
                if isinstance(node.operand, BooleanConst):
                    return BooleanConst(value='0' if node.operand.value == '1' else '1')


                # De Morgan's Laws
                if isinstance(node.operand, BooleanAnd):  # !(A * B) = !A + !B
                    print("--------------------------")
                    print("Applying De Morgan's Law on tree below: !(A * B) = !A + !B")
                    BooleanTreePrinter.print_tree(node)
                    print("--------------------------")
                    return BooleanOr(
                        left=BooleanNot(operand=node.operand.left),
                        right=BooleanNot(operand=node.operand.right)
                    )
                if isinstance(node.operand, BooleanOr):  # !(A + B) = !A * !B
                    print("--------------------------")
                    print("Applying De Morgan's Law on tree below: !(A + B) = !A * !B")
                    BooleanTreePrinter.print_tree(node)
                    print("--------------------------")
                    return BooleanAnd(
                        left=BooleanNot(operand=node.operand.left),
                        right=BooleanNot(operand=node.operand.right)
                    )

            return node

        def iterative_simplify(node):
            while True:
                simplified = recursive_simplify(node)
                if TreeToAlgebraConverter.tree_to_algebra(simplified) == TreeToAlgebraConverter.tree_to_algebra(node):
                    break
                node = simplified
            return node


        return iterative_simplify(node)


# Truth Table Generator


############################################
# Group B Skill: Truth Table Evaluation
############################################


# Evaluates all possible input combinations for a boolean expression


class TruthTableGenerator:
    @benchmark
    @staticmethod
    def generate_truth_table(expression):
        parsed_tree = BooleanParser.parse(expression)
        variables = sorted(TruthTableGenerator.get_variables(parsed_tree))
        table = []
        for values in itertools.product([0, 1], repeat=len(variables)):
            env = {var: str(value) for var, value in zip(variables, values)}
            result = TruthTableGenerator.evaluate(parsed_tree, env)
            table.append((values, result))
        return variables, table
    @staticmethod
    def get_variables(node):
        if isinstance(node, BooleanVar):
            return {node.id}
        elif isinstance(node, (BooleanAnd, BooleanOr)):
            return TruthTableGenerator.get_variables(node.left) | TruthTableGenerator.get_variables(node.right)
        elif isinstance(node, BooleanNot):
            return TruthTableGenerator.get_variables(node.operand)
        return set()
    @staticmethod
    def evaluate(node, env):
        if isinstance(node, BooleanVar):
            return int(env[node.id])
        elif isinstance(node, BooleanConst):
            return int(node.value)
        elif isinstance(node, BooleanAnd):
            return TruthTableGenerator.evaluate(node.left, env) and TruthTableGenerator.evaluate(node.right, env)
        elif isinstance(node, BooleanOr):
            return TruthTableGenerator.evaluate(node.left, env) or TruthTableGenerator.evaluate(node.right, env)
        elif isinstance(node, BooleanNot):
            return not TruthTableGenerator.evaluate(node.operand, env)
        else:
            raise ValueError("Unknown node type encountered during evaluation.")
        
# Main Interface
class BooleanAlgebraProgram:
    @staticmethod
    def re_enter_expression():
        while True:
            expression = input("Enter a Boolean algebra expression: ").strip()
            print(f"You entered: {expression}")
            confirm = input("Are you satisfied with this expression? (y/n): ").strip().lower()
            if confirm == 'y':
                return expression
            
    @staticmethod
    def export_truth_table(variables, table, filename="truth_table.csv"):
        with open(filename, "w", newline="") as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(variables + ["Result"])
            for values, result in table:
                writer.writerow(list(values) + [int(result)])
        print(f"Truth table exported to {filename}.")


    @staticmethod
    def dictionary():
        print("\nBoolean algebra laws with definitions:")
        print("1. Identity Law: A * 1 = A, A + 0 = A")
        print("2. Null Law: A * 0 = 0, A + 1 = 1")
        print("3. Idempotent Law: A * A = A, A + A = A")
        print("4. Complement Law: A * !A = 0, A + !A = 1")
        print("5. De Morgan's Laws: !(A * B) = !A + !B, !(A + B) = !A * !B")
        print("6. Absorption Law: A + (A * B) = A, A * (A + B) = A")
        input("Press Enter to return to the main menu.")
        
    @staticmethod
    def main():
        session_data = []
        print("Welcome to the Boolean Algebra Simplifier!")
        
        while True:
            try:
                print("\nMenu:")
                print("1. Simplify a Boolean expression")
                print("2. Generate a Truth Table")
                print("3. Generate a Random Expression")
                print("4. Dictionary")
                print("5. Load Previous Session")
                print("6. Exit")
                choice = input("Choose an option (1-6): ").strip()


                if choice == '1':
                    expression = BooleanAlgebraProgram.re_enter_expression()
                    parsed_tree = BooleanParser.parse(expression)

                    print("\n--------------------------")
                    print("Parsed Tree:")
                    BooleanTreePrinter.print_tree(parsed_tree)
                    print("--------------------------")

                    simplified_tree = BooleanSimplifier.simplify(parsed_tree)
                    simplified_expression = TreeToAlgebraConverter.tree_to_algebra(simplified_tree)
                    print("\nSimplified Expression:", simplified_expression)
                    print("--------------------------")
                    session_data.append({"expression": expression, "simplified": simplified_expression})
                    SessionLogger.log(expression, simplified_expression)

                elif choice == '2':
                    expression = BooleanAlgebraProgram.re_enter_expression()
                    variables, table = TruthTableGenerator.generate_truth_table(expression)

                    print("\n--------------------------")
                    print("Truth Table:")
                    print(" | ".join(variables + ["Result"]))
                    print("-" * (len(variables) * 4 + 8))
                    for values, result in table:
                        print(" | ".join(map(str, values + (int(result),))))
                    print("--------------------------")

                    export = input("Would you like to export this truth table? (y/n): ").strip().lower()
                    if export == 'y':
                        BooleanAlgebraProgram.export_truth_table(variables, table)

                elif choice == '3':
                    num_vars = int(input("Enter the number of variables: ").strip())
                    difficulty = input("Choose difficulty (easy, medium, hard): ").strip().lower()
                    variables = [chr(65 + i) for i in range(num_vars)]
                    random_expr = RandomExpressionGenerator.generate_random_expression(variables, difficulty)
                    print(f"\nGenerated Random Expression: {random_expr}")

                elif choice == '4':
                    BooleanAlgebraProgram.dictionary()

                elif choice == '5':
                    session_data = SessionLogger.load_session()

                elif choice == '6':
                    save = input("Would you like to save your current session? (y/n): ").strip().lower()
                    if save == 'y':
                        SessionLogger.save_session(session_data)
                    print("Goodbye!")
                    break

                else:
                    print("Invalid choice. Please enter a number between 1 and 6.")


            except ValueError:
                print("Error: Invalid input. Please enter a valid number.")
            except Exception as e:
                print(f"An unexpected error occurred: {e}")



if __name__ == "__main__":
    BooleanAlgebraProgram.main()