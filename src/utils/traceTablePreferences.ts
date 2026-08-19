import type {
  TraceSessionSource,
  TraceTablePreferences,
  TraceVariableDefinition,
  TraceVariableId,
} from '../types/traceTable'

const STORAGE_KEY_PREFIX = 'pythoncoder-trace-table-preferences-v1:'

/** Fresh preferences are intentionally independent for every trace source. */
export const DEFAULT_TRACE_TABLE_PREFERENCES: TraceTablePreferences = {
  rowMode: 'compact',
  columnMode: 'auto',
  variableIds: [],
  aliases: {},
  cachedDefaultLabels: {},
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const normaliseIdList = (value: unknown): TraceVariableId[] => {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const ids: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const id = item.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

/** Only string-to-string maps are allowed through from persisted JSON. */
const normaliseLabelMap = (value: unknown): Record<TraceVariableId, string> => {
  if (!isRecord(value)) return {}
  const labels: Record<string, string> = {}
  for (const [rawId, rawLabel] of Object.entries(value)) {
    const id = rawId.trim()
    if (!id || typeof rawLabel !== 'string') continue
    const label = rawLabel.trim()
    // Empty aliases do not carry meaning and should not override a friendly default.
    if (label) labels[id] = label
  }
  return labels
}

const copyDefaultPreferences = (): TraceTablePreferences => ({
  ...DEFAULT_TRACE_TABLE_PREFERENCES,
  variableIds: [],
  aliases: {},
  cachedDefaultLabels: {},
})

/**
 * Accepts older/partial payloads but never allows malformed JSON fields to
 * affect runtime rendering.  This is also used before persisting callers'
 * in-memory edits, so localStorage only receives the canonical shape.
 */
export const normaliseTraceTablePreferences = (value: unknown): TraceTablePreferences => {
  if (!isRecord(value)) return copyDefaultPreferences()
  return {
    rowMode: value.rowMode === 'every-line' ? 'every-line' : 'compact',
    columnMode: value.columnMode === 'custom' ? 'custom' : 'auto',
    variableIds: normaliseIdList(value.variableIds),
    aliases: normaliseLabelMap(value.aliases),
    cachedDefaultLabels: normaliseLabelMap(value.cachedDefaultLabels),
  }
}

/**
 * A filesystem ID is part of the key so equal paths in separate virtual or
 * connected filesystems never leak display choices into one another.
 */
export const traceTablePreferenceStorageKey = (source: Pick<TraceSessionSource, 'path' | 'filesystemId'>): string => {
  const filesystemId = source.filesystemId ?? ''
  return `${STORAGE_KEY_PREFIX}${encodeURIComponent(filesystemId)}:${encodeURIComponent(source.path)}`
}

export const getStoredTraceTablePreferences = (
  source: Pick<TraceSessionSource, 'path' | 'filesystemId'>,
): TraceTablePreferences => {
  try {
    const raw = localStorage.getItem(traceTablePreferenceStorageKey(source))
    return raw ? normaliseTraceTablePreferences(JSON.parse(raw)) : copyDefaultPreferences()
  } catch {
    return copyDefaultPreferences()
  }
}

export const persistTraceTablePreferences = (
  source: Pick<TraceSessionSource, 'path' | 'filesystemId'>,
  preferences: TraceTablePreferences,
): void => {
  try {
    localStorage.setItem(traceTablePreferenceStorageKey(source), JSON.stringify(normaliseTraceTablePreferences(preferences)))
  } catch {
    // Storage is optional (private browsing, quota, and disabled storage are all safe fallbacks).
  }
}

/** Removes just one source's choices; other files and filesystems are untouched. */
export const clearStoredTraceTablePreferences = (
  source: Pick<TraceSessionSource, 'path' | 'filesystemId'>,
): void => {
  try { localStorage.removeItem(traceTablePreferenceStorageKey(source)) } catch { /* ignore */ }
}

const orderedCurrentIds = (variables: Record<TraceVariableId, TraceVariableDefinition>): TraceVariableId[] =>
  Object.values(variables)
    .slice()
    .sort((left, right) => left.firstSeenSequence - right.firstSeenSequence || left.id.localeCompare(right.id))
    .map(variable => variable.id)

/**
 * Auto mode follows all currently discovered source variables in discovery
 * order. Custom mode is intentionally not intersected with the catalogue so
 * an unseen selected variable keeps its column and place for future runs.
 */
export const resolveTraceTableColumnIds = (
  preferences: TraceTablePreferences,
  variables: Record<TraceVariableId, TraceVariableDefinition>,
): TraceVariableId[] => {
  const normalised = normaliseTraceTablePreferences(preferences)
  return normalised.columnMode === 'auto'
    ? orderedCurrentIds(variables)
    : normalised.variableIds
}

/** Alias wins, followed by the current label and then its cached prior label. */
export const resolveTraceTableColumnLabel = (
  preferences: TraceTablePreferences,
  variableId: TraceVariableId,
  variables: Record<TraceVariableId, TraceVariableDefinition>,
): string => {
  const normalised = normaliseTraceTablePreferences(preferences)
  return normalised.aliases[variableId]
    ?? variables[variableId]?.defaultLabel
    ?? normalised.cachedDefaultLabels[variableId]
    ?? variableId
}

/**
 * Merge labels from a newly discovered catalogue without mutating the current
 * preferences. This is safe to call for every worker batch before persistence.
 */
export const refreshTraceTableCachedLabels = (
  preferences: TraceTablePreferences,
  variables: Record<TraceVariableId, TraceVariableDefinition>,
): TraceTablePreferences => {
  const normalised = normaliseTraceTablePreferences(preferences)
  const cachedDefaultLabels = { ...normalised.cachedDefaultLabels }
  for (const variable of Object.values(variables)) {
    const label = variable.defaultLabel.trim()
    if (label) cachedDefaultLabels[variable.id] = label
  }
  return { ...normalised, cachedDefaultLabels }
}
