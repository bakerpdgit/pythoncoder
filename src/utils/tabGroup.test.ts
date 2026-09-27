import { describe, expect, it } from 'vitest'
import {
  NO_TAB_GROUP, describeTabGroup, groupSlot, resolveGroupTab, sanitiseTabGroup, visibleTabGroup,
  type CenterPanel,
} from './tabGroup'

const allVisible: Record<CenterPanel, boolean> = { editor: true, console: true, display: true }
const noDisplay: Record<CenterPanel, boolean> = { editor: true, console: true, display: false }

describe('the central column tab group', () => {
  it('reads only real booleans back from storage', () => {
    expect(sanitiseTabGroup(undefined)).toEqual(NO_TAB_GROUP)
    expect(sanitiseTabGroup('yes')).toEqual(NO_TAB_GROUP)
    expect(sanitiseTabGroup({ editor: true, console: 'true', display: 1 })).toEqual({ editor: true, console: false, display: false })
  })

  it('exists only while two of its members are on screen', () => {
    const consoleAndDisplay = { editor: false, console: true, display: true }
    expect(visibleTabGroup(consoleAndDisplay, allVisible)).toEqual(['console', 'display'])
    // Nothing drawn yet: the Display pane is not on screen, so there is no group.
    expect(visibleTabGroup(consoleAndDisplay, noDisplay)).toEqual([])
    expect(visibleTabGroup({ editor: true, console: false, display: false }, allVisible)).toEqual([])
    expect(visibleTabGroup({ editor: true, console: true, display: true }, noDisplay)).toEqual(['editor', 'console'])
  })

  it('falls back to the first tab when the chosen one has left the group', () => {
    expect(resolveGroupTab('display', ['editor', 'console'])).toBe('editor')
    expect(resolveGroupTab('console', ['editor', 'console'])).toBe('console')
    expect(resolveGroupTab('console', [])).toBeNull()
  })

  it('puts the one panel left out ahead of the group, and hides the tabs not chosen', () => {
    const group: CenterPanel[] = ['editor', 'console']
    expect(groupSlot('display', group, 'console', allVisible)).toBe('lead')
    expect(groupSlot('console', group, 'console', allVisible)).toBe('tab')
    expect(groupSlot('editor', group, 'console', allVisible)).toBe('hidden')
    // Left out, but with nothing to show.
    expect(groupSlot('display', group, 'console', noDisplay)).toBe('hidden')
  })

  it('lays the column out as usual when there is no group on screen', () => {
    expect(groupSlot('editor', [], null, allVisible)).toBeNull()
  })

  it('names the group for the menu', () => {
    expect(describeTabGroup({ editor: false, console: true, display: true })).toBe('Console + Display')
    expect(describeTabGroup({ editor: true, console: false, display: false })).toBe('Off')
  })
})
