export type ConsolePanelTab = 'console' | 'inputs' | 'tests' | 'trace-table' | 'canvas'

export interface TraceInputTabHandoff {
  nextTab: ConsolePanelTab
  returnToTraceTable: boolean
}

/** Interactive input must be visible and focused in the Console panel. */
export function beginTraceInputTabHandoff(
  currentTab: ConsolePanelTab,
  isTraceRun: boolean,
): TraceInputTabHandoff {
  return {
    nextTab: 'console',
    returnToTraceTable: isTraceRun && currentTab === 'trace-table',
  }
}

/** Return only when the input request itself moved an active trace away. */
export function completeTraceInputTabHandoff(
  returnToTraceTable: boolean,
  hasTraceSession: boolean,
): ConsolePanelTab | null {
  return returnToTraceTable && hasTraceSession ? 'trace-table' : null
}
