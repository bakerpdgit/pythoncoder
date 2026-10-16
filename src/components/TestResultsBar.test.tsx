import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TestResultsBar } from './TestResultsBar'
import type { OverallTestResult } from '../types'

// A failed `chart` requirement: what differs, in words, with the expected chart
// beside the student's (src/python/coder_charts.py sends both).

const PNG = 'data:image/png;base64,iVBORw0KGgo='

function chartFailure(differences: string[], pictures: boolean): OverallTestResult {
  const req = { typ: 'chart', filename: '20_two_days_sol.py' }
  return {
    allPassed: false,
    results: [{
      caseIndex: 0,
      passed: false,
      reveal: true,
      inputs: [],
      out: [req],
      output: '',
      reqResults: [{
        passed: false, typ: 'chart', pattern: '', ignore: '', count: -1, filename: req.filename,
        chart: {
          passed: false,
          message: differences.length === 1 ? differences[0] : `${differences.length} differences from the expected chart.`,
          differences,
          ...(pictures ? { expected: PNG, actual: PNG } : {}),
        },
      }],
    }],
  }
}

describe('TestResultsBar with a chart that differs', () => {
  it('lists each difference and shows the expected chart beside the student’s', () => {
    render(<TestResultsBar isRunning={false} status="" onClose={() => undefined} result={chartFailure([
      "The chart should have the title 'Temperature through the day'; yours has nothing.",
      "The line 'Monday' should have markers at its points.",
    ], true)} />)
    expect(screen.getByText('0/1 passed')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show test cases' }))
    expect(screen.getByText('same chart')).toBeTruthy()
    expect(screen.getByText(/should have the title 'Temperature through the day'/)).toBeTruthy()
    expect(screen.getByText(/should have markers at its points/)).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Expected chart' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Your chart' })).toBeTruthy()
    // The empty transcript of a program that only draws is not shown as "(no output)".
    expect(screen.queryByText('(no output)')).toBeNull()
  })

  it('shows the words alone for a plotly chart, which has no picture', () => {
    render(<TestResultsBar isRunning={false} status="" onClose={() => undefined} result={chartFailure([
      'Your program did not draw a chart. Build it, then call fig.show().',
    ], false)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show test cases' }))
    expect(screen.getByText(/did not draw a chart/)).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })
})
