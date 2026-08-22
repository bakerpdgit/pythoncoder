import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InspectorNode } from '../../types'
import type { TraceSession } from '../../types/traceTable'
import { triggerDownload } from '../../utils/download'
import { projectTraceTable, type TraceTableProjection, type TraceTableProjectionRow } from '../../utils/traceTableProjection'
import { resetTraceTablePreferencesForNewSession } from '../../utils/traceTablePreferences'
import { TraceTable } from './TraceTable'

vi.mock('../../utils/traceTableProjection', () => ({
  projectTraceTable: vi.fn(),
}))
vi.mock('../../utils/download', () => ({
  triggerDownload: vi.fn(),
  getBaseFileStem: (fileName: string, fallback: string) => (fileName || fallback).replace(/\.[^.]+$/, ''),
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
const download = vi.mocked(triggerDownload)

const makeRows = (
  count: number,
  options: { prefix?: string; functionName?: (index: number) => string } = {},
): TraceTableProjectionRow[] => Array.from({ length: count }, (_, index) => ({
  id: `${options.prefix ?? 'large'}-${index + 1}`,
  kind: 'line',
  sequence: index + 1,
  sequences: [index + 1],
  line: index + 1,
  cells: {},
  metadata: {
    functionName: options.functionName?.(index) ?? '<module>',
    callDepth: 0,
    callId: 1,
    callNumber: null,
  },
  annotations: [],
  teachingNote: null,
}))

const projectionWithRows = (rows: TraceTableProjectionRow[]): TraceTableProjection => ({
  columns: [{ variableId: 'first', label: 'x' }],
  metadataColumns: [],
  displayColumns: [{ kind: 'variable', key: 'variable:first', variableId: 'first', label: 'x' }],
  rows,
})

describe('TraceTable', () => {
  beforeEach(() => {
    localStorage.clear()
    download.mockClear()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    project.mockImplementation((_session, { showLine, variableIds, metaColumnIds = [], columnOrder = [] }) => ({
      columns: variableIds.map(variableId => ({
        variableId,
        label: variableId === 'first' ? 'x' : 'y',
      })),
      metadataColumns: metaColumnIds.map(id => ({ id, label: id })),
      displayColumns: columnOrder.map(key => key.startsWith('variable:')
        ? {
            kind: 'variable' as const,
            key,
            variableId: key.slice('variable:'.length),
            label: key.endsWith('first') ? 'x' : 'y',
          }
        : { kind: 'metadata' as const, key, metadataId: key, label: key }),
      rows: showLine
        ? [
            {
              id: 'line-7', sequence: 4, sequences: [4], line: 7, cells: {},
              metadata: { functionName: '<module>', callDepth: 0, callId: 1, callNumber: null },
            },
            {
              id: 'line-8', sequence: 5, sequences: [5], line: 8,
              metadata: { functionName: '<module>', callDepth: 0, callId: 1, callNumber: null },
              cells: {
                first: { variableId: 'first', callId: null, sequence: 5, state: { status: 'value', value: value(1) }, outcome: 'value' },
              },
            },
          ]
        : [{
            id: 'write-5', sequence: 5, sequences: [5],
            metadata: { functionName: '<module>', callDepth: 0, callId: 1, callNumber: null },
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
    const stickyHeader = table.querySelector('thead')
    expect(stickyHeader).toHaveClass('trace-table-sticky-header', 'sticky', 'z-30', 'isolate')
    for (const header of within(table).getAllByRole('columnheader')) {
      expect(header).toHaveClass('z-30', 'bg-slate-900')
    }
    expect(within(table).getByRole('columnheader', { name: 'Step' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'y' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'x' })).toBeInTheDocument()
    expect(project).toHaveBeenLastCalledWith(session, {
      variableIds: ['second', 'first'], metaColumnIds: [],
      columnOrder: ['variable:second', 'variable:first'], showLine: false, includeAnnotations: true,
    })
  })

  it('switches from compact rows to every-line rows', async () => {
    const user = userEvent.setup()
    render(<TraceTable session={session} />)

    expect(screen.getByRole('button', { name: 'Compact' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Every line' }))

    expect(project).toHaveBeenLastCalledWith(session, {
      variableIds: ['second', 'first'], metaColumnIds: [],
      columnOrder: ['variable:second', 'variable:first'], showLine: true, includeAnnotations: true,
    })
    expect(screen.getByRole('button', { name: 'Every line' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('columnheader', { name: 'Line' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Line 7' })).toBeInTheDocument()
  })

  it('applies and persists custom order and editable column headers', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<TraceTable session={session} />)

    await user.click(screen.getByRole('button', { name: 'Columns (2)' }))
    await user.click(screen.getByRole('button', { name: 'Move x up' }))
    const xHeader = screen.getByRole('textbox', { name: 'Column header for x' })
    await user.clear(xHeader)
    await user.type(xHeader, 'Current x')
    await user.click(screen.getByRole('button', { name: 'Apply columns' }))

    expect(project).toHaveBeenLastCalledWith(session, {
      variableIds: ['first', 'second'], metaColumnIds: [],
      columnOrder: ['variable:first', 'variable:second'], showLine: false, includeAnnotations: true,
    })
    const table = screen.getByRole('table', { name: 'Trace event history' })
    const headers = within(table).getAllByRole('columnheader').map(header => header.getAttribute('aria-label') ?? header.textContent)
    expect(headers).toEqual(['Step', 'Current x', 'y', 'Add variable column'])

    unmount()
    render(<TraceTable session={session} />)
    expect(project).toHaveBeenLastCalledWith(session, {
      variableIds: ['first', 'second'], metaColumnIds: [],
      columnOrder: ['variable:first', 'variable:second'], showLine: false, includeAnnotations: true,
    })
    expect(screen.getByRole('columnheader', { name: 'Current x' })).toBeInTheDocument()
  })

  it('interleaves selectable call metadata with variables and renders module context clearly', async () => {
    const user = userEvent.setup()
    render(<TraceTable session={session} />)

    await user.click(screen.getByRole('button', { name: 'Columns (2)' }))
    await user.click(screen.getByRole('checkbox', { name: /Call #.*stable invocation number/i }))
    await user.click(screen.getByRole('button', { name: 'Apply columns' }))

    expect(project).toHaveBeenLastCalledWith(session, {
      variableIds: ['second', 'first'], metaColumnIds: ['meta:call-number'],
      columnOrder: ['meta:call-number', 'variable:second', 'variable:first'], showLine: false, includeAnnotations: true,
    })
    const table = screen.getByRole('table', { name: 'Trace event history' })
    expect(within(table).getAllByRole('columnheader').map(header => header.getAttribute('aria-label') ?? header.textContent))
      .toEqual(['Step', 'Call #', 'y', 'x', 'Add variable column'])
    expect(within(table).getByRole('cell', { name: '—' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Columns (3)' }))
    expect(screen.getByRole('radio', { name: /Automatic/ })).toBeChecked()
  })

  it('restores row layout independently for each source', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<TraceTable session={session} />)
    await user.click(screen.getByRole('button', { name: 'Every line' }))
    unmount()

    const otherSession = { ...session, source: { filesystemId: 'other', path: 'main.py' } }
    const { unmount: unmountOther } = render(<TraceTable session={otherSession} />)
    expect(screen.getByRole('button', { name: 'Compact' })).toHaveAttribute('aria-pressed', 'true')
    unmountOther()

    render(<TraceTable session={session} />)
    expect(screen.getByRole('button', { name: 'Every line' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('reloads automatic discovery order immediately for a new same-source trace session', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TraceTable session={session} />)
    await user.click(screen.getByRole('button', { name: 'Columns (2)' }))
    await user.click(screen.getByRole('button', { name: 'Move x up' }))
    await user.click(screen.getByRole('button', { name: 'Apply columns' }))
    expect(project).toHaveBeenLastCalledWith(session, expect.objectContaining({ variableIds: ['first', 'second'] }))

    resetTraceTablePreferencesForNewSession(session.source)
    const nextSession = { ...session, id: 'next-table-session' }
    rerender(<TraceTable session={nextSession} />)

    await waitFor(() => expect(project).toHaveBeenLastCalledWith(nextSession, expect.objectContaining({
      variableIds: ['second', 'first'],
      columnOrder: ['variable:second', 'variable:first'],
    })))
    expect(screen.getByRole('columnheader', { name: 'y' })).toBeInTheDocument()
  })

  it('filters by function and call, toggles context, and exports only visible rows', async () => {
    const user = userEvent.setup()
    const clipboardWrite = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    project.mockReturnValue({
      columns: [{ variableId: 'first', label: 'x' }],
      metadataColumns: [],
      displayColumns: [{ kind: 'variable', key: 'variable:first', variableId: 'first', label: 'x' }],
      rows: [
        {
          id: 'call-1', stepNumber: 1, kind: 'event', sequence: 1, sequences: [1], line: 3, cells: {},
          metadata: { functionName: 'factorial', callDepth: 1, callId: 2, callNumber: 1 },
          annotations: [], teachingNote: 'Entered factorial (call #1).',
        },
        {
          id: 'call-2', stepNumber: 2, kind: 'line', sequence: 2, sequences: [2], line: 4, cells: {},
          metadata: { functionName: 'factorial', callDepth: 2, callId: 3, callNumber: 2 },
          annotations: [], teachingNote: 'For loop iteration 1.',
        },
        {
          id: 'helper', stepNumber: 3, kind: 'event', sequence: 3, sequences: [3], line: 9, cells: {},
          metadata: { functionName: 'helper', callDepth: 1, callId: 4, callNumber: 3 },
          annotations: [], teachingNote: 'Entered helper (call #3).',
        },
      ],
    })
    render(<TraceTable session={session} />)

    await user.selectOptions(screen.getByLabelText('Filter trace rows by function'), 'factorial')
    expect(screen.getByText((_content, element) => element?.tagName === 'P' && element.textContent?.includes('2 of 3 rows'))).toBeInTheDocument()
    expect(screen.queryByText('Entered helper (call #3).')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Filter trace rows by call'), '2')
    expect(screen.getByText((_content, element) => element?.tagName === 'P' && element.textContent?.includes('1 of 3 rows'))).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Download CSV' }))
    expect(download).toHaveBeenCalledWith(
      'main-trace.csv',
      expect.stringContaining('Step,Context,x\r\nStep 2,For loop iteration 1.,'),
      'text/csv;charset=utf-8',
    )

    await user.click(screen.getByRole('button', { name: 'Copy CSV' }))
    expect(clipboardWrite).toHaveBeenCalledWith(expect.stringContaining('For loop iteration 1.'))
    expect(await screen.findByRole('status')).toHaveTextContent('Trace table CSV copied.')

    await user.click(screen.getByRole('button', { name: 'Context' }))
    expect(project).toHaveBeenLastCalledWith(session, expect.objectContaining({ includeAnnotations: false }))
  })

  it('keeps the Context control available when hiding context removes every projected row', async () => {
    const user = userEvent.setup()
    project.mockImplementation((_session, options) => ({
      columns: [{ variableId: 'first', label: 'x' }],
      metadataColumns: [],
      displayColumns: [{ kind: 'variable', key: 'variable:first', variableId: 'first', label: 'x' }],
      rows: options.includeAnnotations ? [{
        id: 'entry', kind: 'event', sequence: 1, sequences: [1], line: 1, cells: {},
        metadata: { functionName: 'unused', callDepth: 1, callId: 2, callNumber: 1 },
        annotations: [], teachingNote: 'Entered unused (call #1).',
      }] : [],
    }))
    render(<TraceTable session={session} />)

    await user.click(screen.getByRole('button', { name: 'Context' }))
    expect(screen.getByRole('button', { name: 'Context' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('No variable writes were captured for this trace.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Context' }))
    expect(screen.getByText('Entered unused (call #1).')).toBeInTheDocument()
  })

  it('shows a visible error when the browser refuses clipboard access', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('clipboard blocked'))
    render(<TraceTable session={session} />)

    await user.click(screen.getByRole('button', { name: 'Copy CSV' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Could not copy trace table CSV.')
    expect(status).not.toHaveClass('sr-only')
  })

  it('clears filters that disappear after the projection changes', async () => {
    const user = userEvent.setup()
    project.mockImplementation((_session, options) => ({
      columns: [{ variableId: 'first', label: 'x' }],
      metadataColumns: [],
      displayColumns: [{ kind: 'variable', key: 'variable:first', variableId: 'first', label: 'x' }],
      rows: options.includeAnnotations ? [
        {
          id: 'factorial', kind: 'event', sequence: 1, sequences: [1], line: 1, cells: {},
          metadata: { functionName: 'factorial', callDepth: 2, callId: 3, callNumber: 2 },
          annotations: [], teachingNote: 'Entered factorial (call #2).',
        },
        {
          id: 'helper', kind: 'line', sequence: 2, sequences: [2], line: 8, cells: {},
          metadata: { functionName: 'helper', callDepth: 1, callId: 4, callNumber: 3 },
          annotations: [], teachingNote: null,
        },
      ] : [{
        id: 'helper', kind: 'line', sequence: 2, sequences: [2], line: 8, cells: {},
        metadata: { functionName: 'helper', callDepth: 1, callId: 4, callNumber: 3 },
        annotations: [], teachingNote: null,
      }],
    }))
    render(<TraceTable session={session} />)

    const functionSelect = screen.getByLabelText('Filter trace rows by function')
    const callSelect = screen.getByLabelText('Filter trace rows by call')
    await user.selectOptions(functionSelect, 'factorial')
    await user.selectOptions(callSelect, '2')
    await user.click(screen.getByRole('button', { name: 'Context' }))

    await waitFor(() => {
      expect(functionSelect).toHaveValue('')
      expect(callSelect).toHaveValue('')
    })
    expect(screen.queryByText('No trace rows match these filters.')).not.toBeInTheDocument()
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
      metadataColumns: [],
      displayColumns: [{ kind: 'variable', key: 'variable:first', variableId: 'first', label: 'x' }],
      rows: [{
        id: 'string-write', kind: 'line', sequence: 5, sequences: [5],
        metadata: { functionName: '<module>', callDepth: 0, callId: 1, callNumber: null },
        annotations: [], teachingNote: null,
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
    project.mockReturnValue({ columns: [], metadataColumns: [], displayColumns: [], rows: [] })
    render(<TraceTable session={{ ...session, events: [] }} />)

    expect(screen.getByRole('status')).toHaveTextContent('Run code to capture trace events.')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the compact session status and any trace error accessibly', () => {
    render(<TraceTable session={{ ...session, status: 'error', error: 'Python execution failed.' }} />)

    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Python execution failed.')
  })

  it('drags variable headers horizontally while keeping special columns pinned and non-removable', async () => {
    const user = userEvent.setup()
    render(<TraceTable session={session} />)
    await user.click(screen.getByRole('button', { name: 'Columns (2)' }))
    await user.click(screen.getByRole('checkbox', { name: /Call #.*stable invocation number/i }))
    await user.click(screen.getByRole('button', { name: 'Apply columns' }))

    const table = screen.getByRole('table', { name: 'Trace event history' })
    const callHeader = within(table).getByRole('columnheader', { name: 'Call #' })
    const xHeader = within(table).getByRole('columnheader', { name: 'x' })
    const yHeader = within(table).getByRole('columnheader', { name: 'y' })
    expect(callHeader).toHaveAttribute('data-pinned', 'true')
    expect(callHeader).toHaveAttribute('draggable', 'false')
    expect(screen.queryByRole('button', { name: 'Remove Call #' })).not.toBeInTheDocument()

    const dataTransfer = {
      effectAllowed: '',
      setData: vi.fn(),
      getData: vi.fn(() => 'first'),
    }
    fireEvent.dragStart(xHeader, { dataTransfer })
    fireEvent.dragOver(yHeader, { dataTransfer })
    fireEvent.drop(yHeader, { dataTransfer })

    expect(project).toHaveBeenLastCalledWith(session, expect.objectContaining({
      variableIds: ['first', 'second'],
      columnOrder: ['meta:call-number', 'variable:first', 'variable:second'],
    }))
    expect(within(table).getAllByRole('columnheader').map(header => header.getAttribute('aria-label') ?? header.textContent))
      .toEqual(['Step', 'Call #', 'x', 'y', 'Add variable column'])
  })

  it('removes a variable and quick-adds an introspected variable with an editable persisted heading', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<TraceTable session={session} />)
    await user.click(screen.getByRole('button', { name: 'Remove y' }))
    expect(screen.queryByRole('columnheader', { name: 'y' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add variable column' }))
    let dialog = screen.getByRole('dialog', { name: 'Add a trace column' })
    let expression = within(dialog).getByLabelText('Discovered variable expression')
    let heading = within(dialog).getByLabelText('Column header')
    await waitFor(() => expect(expression).toHaveFocus())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Add a trace column' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add variable column' })).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'Add variable column' }))
    dialog = screen.getByRole('dialog', { name: 'Add a trace column' })
    expression = within(dialog).getByLabelText('Discovered variable expression')
    heading = within(dialog).getByLabelText('Column header')
    await user.clear(expression)
    await user.type(expression, 'not_a_variable')
    await user.click(within(dialog).getByRole('button', { name: 'Add column' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Choose one of the available user variables.')

    await user.clear(expression)
    await user.type(expression, 'y')
    await user.clear(heading)
    await user.type(heading, 'Why')
    await user.click(within(dialog).getByRole('button', { name: 'Add column' }))
    expect(screen.getByRole('columnheader', { name: 'Why' })).toBeInTheDocument()
    expect(project).toHaveBeenLastCalledWith(session, expect.objectContaining({
      variableIds: ['first', 'second'],
      columnOrder: ['variable:first', 'variable:second'],
    }))

    unmount()
    render(<TraceTable session={session} />)
    expect(screen.getByRole('columnheader', { name: 'Why' })).toBeInTheDocument()
  })

  it('expands nested InspectorNode values by persisted display depth while retaining summary titles', async () => {
    const user = userEvent.setup()
    const nested: InspectorNode = {
      kind: 'sequence', type: 'list', length: 1,
      items: [{ label: '0', value: {
        kind: 'sequence', type: 'list', length: 1,
        items: [{ label: '0', value: value(7) }],
      } }],
    }
    project.mockReturnValue({
      columns: [{ variableId: 'first', label: 'x' }],
      metadataColumns: [],
      displayColumns: [{ kind: 'variable', key: 'variable:first', variableId: 'first', label: 'x' }],
      rows: [{
        id: 'nested', kind: 'line', sequence: 1, sequences: [1], line: 1,
        metadata: { functionName: '<module>', callDepth: 0, callId: 1, callNumber: null },
        annotations: [], teachingNote: null,
        cells: {
          first: { variableId: 'first', callId: null, sequence: 1, state: { status: 'value', value: nested }, value: nested, outcome: 'value', write: { variableId: 'first', callId: null, kind: 'assignment', changed: true, outcome: 'value', value: nested } },
        },
      }],
    })
    const { unmount } = render(<TraceTable session={session} />)
    const valueCell = screen.getByRole('cell', { name: 'list • 1 items' })
    expect(valueCell).toHaveAttribute('title', 'list • 1 items')

    await user.click(screen.getByRole('button', { name: 'Expand x' }))
    expect(valueCell).toHaveTextContent('list [list • 1 items]')
    expect(screen.getByRole('button', { name: 'Expand x' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contract x' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Expand x' }))
    expect(valueCell).toHaveTextContent('list [list [7]]')
    expect(screen.queryByRole('button', { name: 'Expand x' })).not.toBeInTheDocument()

    unmount()
    render(<TraceTable session={session} />)
    expect(screen.getByRole('cell', { name: 'list [list [7]]' })).toHaveAttribute('title', 'list • 1 items')
  })

  it('resizes variable columns with an accessible keyboard or drag handle and persists the width', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<TraceTable session={session} />)
    const handle = screen.getByRole('separator', { name: 'Resize x column' })
    expect(handle).toHaveAttribute('aria-valuemin', '96')
    expect(handle).toHaveAttribute('aria-valuemax', '480')
    await user.click(handle)
    await user.keyboard('{ArrowRight}')
    const resizedHandle = screen.getByRole('separator', { name: 'Resize x column' })
    expect(resizedHandle).toHaveAttribute('aria-valuenow', '176')

    fireEvent.mouseDown(resizedHandle, { clientX: 100 })
    fireEvent.mouseMove(window, { clientX: 150 })
    fireEvent.mouseUp(window, { clientX: 150 })
    expect(screen.getByRole('separator', { name: 'Resize x column' })).toHaveAttribute('aria-valuenow', '226')

    unmount()
    render(<TraceTable session={session} />)
    expect(screen.getByRole('separator', { name: 'Resize x column' })).toHaveAttribute('aria-valuenow', '226')
  })

  it('tail-follows and renders the newest row in an active trace without mounting the full history', async () => {
    project.mockImplementation(currentSession => projectionWithRows(makeRows(currentSession.events.length)))
    const activeSession = {
      ...session,
      status: 'recording' as const,
      events: Array.from({ length: 450 }, (_, index) => ({ ...session.events[0], sequence: index + 1 })),
    }
    const { rerender } = render(<TraceTable session={activeSession} />)
    const results = screen.getByLabelText('Trace table results')
    Object.defineProperties(results, {
      scrollHeight: { configurable: true, value: 5_000 },
      clientHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    })

    expect(screen.getAllByRole('rowheader')).toHaveLength(200)
    expect(screen.getByRole('rowheader', { name: 'Step 450' })).toBeInTheDocument()
    expect(screen.queryByRole('rowheader', { name: 'Step 1' })).not.toBeInTheDocument()
    rerender(<TraceTable session={{
      ...activeSession,
      events: [...activeSession.events, { ...session.events[0], sequence: 451 }],
    }} />)
    await waitFor(() => expect(results.scrollTop).toBe(5_000))
    expect(screen.getByRole('rowheader', { name: 'Step 451' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Follow newest' })).toHaveAttribute('aria-pressed', 'true')

    results.scrollTop = 100
    fireEvent.scroll(results)
    expect(screen.getByRole('button', { name: 'Follow newest' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('rowheader', { name: 'Step 451' })).toBeInTheDocument()
    expect(screen.queryByRole('rowheader', { name: 'Step 1' })).not.toBeInTheDocument()

    const extendedSession = {
      ...activeSession,
      events: Array.from({ length: 600 }, (_, index) => ({ ...session.events[0], sequence: index + 1 })),
    }
    rerender(<TraceTable session={extendedSession} />)
    expect(screen.getByRole('rowheader', { name: 'Step 451' })).toBeInTheDocument()
    expect(screen.queryByRole('rowheader', { name: 'Step 600' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Follow newest' }))
    expect(screen.getByRole('rowheader', { name: 'Step 600' })).toBeInTheDocument()
    rerender(<TraceTable session={{ ...extendedSession, status: 'completed' }} />)
    expect(screen.getByRole('rowheader', { name: 'Step 600' })).toBeInTheDocument()
    expect(screen.queryByRole('rowheader', { name: 'Step 1' })).not.toBeInTheDocument()
  })

  it('presents a retention limit as an explicit non-error terminal status', () => {
    const message = 'Trace event limit of 10,000 reached; execution stopped with all recorded history retained.'
    render(<TraceTable session={{
      ...session,
      status: 'limit-reached',
      error: message,
      retention: { eventLimit: 10_000, retainedEventCount: 10_000, droppedEventCount: 0, limitReached: true },
    }} />)

    const notice = screen.getByText(message)
    expect(notice).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Limit reached')).toBeInTheDocument()
  })

  it('incrementally renders thousands of rows while preserving a semantic table and complete CSV export', async () => {
    const user = userEvent.setup()
    project.mockReturnValue(projectionWithRows(makeRows(2_500)))
    render(<TraceTable session={session} />)

    const table = screen.getByRole('table', { name: 'Trace event history' })
    expect(within(table).getAllByRole('rowheader')).toHaveLength(200)
    expect(within(table).getByRole('columnheader', { name: 'Step' })).toHaveAttribute('scope', 'col')
    expect(within(table).getAllByRole('rowheader')[0]).toHaveAttribute('scope', 'row')
    expect(screen.getByText('Showing 200 of 2,500 matching rows.')).toHaveAttribute('aria-live', 'polite')
    expect(within(table).queryByRole('rowheader', { name: 'Step 201' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show 200 more rows' }))
    expect(within(table).getAllByRole('rowheader')).toHaveLength(400)
    expect(within(table).getByRole('rowheader', { name: 'Step 400' })).toBeInTheDocument()
    expect(screen.getByText('Showing 400 of 2,500 matching rows.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Download CSV' }))
    expect(download).toHaveBeenCalledTimes(1)
    const csv = download.mock.calls[0][1]
    expect(csv).toContain('Step 2500')
    expect(csv.split('\r\n')).toHaveLength(2_501)
  }, 10_000)

  it('resets an expanded window for filters, layout mode, and source changes', async () => {
    const user = userEvent.setup()
    const rows = makeRows(700, {
      functionName: index => index < 350 ? 'alpha' : 'beta',
    })
    project.mockReturnValue(projectionWithRows(rows))
    const { rerender } = render(<TraceTable session={session} />)

    await user.click(screen.getByRole('button', { name: 'Show 200 more rows' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(400)

    await user.selectOptions(screen.getByLabelText('Filter trace rows by function'), 'alpha')
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(200))
    expect(screen.getByText('Showing 200 of 350 matching rows.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show 150 more rows' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(350)

    await user.click(screen.getByRole('button', { name: 'Every line' }))
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(200))
    await user.click(screen.getByRole('button', { name: 'Show 150 more rows' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(350)

    rerender(<TraceTable session={{ ...session, source: { path: 'lesson-two.py' } }} />)
    await waitFor(() => expect(screen.getAllByRole('rowheader')).toHaveLength(200))
    expect(screen.getByLabelText('Filter trace rows by function')).toHaveValue('')
    expect(screen.getByText('Showing 200 of 700 matching rows.')).toBeInTheDocument()
  }, 10_000)

  it('keeps an expanded row window when a running trace appends events', async () => {
    const user = userEvent.setup()
    project.mockImplementation(currentSession => projectionWithRows(makeRows(currentSession.events.length)))
    const runningSession = {
      ...session,
      status: 'recording' as const,
      events: Array.from({ length: 450 }, (_, index) => ({
        ...session.events[0],
        sequence: index + 1,
      })),
    }
    const { rerender } = render(<TraceTable session={runningSession} />)

    await user.click(screen.getByRole('button', { name: 'Show 200 earlier rows' }))
    expect(screen.getAllByRole('rowheader')).toHaveLength(400)

    rerender(<TraceTable session={{
      ...runningSession,
      events: Array.from({ length: 600 }, (_, index) => ({
        ...session.events[0],
        sequence: index + 1,
      })),
    }} />)

    expect(screen.getAllByRole('rowheader')).toHaveLength(400)
    expect(screen.getByText('Showing latest 400 of 600 matching rows.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show 200 earlier rows' })).toBeInTheDocument()
  }, 10_000)
})
