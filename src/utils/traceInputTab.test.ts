import { describe, expect, it } from 'vitest'
import { beginTraceInputTabHandoff, completeTraceInputTabHandoff } from './traceInputTab'

describe('trace input tab handoff', () => {
  it('moves an interactive trace input to Console and remembers a Trace Table return', () => {
    expect(beginTraceInputTabHandoff('trace-table', true)).toEqual({
      nextTab: 'console',
      returnToTraceTable: true,
    })
    expect(completeTraceInputTabHandoff(true, true)).toBe('trace-table')
  })

  it('does not manufacture a return when Console was already active', () => {
    expect(beginTraceInputTabHandoff('console', true)).toEqual({
      nextTab: 'console',
      returnToTraceTable: false,
    })
    expect(completeTraceInputTabHandoff(false, true)).toBeNull()
  })

  it('does not return after the trace session has gone away', () => {
    expect(completeTraceInputTabHandoff(true, false)).toBeNull()
  })
})
