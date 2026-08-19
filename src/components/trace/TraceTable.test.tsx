import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InspectorNode } from '../../types'
import type { TraceSession } from '../../types/traceTable'
import { projectTraceTable } from '../../utils/traceTableProjection'
import { TraceTable } from './TraceTable'

vi.mock('../../utils/traceTableProjection', () => ({
  projectTraceTable: vi.fn(),
}))

const value = (number: number) => ({ kind: 'primitive' as const, type: 'int', value: number })

const session: TraceSession = {
  id: 'table-session',
  source: { path: 'main.py' },
  startedAt: 1,
  status: 'completed',
  truncated: false,
  variables: {
    first: {
      id: 'first', name: 'x', defaultLabel: 'x', scope: { kind: 'global' }, firstSeenSequence: 4, lastSeenSequence: 5,
    },
    second: {
      id: 'second', name: 'y', defaultLabel: 'y', scope: { kind: 'global' }, firstSeenSequence: 2, lastSeenSequence: 5,
    },
  },
  calls: {},
  events: [{
    sequence: 5,
    kind: 'line-completed',
    location: { path: 'main.py', line: 8 },
    callId: 1,
    callStack: [1],
    functionName: '<module>',
    bindingDeltas: [],
    writes: [],
  }],
  checkpoints: [],
  lastBatchSequence: 0,
}

const project = vi.mocked(projectTraceTable)

describe('TraceTable', () => {
  beforeEach(() => {
    project.mockImplementation((_session, { showLine }) => ({
      columns: [
        { variableId: 'second', label: 'y' },
        { variableId: 'first', label: 'x' },
      ],
      rows: showLine
        ? [
            { id: 'line-7', sequences: [4], line: 7, cells: {} },
            {
              id: 'line-8', sequences: [5], line: 8,
              cells: {
                first: { variableId: 'first', callId: null, sequence: 5, state: { status: 'value', value: value(1) }, outcome: 'value' },
              },
            },
          ]
        : [{
            id: 'write-5', sequences: [5],
            cells: {
              // An explicit write still belongs in the table even if it kept the old value.
              first: { variableId: 'first', callId: null, sequence: 5, state: { status: 'value', value: value(1) }, outcome: 'value' },
            },
          }],
    }) as ReturnType<typeof projectTraceTable>)
  })

  it('uses a labelled semantic table and defaults columns to discovery order', () => {
    render(<TraceTable session={session} />)

    const table = screen.getByRole('table', { name: 'Trace event history' })
    expect(within(table).getByRole('columnheader', { name: 'Step' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'y' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'x' })).toBeInTheDocument()
    expect(project).toHaveBeenLastCalledWith(session, { variableIds: ['second', 'first'], showLine: false })
  })

  it('switches from compact rows to every-line rows', async () => {
    const user = userEvent.setup()
    render(<TraceTable session={session} />)

    expect(screen.getByRole('button', { name: 'Compact' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Every line' }))

    expect(project).toHaveBeenLastCalledWith(session, { variableIds: ['second', 'first'], showLine: true })
    expect(screen.getByRole('button', { name: 'Every line' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('columnheader', { name: 'Line' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Line 7' })).toBeInTheDocument()
  })

  it('keeps untouched cells blank while rendering an explicit same-value write', () => {
    render(<TraceTable session={session} />)

    expect(screen.getByRole('cell', { name: 'y: no write' })).toBeEmptyDOMElement()
    expect(screen.getByRole('cell', { name: '1' })).toHaveTextContent('1')
  })

  it('uses the worker Python string summary without adding a second pair of quotes', () => {
    const stringNode: InspectorNode = { kind: 'primitive', type: 'str', value: 'hello', summary: "'hello'" }
    project.mockReturnValue({
      columns: [{ variableId: 'first', label: 'x' }],
      rows: [{
        id: 'string-write', sequence: 5, sequences: [5], metadata: {},
        cells: {
          first: {
            variableId: 'first', callId: null, sequence: 5,
            state: { status: 'value', value: stringNode }, value: stringNode,
            outcome: 'value',
            write: { variableId: 'first', callId: null, kind: 'assignment', changed: true, outcome: 'value', value: stringNode },
          },
        },
      }],
    } as ReturnType<typeof projectTraceTable>)

    render(<TraceTable session={session} />)

    expect(screen.getByRole('cell', { name: "'hello'" })).toHaveTextContent(/^'hello'$/)
  })

  it('shows an empty-state message before a run has events', () => {
    project.mockReturnValue({ columns: [], rows: [] } as ReturnType<typeof projectTraceTable>)
    render(<TraceTable session={{ ...session, events: [] }} />)

    expect(screen.getByRole('status')).toHaveTextContent('Run code to capture trace events.')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the compact session status and any trace error accessibly', () => {
    render(<TraceTable session={{ ...session, status: 'error', error: 'Python execution failed.' }} />)

    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Python execution failed.')
  })
})
