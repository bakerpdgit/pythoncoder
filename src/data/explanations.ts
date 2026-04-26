export const EXPLANATIONS: Record<string, string> = {
  Main: 'Sets up the number game. It chooses training or random mode, prepares the target list and available numbers, then starts PlayGame.',
  PlayGame: 'Runs the main game loop. Each turn it displays the targets and available numbers, accepts an arithmetic expression, checks it, updates the score, and advances the target conveyor.',
  CheckIfUserInputEvaluationIsATarget: 'Evaluates the expression in RPN form and checks whether the result matches any live target. Matching targets are replaced with -1 and the score increases.',
  RemoveNumbersUsed: 'Converts the original infix expression back into tokens and removes any numbers that were consumed from NumbersAllowed.',
  UpdateTargets: 'Shifts every target one place to the left. In training mode it duplicates the last value; otherwise it appends a fresh random target.',
  CheckNumbersUsedAreAllInNumbersAllowed: "Verifies that each numeric token in the user's RPN expression is available in the current NumbersAllowed list, respecting duplicates.",
  CheckValidNumber: 'Checks whether a token is a positive integer string within the allowed maximum value.',
  DisplayState: 'Prints the current targets, the available numbers, and the running score for the turn.',
  DisplayScore: 'Outputs the current score and leaves blank lines to space out the console display.',
  DisplayNumbersAllowed: 'Prints the five currently available numbers that the player may use in an expression.',
  DisplayTargets: 'Prints the 1D target conveyor, showing blank cells wherever a target has already been cleared.',
  ConvertToRPN: "Converts the user's infix arithmetic expression into Reverse Polish Notation using operator precedence rules.",
  EvaluateRPN: 'Processes the RPN token list with a stack, applying operators until a single numeric result remains. Non-integer final values score as invalid and return -1.',
  GetNumberFromUserInput: 'Reads consecutive digits from the expression to build the next operand and returns the updated scan position.',
  CheckIfUserInputValid: 'Uses a regular expression to ensure the expression alternates number, operator, number in a valid infix pattern.',
  GetTarget: 'Generates a random target value within the configured maximum.',
  GetNumber: 'Generates a random number within the configured maximum number range.',
  CreateTargets: 'Builds the starting target conveyor with five blank slots followed by random live targets.',
  FillNumbers: 'Refills NumbersAllowed back to five numbers. Training mode always returns the fixed demonstration set [2, 3, 2, 8, 512].',
}

export const getExplanation = (func: string, cls = ''): string => {
  const qualifiedName = cls ? `${cls}.${func}` : func
  if (EXPLANATIONS[qualifiedName]) return EXPLANATIONS[qualifiedName]
  if (EXPLANATIONS[func]) return EXPLANATIONS[func]
  return `Executing ${qualifiedName} ...`
}

export const getDefinitionKey = (func: string, cls = ''): string =>
  cls ? `${cls}.${func}` : func
