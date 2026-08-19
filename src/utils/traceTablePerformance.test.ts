import { describe, expect, it } from 'vitest'
import type {
  TraceExecutionEvent,
  TraceSession,
  TraceVariableDefinition,
  TraceWorkerBatchMessage,
  TraceWorkerEvent,
} from '../types/traceTable'
import {
  createTraceSession,
  globalTraceVariableId,
  maybeAppendTraceCheckpoint,
  mergeTraceBatch,
} from './traceLog'
import {
  deriveTraceTableFilterOptions,
  exportTraceTableCsv,
  filterTraceTableRows,
} from './traceTableExport'
import { projectTraceTable } from './traceTableProjection'
import { traceTableVariableColumnKey } from './traceTablePreferences'
import { adaptTraceWorkerBatch } from './traceWorkerAdapter'

const EVENT_COUNT = 10_000
const PERFORMANCE_BUDGET_MS = 2_500

function primitive(value: number) {
  return { kind: 'primitive' as const, type: 'int', value, summary: String(value) }
}

function largeSession(eventCount = EVENT_COUNT): { session: TraceSession; variableIds: string[] } {
  const variableIds = Array.from({ length: 8 }, (_, index) => globalTraceVariableId(`value_${index}`))
  const variables = Object.fromEntries(variableIds.map((id, index): [string, TraceVariableDefinition] => [id, {
    id,
    name: `value_${index}`,
    defaultLabel: `value_${index}`,
    scope: { kind: 'global' },
    firstSeenSequence: index + 1,
    lastSeenSequence: eventCount,
    category: 'value',
  }]))
  const events: TraceExecutionEvent[] = Array.from({ length: eventCount }, (_, index) => {
    const sequence = index + 1
    const variableId = variableIds[index % variableIds.length]
    const value = primitive(sequence)
    return {
      sequence,
      kind: 'line-completed',
      location: { path: '/main.py', line: (index % 20) + 1 },
      callId: 1,
      callStack: [1],
      functionName: '<module>',
      ...(index % 10 === 0
        ? { loopIteration: { loopId: 'for:1', iteration: Math.floor(index / 10) + 1, depth: 0 } }
        : {}),
      bindingDeltas: [{ variableId, callId: null, state: { status: 'value', value } }],
      writes: [{
        variableId,
        callId: null,
        kind: index % 10 === 0 ? 'loop-target' : 'assignment',
        changed: true,
        outcome: 'value',
        value,
      }],
    }
  })

  return {
    variableIds,
    session: {
      id: 'large-trace',
      source: { path: '/main.py', filesystemId: 'default' },
      startedAt: 1,
      status: 'completed',
      truncated: false,
      variables,
      calls: {
        1: {
          id: 1,
          parentId: null,
          qualifiedName: '<module>',
          functionName: '<module>',
          depth: 0,
          startedAtSequence: 1,
          endedAtSequence: eventCount,
          outcome: 'returned',
        },
      },
      events,
      checkpoints: [],
      lastBatchSequence: Math.ceil(eventCount / 48) - 1,
    },
  }
}

describe('trace table large-session performance', () => {
  it('incrementally adapts and checkpoints 10,000 recorder events within a generous CI budget', () => {
    let session = createTraceSession({
      id: 'incremental-large-trace',
      source: { path: '/main.py', filesystemId: 'default' },
      startedAt: 1,
      eventLimit: EVENT_COUNT,
    })
    const source = {
      sourceId: 'global:value',
      activationSourceId: 'global:value',
      name: 'value',
      scope: 'global' as const,
      function: '<module>',
      callId: null,
      defaultLabel: 'value',
    }
    const rawEvents: TraceWorkerEvent[] = Array.from({ length: EVENT_COUNT }, (_, sequence) => {
      const value = primitive(sequence)
      return {
        sequence,
        type: 'statement',
        line: (sequence % 20) + 1,
        function: '<module>',
        qualifiedFunction: '<module>',
        callId: 1,
        callDepth: 0,
        stack: [{ callId: 1, function: '<module>', qualifiedFunction: '<module>', depth: 0 }],
        writes: [{ ...source, value, operation: 'write', changed: true }],
        variables: [{ ...source, value }],
        activeBindings: ['global:value'],
      }
    })
    const startedAt = performance.now()
    for (let offset = 0, batchSequence = 0; offset < rawEvents.length; offset += 48, batchSequence += 1) {
      const events = rawEvents.slice(offset, offset + 48)
      const message: TraceWorkerBatchMessage = {
        type: 'trace-table-batch',
        protocolVersion: 1,
        sessionId: session.id,
        batchSequence,
        events,
        catalogue: offset === 0 ? [{ ...source, firstSeenSequence: 0 }] : [],
      }
      session = maybeAppendTraceCheckpoint(mergeTraceBatch(
        session,
        adaptTraceWorkerBatch(session, message, '/main.py'),
      ))
    }
    const elapsed = performance.now() - startedAt

    expect(session.events).toHaveLength(EVENT_COUNT)
    expect(session.checkpoints.length).toBeGreaterThan(0)
    expect(session.retention).toMatchObject({
      eventLimit: EVENT_COUNT,
      retainedEventCount: EVENT_COUNT,
      droppedEventCount: 0,
    })
    expect(elapsed).toBeLessThan(PERFORMANCE_BUDGET_MS)
  })

  it('projects, filters, and exports 10,000 every-line events within a generous CI budget', () => {
    const { session, variableIds } = largeSession()
    const startedAt = performance.now()
    const projection = projectTraceTable(session, {
      variableIds,
      metaColumnIds: ['meta:function', 'meta:call-depth'],
      columnOrder: [
        'meta:function',
        ...variableIds.map(traceTableVariableColumnKey),
        'meta:call-depth',
      ],
      showLine: true,
      includeAnnotations: true,
    })
    const options = deriveTraceTableFilterOptions(projection)
    const rows = filterTraceTableRows(projection.rows, { functionName: '<module>' })
    const csv = exportTraceTableCsv(projection, {
      rows,
      leadingColumn: 'line',
      includeTeachingNote: true,
    })
    const elapsed = performance.now() - startedAt

    expect(projection.rows).toHaveLength(EVENT_COUNT)
    expect(options.functions).toEqual([{ value: '<module>', label: '<module>', rowCount: EVENT_COUNT }])
    expect(rows).toHaveLength(EVENT_COUNT)
    expect(csv.split('\r\n')).toHaveLength(EVENT_COUNT + 1)
    expect(elapsed).toBeLessThan(PERFORMANCE_BUDGET_MS)
  })

  it('packs the same 10,000 events in compact mode without losing the final write', () => {
    const { session, variableIds } = largeSession()
    const startedAt = performance.now()
    const projection = projectTraceTable(session, {
      variableIds,
      columnOrder: variableIds.map(traceTableVariableColumnKey),
      showLine: false,
      includeAnnotations: false,
    })
    const elapsed = performance.now() - startedAt
    const finalVariableId = variableIds[(EVENT_COUNT - 1) % variableIds.length]

    expect(projection.rows.length).toBeGreaterThan(1_000)
    expect(projection.rows.at(-1)?.cells[finalVariableId]?.value).toEqual(primitive(EVENT_COUNT))
    expect(elapsed).toBeLessThan(PERFORMANCE_BUDGET_MS)
  })
})
