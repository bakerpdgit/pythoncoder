/**
 * The central column's tab group: any of the Code editor, Console and Display
 * can share one tabbed panel instead of each having its own.
 *
 * The group always sits last in the column, so whatever is left out of it keeps
 * its place ahead of it. A group needs two members *on screen* to exist — the
 * Display pane only appears once a program draws, and a run's presentation
 * layout hides the editor — so with fewer than two the column falls back to its
 * ordinary layout, and the tabs come back by themselves when the second member
 * does.
 */

export type CenterPanel = 'editor' | 'console' | 'display'

/** Column order, and the order of the tabs. */
export const CENTER_PANELS: readonly CenterPanel[] = ['editor', 'console', 'display']

export const CENTER_PANEL_LABELS: Record<CenterPanel, string> = {
  editor: 'Code',
  console: 'Console',
  display: 'Display',
}

/** Which panels the student has ticked into the group. */
export type TabGroupPrefs = Record<CenterPanel, boolean>

export const NO_TAB_GROUP: TabGroupPrefs = { editor: false, console: false, display: false }

export const sanitiseTabGroup = (raw: unknown): TabGroupPrefs => {
  if (!raw || typeof raw !== 'object') return { ...NO_TAB_GROUP }
  const r = raw as Record<string, unknown>
  return { editor: r.editor === true, console: r.console === true, display: r.display === true }
}

/** The ticked panels, in column order. */
export const tabGroupMembers = (prefs: TabGroupPrefs): CenterPanel[] =>
  CENTER_PANELS.filter(panel => prefs[panel])

/** A short name for what is grouped, for the Panels menu: "Console + Display". */
export const describeTabGroup = (prefs: TabGroupPrefs): string => {
  const members = tabGroupMembers(prefs)
  return members.length >= 2 ? members.map(p => CENTER_PANEL_LABELS[p]).join(' + ') : 'Off'
}

/**
 * The grouped panels that are on screen now, in tab order — or none, when
 * fewer than two are, because a tab strip holding one tab is just a header.
 */
export const visibleTabGroup = (
  prefs: TabGroupPrefs,
  visible: Record<CenterPanel, boolean>,
): CenterPanel[] => {
  const members = tabGroupMembers(prefs).filter(panel => visible[panel])
  return members.length >= 2 ? members : []
}

/** The tab to show: the one last chosen, or the first when that one has gone. */
export const resolveGroupTab = (chosen: CenterPanel, group: readonly CenterPanel[]): CenterPanel | null =>
  group.length === 0 ? null : group.includes(chosen) ? chosen : group[0]

/**
 * Where one panel of the column goes while the group is on screen:
 *  - `lead`: the one visible panel outside the group, ahead of it;
 *  - `tab`: the group's selected tab, filling the rest of the column;
 *  - `hidden`: a grouped panel behind another tab, or a panel with nothing to show.
 * `null` means no group is on screen and the column is laid out as usual.
 */
export type GroupSlot = 'lead' | 'tab' | 'hidden' | null

export const groupSlot = (
  panel: CenterPanel,
  group: readonly CenterPanel[],
  activeTab: CenterPanel | null,
  visible: Record<CenterPanel, boolean>,
): GroupSlot => {
  if (group.length === 0) return null
  if (group.includes(panel)) return panel === activeTab ? 'tab' : 'hidden'
  return visible[panel] ? 'lead' : 'hidden'
}
