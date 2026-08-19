import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TraceVariableDefinition } from '../../types/traceTable'
import { TraceTableColumnDesigner, type TraceTableColumnDesignerProps } from './TraceTableColumnDesigner'

const score: TraceVariableDefinition = {
  id: 'global:score',
  name: 'score',
  defaultLabel: 'Score',
  scope: { kind: 'global' },
  firstSeenSequence: 1,
  lastSeenSequence: 8,
  category: 'value',
}

const math: TraceVariableDefinition = {
  id: 'global:math',
  name: 'math',
  defaultLabel: 'math',
  scope: { kind: 'global' },
  firstSeenSequence: 2,
  lastSeenSequence: 8,
  category: 'module',
}

const factorialN: TraceVariableDefinition = {
  id: 'local:factorial:n',
  name: 'n',
  defaultLabel: 'n',
  scope: { kind: 'local', owner: 'factorial', functionName: 'factorial' },
  firstSeenSequence: 3,
  lastSeenSequence: 8,
  category: 'value',
}

const playerSelf: TraceVariableDefinition = {
  id: 'local:Player.move:self',
  name: 'self',
  defaultLabel: 'self',
  scope: { kind: 'local', owner: 'Player.move', functionName: 'move', className: 'Player' },
  firstSeenSequence: 4,
  lastSeenSequence: 8,
  category: 'value',
}

const availableVariables = [score, math, factorialN, playerSelf]

const renderDesigner = (overrides: Partial<TraceTableColumnDesignerProps> = {}) => {
  const onApply = vi.fn()
  const onClose = vi.fn()
  const props: TraceTableColumnDesignerProps = {
    open: true,
    availableVariables,
    selectedVariableIds: [score.id],
    aliases: {},
    autoSelect: false,
    onApply,
    onClose,
    ...overrides,
  }
  return { ...render(<TraceTableColumnDesigner {...props} />), onApply, onClose }
}

describe('TraceTableColumnDesigner', () => {
  it('is an accessible dialog, focuses search, and groups and searches the complete catalogue', async () => {
    const user = userEvent.setup()
    renderDesigner()

    const dialog = screen.getByRole('dialog', { name: 'Design trace table columns' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription(/left-to-right order/i)

    const search = screen.getByRole('searchbox', { name: 'Search available columns' })
    expect(search).toHaveFocus()
    const available = screen.getByRole('region', { name: 'Available columns' })
    expect(within(available).getByText('Call information')).toBeInTheDocument()
    expect(within(available).getByRole('checkbox', { name: /Function.*executing for this row/i })).toBeInTheDocument()
    expect(within(available).getByRole('checkbox', { name: /Call depth.*module is depth 0/i })).toBeInTheDocument()
    expect(within(available).getByRole('checkbox', { name: /Call #.*recursive and repeated calls/i })).toBeInTheDocument()
    expect(within(available).getByText('Globals')).toBeInTheDocument()
    expect(within(available).getByText('Locals — factorial')).toBeInTheDocument()
    expect(within(available).getByText('Locals — Player.move · move')).toBeInTheDocument()
    expect(within(available).getByRole('checkbox', { name: /math.*global scope/i })).toBeInTheDocument()
    expect(within(available).getByText('Default header: Score · Global scope')).toBeInTheDocument()

    await user.type(search, 'factorial')

    expect(within(available).getByRole('checkbox', { name: /n.*local to factorial/i })).toBeInTheDocument()
    expect(within(available).queryByRole('checkbox', { name: /score/i })).not.toBeInTheDocument()
    expect(within(available).queryByRole('checkbox', { name: /self/i })).not.toBeInTheDocument()
  })

  it('adds and removes variables with checkboxes and supports All and Clear', async () => {
    const user = userEvent.setup()
    renderDesigner()

    const available = screen.getByRole('region', { name: 'Available columns' })
    const selected = screen.getByRole('region', { name: 'Selected columns' })
    await user.click(within(available).getByRole('checkbox', { name: /n.*local to factorial/i }))
    expect(within(selected).getByText('2 selected · left to right')).toBeInTheDocument()

    await user.click(within(selected).getByRole('button', { name: 'Remove Score' }))
    expect(within(available).getByRole('checkbox', { name: /score.*global scope/i })).not.toBeChecked()
    expect(within(selected).getByText('1 selected · left to right')).toBeInTheDocument()

    await user.click(within(available).getByRole('button', { name: 'Clear' }))
    expect(within(selected).getByText('No columns selected. Choose columns from the available list.')).toBeInTheDocument()

    await user.click(within(available).getByRole('button', { name: 'All' }))
    expect(within(selected).getByText('7 selected · left to right')).toBeInTheDocument()
    expect(within(available).getAllByRole('checkbox')).toHaveLength(7)
    within(available).getAllByRole('checkbox').forEach(checkbox => expect(checkbox).toBeChecked())
  })

  it('reorders columns, edits headers, and applies the ordered result', async () => {
    const user = userEvent.setup()
    const { onApply } = renderDesigner({ selectedVariableIds: [score.id, factorialN.id] })

    await user.click(screen.getByRole('button', { name: 'Move n left' }))
    const header = screen.getByRole('textbox', { name: 'Column header for n' })
    await user.clear(header)
    await user.type(header, 'Input value')
    await user.click(screen.getByRole('button', { name: 'Apply columns' }))

    expect(onApply).toHaveBeenCalledWith({
      autoSelect: false,
      variableIds: [factorialN.id, score.id],
      metaColumnIds: [],
      columnOrder: [`variable:${factorialN.id}`, `variable:${score.id}`],
      aliases: { [`variable:${factorialN.id}`]: 'Input value' },
    })
  })

  it('selects, interleaves, aliases, and removes call metadata like other columns', async () => {
    const user = userEvent.setup()
    const { onApply } = renderDesigner({
      selectedVariableIds: [score.id, factorialN.id],
      selectedColumnOrder: [`variable:${score.id}`, `variable:${factorialN.id}`],
    })
    const available = screen.getByRole('region', { name: 'Available columns' })

    await user.click(within(available).getByRole('checkbox', { name: /Function.*executing for this row/i }))
    await user.click(within(available).getByRole('checkbox', { name: /Call depth.*module is depth 0/i }))
    await user.click(within(available).getByRole('checkbox', { name: /Call #.*recursive and repeated calls/i }))
    await user.click(screen.getByRole('button', { name: 'Move Function left' }))
    await user.click(screen.getByRole('button', { name: 'Move Function left' }))
    await user.click(screen.getByRole('button', { name: 'Move Call # left' }))
    await user.click(screen.getByRole('button', { name: 'Remove Call depth' }))

    const callNumberHeader = screen.getByRole('textbox', { name: 'Column header for Call #' })
    await user.clear(callNumberHeader)
    await user.type(callNumberHeader, 'Invocation')
    await user.click(screen.getByRole('button', { name: 'Apply columns' }))

    expect(onApply).toHaveBeenCalledWith({
      autoSelect: false,
      variableIds: [score.id, factorialN.id],
      metaColumnIds: ['meta:function', 'meta:call-number'],
      columnOrder: [
        'meta:function',
        `variable:${score.id}`,
        `variable:${factorialN.id}`,
        'meta:call-number',
      ],
      aliases: { 'meta:call-number': 'Invocation' },
    })
  })

  it('keeps automatic variable discovery active while metadata is selected and arranged', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const onClose = vi.fn()
    const { rerender } = render(
      <TraceTableColumnDesigner
        open
        availableVariables={[score]}
        selectedVariableIds={[score.id]}
        selectedColumnOrder={[`variable:${score.id}`]}
        aliases={{}}
        autoSelect
        onApply={onApply}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: /Function.*executing for this row/i }))
    await user.click(screen.getByRole('button', { name: 'Move Function left' }))
    expect(screen.getByRole('radio', { name: /Automatic.*New runtime variables/i })).toBeChecked()

    rerender(
      <TraceTableColumnDesigner
        open
        availableVariables={[score, math]}
        selectedVariableIds={[score.id, math.id]}
        selectedColumnOrder={[`variable:${score.id}`, 'meta:function', `variable:${math.id}`]}
        aliases={{}}
        autoSelect
        onApply={onApply}
        onClose={onClose}
      />,
    )
    expect(screen.getByRole('checkbox', { name: /math.*global scope/i })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Apply columns' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      autoSelect: true,
      metaColumnIds: ['meta:function'],
      columnOrder: ['meta:function', `variable:${score.id}`, `variable:${math.id}`],
    }))
  })

  it('toggles automatic selection and Reset restores all incoming settings', async () => {
    const user = userEvent.setup()
    const { onApply } = renderDesigner({ aliases: { [score.id]: 'Points' } })

    await user.click(screen.getByRole('radio', { name: /Automatic.*New runtime variables/i }))
    await user.click(screen.getByRole('checkbox', { name: /n.*local to factorial/i }))
    await user.clear(screen.getByRole('textbox', { name: 'Column header for Score' }))
    await user.type(screen.getByRole('textbox', { name: 'Column header for Score' }), 'Changed')
    await user.click(screen.getByRole('button', { name: 'Reset' }))

    expect(screen.getByRole('radio', { name: /Custom.*Only columns/i })).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Column header for Score' })).toHaveValue('Points')
    expect(screen.getByRole('checkbox', { name: /n.*local to factorial/i })).not.toBeChecked()
    expect(screen.getByText('1 selected · left to right')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Apply columns' }))
    expect(onApply).toHaveBeenCalledWith({
      autoSelect: false,
      variableIds: [score.id],
      metaColumnIds: [],
      columnOrder: [`variable:${score.id}`],
      aliases: { [`variable:${score.id}`]: 'Points' },
    })
  })

  it('preserves in-progress edits as new variables arrive and merges them in automatic mode', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const onClose = vi.fn()
    const { rerender } = render(
      <TraceTableColumnDesigner
        open
        availableVariables={[score]}
        selectedVariableIds={[score.id]}
        aliases={{}}
        autoSelect
        onApply={onApply}
        onClose={onClose}
      />,
    )

    const header = screen.getByRole('textbox', { name: 'Column header for Score' })
    await user.clear(header)
    await user.type(header, 'Draft points')
    rerender(
      <TraceTableColumnDesigner
        open
        availableVariables={[score, math]}
        selectedVariableIds={[score.id, math.id]}
        aliases={{}}
        autoSelect
        onApply={onApply}
        onClose={onClose}
      />,
    )

    expect(screen.getByRole('textbox', { name: 'Column header for Score' })).toHaveValue('Draft points')
    expect(screen.getByText('2 selected · left to right')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /math.*global scope/i })).toBeChecked()
  })

  it('traps keyboard focus and restores the previously focused control when closed', async () => {
    const user = userEvent.setup()
    const previousControl = document.createElement('button')
    previousControl.textContent = 'Open designer'
    document.body.appendChild(previousControl)
    previousControl.focus()

    const { onApply, onClose, rerender } = renderDesigner()
    const closeButton = screen.getByRole('button', { name: 'Close column designer' })
    const applyButton = screen.getByRole('button', { name: 'Apply columns' })

    applyButton.focus()
    await user.tab()
    expect(closeButton).toHaveFocus()
    await user.tab({ shift: true })
    expect(applyButton).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    rerender(
      <TraceTableColumnDesigner
        open={false}
        availableVariables={availableVariables}
        selectedVariableIds={[score.id]}
        aliases={{}}
        autoSelect={false}
        onApply={onApply}
        onClose={onClose}
      />,
    )
    expect(previousControl).toHaveFocus()
    previousControl.remove()
  })

  it('preserves unavailable selections with a readable fallback', async () => {
    const user = userEvent.setup()
    const missingId = 'local:old%20function:lost_value'
    const { onApply } = renderDesigner({ selectedVariableIds: [missingId] })

    const selected = screen.getByRole('region', { name: 'Selected columns' })
    expect(within(selected).getByText('lost value')).toBeInTheDocument()
    expect(within(selected).getByText('Unavailable this run')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(within(selected).getByText('8 selected · left to right')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Apply columns' }))
    expect(onApply.mock.calls[0][0].variableIds).toContain(missingId)
  })

  it('cancels or closes with Escape without applying changes and renders nothing when closed', async () => {
    const user = userEvent.setup()
    const { onApply, onClose, rerender } = renderDesigner()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onApply).not.toHaveBeenCalled()

    rerender(
      <TraceTableColumnDesigner
        open={false}
        availableVariables={availableVariables}
        selectedVariableIds={[score.id]}
        aliases={{}}
        autoSelect={false}
        onApply={onApply}
        onClose={onClose}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
