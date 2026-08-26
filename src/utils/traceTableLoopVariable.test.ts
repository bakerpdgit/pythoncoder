import { describe, expect, it } from 'vitest'

import type { TraceWorkerBatchMessage, TraceWorkerEvent, TraceWorkerVariableValue } from '../types/traceTable'
import { createTraceSession, mergeTraceBatch } from './traceLog'
import { adaptTraceWorkerBatch } from './traceWorkerAdapter'
import { projectTraceTable } from './traceTableProjection'

// A `for side in range(4)` loop must show every value it takes, 0 through 3.
// The final iteration is the one at risk: it is the last write before the
// loop's exhausting line event, and a packing bug there would silently drop it.

const int = (value: number) => ({ kind: 'primitive' as const, type: 'int', value, summary: String(value) })

function write(name: string, value: number): TraceWorkerVariableValue {
  return {
    name,
    sourceId: `global:${name}`,
    activationSourceId: 'global',
    callId: null,
    operation: 'write',
    changed: true,
    value: int(value),
  } as TraceWorkerVariableValue
}

function event(sequence: number, line: number, writes: TraceWorkerVariableValue[], iteration?: number): TraceWorkerEvent {
  return {
    sequence,
    type: 'statement',
    line,
    function: '<module>',
    callId: 0,
    callDepth: 0,
    stack: [{ callId: 0, function: '<module>' }],
    writes,
    variables: [],
    activeBindings: [],
    loopBoundary: iteration === undefined ? null : { loopId: 'L4', loopKind: 'for', iteration },
  } as unknown as TraceWorkerEvent
}

/** One `for side in range(4)` loop whose body also mutates an object column. */
function loopSession(withObjectColumn: boolean) {
  const events: TraceWorkerEvent[] = []
  let seq = 0
  for (let side = 0; side < 4; side += 1) {
    events.push(event(seq++, 4, [write('side', side)], side))
    if (withObjectColumn) {
      events.push(event(seq++, 5, [write('pos', side * 10)]))
      events.push(event(seq++, 6, [write('pos', side * 10 + 5)]))
    }
  }
  // The loop's exhausting line event: `side` keeps its last value, no new write.
  events.push(event(seq++, 4, [], 4))

  const message: TraceWorkerBatchMessage = {
    type: 'trace-table-batch',
    protocolVersion: 1,
    sessionId: 'trace-1',
    batchSequence: 0,
    catalogue: [],
    events,
  }
  let session = createTraceSession({ id: 'trace-1', source: { path: 'simulation.py' } })
  session = mergeTraceBatch(session, adaptTraceWorkerBatch(session, message, 'simulation.py'))
  return session
}

function sideColumn(session: ReturnType<typeof loopSession>, variableNames: string[], showLine: boolean) {
  const idOf = (n: string) =>
    (Object.values(session.variables).find(v => v.name === n) as { id: string } | undefined)?.id
  const sideId = idOf('side') as string
  const projection = projectTraceTable(session, {
    variableIds: variableNames.map(idOf).filter(Boolean) as string[],
    showLine,
  })
  return projection.rows.map(row => {
    const cell = row.cells[sideId]
    return cell?.state.status === 'value' ? (cell.state.value as { value?: unknown }).value : null
  })
}

describe('for-loop variable in the trace table', () => {
  it('shows every value including the last, in compact mode', () => {
    const values = sideColumn(loopSession(false), ['side'], false)
    expect(values.filter(v => v !== null)).toEqual([0, 1, 2, 3])
  })

  it('shows every value including the last, in every-line mode', () => {
    const values = sideColumn(loopSession(false), ['side'], true)
    expect(values.filter(v => v !== null)).toEqual([0, 1, 2, 3])
  })

  // A selected object column (a turtle, say) is written on every call, so it
  // spreads the loop variable across far more rows. The values must all still
  // be there — just further apart, which is what makes the last one easy to
  // miss above the fold.
  it('keeps every value when a busy object column spreads the rows out', () => {
    const values = sideColumn(loopSession(true), ['pos', 'side'], false)
    expect(values.filter(v => v !== null)).toEqual([0, 1, 2, 3])
    expect(values.indexOf(3)).toBeGreaterThan(values.indexOf(0) + 3)
  })
})
