import type { BookTestCase, BookTestOutputReq, TesterRunOutput, TestReqResult, TestCaseResult, OverallTestResult } from '../types'

// ── Normalisation helpers ──────────────────────────────────────────────────

function normalise(text: string, flags: string): string {
  let s = text
  if (flags.includes('w')) s = s.replace(/\s+/g, ' ').trim()
  if (flags.includes('c')) s = s.toLowerCase()
  if (flags.includes('p')) s = s.replace(/[.,;:!?'"()\[\]{}\-]/g, '')
  return s
}

function safeMatch(text: string, pattern: string, flags: string, count: number): boolean {
  try {
    const nt = normalise(text, flags)
    const np = normalise(pattern, flags)
    const reFlags = flags.includes('c') ? 'i' : ''
    const re = new RegExp(np, reFlags)
    if (count === -1) return re.test(nt)
    const gre = new RegExp(np, flags.includes('c') ? 'gi' : 'g')
    return [...nt.matchAll(gre)].length === count
  } catch {
    return false
  }
}

function countOccurrences(text: string, pattern: string, flags: string): number {
  try {
    const nt = normalise(text, flags)
    const np = normalise(pattern, flags)
    const gre = new RegExp(np, flags.includes('c') ? 'gi' : 'g')
    return [...nt.matchAll(gre)].length
  } catch {
    return 0
  }
}

// ── Basic out-string → regex (for simple test cases) ──────────────────────

function buildBasicRegex(out: string): RegExp {
  // Converts basic out string to a regex.
  // Special tokens: .* → [\s\S]*?  and  \n → literal \n
  // Everything else is escaped.
  let pat = ''
  let i = 0
  while (i < out.length) {
    if (out[i] === '.' && out[i + 1] === '*') {
      pat += '[\\s\\S]*?'
      i += 2
    } else if (out[i] === '\\' && out[i + 1] === 'n') {
      pat += '\\n'
      i += 2
    } else {
      pat += out[i].replace(/[$()+?{}\[\]|^\\]/g, '\\$&')
      i++
    }
  }
  pat += '\\n*$'
  try {
    return new RegExp(pat)
  } catch {
    return /(?!)/
  }
}

// ── Requirement evaluator ──────────────────────────────────────────────────

function normalizeSvg(svg: string): string {
  return svg.replace(/\s+/g, ' ').trim()
}

function evalRequirement(
  req: BookTestOutputReq,
  output: string,
  sourceCode: string,
  statementResults: Record<string, string>,
  fileContents: Record<string, string | null>,
  turtleSvg: string,
  solutionTurtleSvgs: Record<string, string>,
): TestReqResult {
  const typ = req.typ ?? '+'
  const pattern = req.pattern ?? ''
  const ignore = req.ignore ?? ''
  const rawCount = req.count
  const count = rawCount !== undefined ? parseInt(String(rawCount), 10) : -1

  const rr: TestReqResult = { passed: false, typ, pattern, ignore, count }
  if (req.statement) rr.statement = req.statement
  if (req.filename) rr.filename = req.filename

  switch (typ) {
    case '+':
      rr.passed = safeMatch(output, pattern, ignore, count)
      break

    case '-':
      rr.passed = count === -1
        ? !safeMatch(output, pattern, ignore, -1)
        : countOccurrences(output, pattern, ignore) !== count
      break

    case 'c+':
      rr.passed = safeMatch(sourceCode, pattern, ignore, count)
      break

    case 'c-':
      rr.passed = count === -1
        ? !safeMatch(sourceCode, pattern, ignore, -1)
        : countOccurrences(sourceCode, pattern, ignore) !== count
      break

    case 'f+': {
      const fc = fileContents[req.filename ?? '']
      rr.passed = fc != null && safeMatch(fc, pattern, ignore, count)
      break
    }

    case 'f-': {
      const fc = fileContents[req.filename ?? '']
      rr.passed = fc == null || !safeMatch(fc, pattern, ignore, -1)
      break
    }

    case 's+': {
      const sr = statementResults[req.statement ?? '']
      rr.passed = sr !== undefined && !sr.startsWith('__ERR__:') && safeMatch(sr, pattern, ignore, count)
      break
    }

    case 's-': {
      const sr = statementResults[req.statement ?? '']
      rr.passed = sr === undefined || sr.startsWith('__ERR__:') || !safeMatch(sr, pattern, ignore, -1)
      break
    }

    case 't': {
      if (!turtleSvg || turtleSvg.trim().length === 0) { rr.passed = false; break }
      if (req.filename) {
        const expected = solutionTurtleSvgs[req.filename] ?? ''
        if (!expected) { rr.passed = false; break }
        rr.passed = normalizeSvg(turtleSvg) === normalizeSvg(expected)
      } else if (pattern) {
        rr.passed = safeMatch(turtleSvg, pattern, ignore, count)
      } else {
        rr.passed = true
      }
      break
    }

    default:
      rr.passed = false
  }

  return rr
}

// ── Public API ─────────────────────────────────────────────────────────────

export function evaluateTestCase(
  caseIndex: number,
  testCase: BookTestCase,
  runOut: TesterRunOutput,
  sourceCode: string,
): TestCaseResult {
  const reveal = testCase.reveal !== false
  const inputs: Array<string | number> = Array.isArray(testCase.in)
    ? testCase.in
    : testCase.in !== undefined && testCase.in !== ''
      ? [String(testCase.in)]
      : []
  const out = testCase.out ?? ''
  const { output, error, statementResults, fileContents, turtleSvg = '', solutionTurtleSvgs = {} } = runOut

  const reqResults: TestReqResult[] = []

  if (typeof out === 'string') {
    const re = buildBasicRegex(out)
    // Normalise trailing newlines so a single trailing \n is expected
    const textToTest = output.replace(/\n+$/, '') + '\n'
    reqResults.push({ passed: re.test(textToTest), typ: '+', pattern: out, ignore: '', count: -1 })
  } else if (Array.isArray(out)) {
    for (const req of out as BookTestOutputReq[]) {
      reqResults.push(evalRequirement(req, output, sourceCode, statementResults, fileContents, turtleSvg, solutionTurtleSvgs))
    }
  }

  const passed = reqResults.length > 0
    ? reqResults.every(r => r.passed)
    : !error

  return { caseIndex, passed, reveal, inputs, out, output, error: error ?? undefined, reqResults }
}

export function evaluateAll(
  tests: BookTestCase[],
  runOutputs: TesterRunOutput[],
  sourceCode: string,
): OverallTestResult {
  const results = tests.map((tc, i) =>
    evaluateTestCase(i, tc, runOutputs[i] ?? { output: '', error: 'No result', statementResults: {}, fileContents: {} }, sourceCode)
  )
  return { allPassed: results.every(r => r.passed), results }
}
