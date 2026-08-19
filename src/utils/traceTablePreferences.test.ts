import { beforeEach, describe, expect, it } from 'vitest'
import type { TraceVariableDefinition } from '../types/traceTable'
import {
  DEFAULT_TRACE_TABLE_PREFERENCES,
  clearStoredTraceTablePreferences,
  getStoredTraceTablePreferences,
  persistTraceTablePreferences,
  refreshTraceTableCachedLabels,
  resolveTraceTableColumnIds,
  resolveTraceTableColumnLabel,
  traceTablePreferenceStorageKey,
} from './traceTablePreferences'

const source = { filesystemId: 'class-a', path: 'main.py' }

const variable = (id: string, firstSeenSequence: number, defaultLabel = id): TraceVariableDefinition => ({
  id,
  name: id,
  defaultLabel,
  scope: { kind: 'global' },
  firstSeenSequence,
  lastSeenSequence: firstSeenSequence,
})

describe('trace table preferences', () => {
  beforeEach(() => localStorage.clear())

  it('persists source choices without leaking them across filesystem/path pairs', () => {
    const preferences = {
      ...DEFAULT_TRACE_TABLE_PREFERENCES,
      rowMode: 'every-line' as const,
      columnMode: 'custom' as const,
      variableIds: ['global:score'],
      aliases: { 'global:score': 'Points' },
    }
    persistTraceTablePreferences(source, preferences)

    expect(getStoredTraceTablePreferences(source)).toEqual(preferences)
    expect(getStoredTraceTablePreferences({ filesystemId: 'class-b', path: 'main.py' })).toEqual(DEFAULT_TRACE_TABLE_PREFERENCES)
    expect(getStoredTraceTablePreferences({ filesystemId: 'class-a', path: 'other.py' })).toEqual(DEFAULT_TRACE_TABLE_PREFERENCES)
  })

  it('falls back safely and migrates malformed fields from stored payloads', () => {
    localStorage.setItem(traceTablePreferenceStorageKey(source), '{not json')
    expect(getStoredTraceTablePreferences(source)).toEqual(DEFAULT_TRACE_TABLE_PREFERENCES)

    localStorage.setItem(traceTablePreferenceStorageKey(source), JSON.stringify({
      rowMode: 'wrong', columnMode: 'custom', variableIds: [' x ', 'x', 3, '', 'y'],
      aliases: { x: '  X value ', y: '', bad: 7 },
      cachedDefaultLabels: { y: ' Prior y ', null: null },
    }))
    expect(getStoredTraceTablePreferences(source)).toEqual({
      rowMode: 'compact', columnMode: 'custom', variableIds: ['x', 'y'],
      aliases: { x: 'X value' }, cachedDefaultLabels: { y: 'Prior y' },
    })
  })

  it('automatically includes newly discovered variables in first-seen order', () => {
    const variables = { z: variable('z', 4), a: variable('a', 1), b: variable('b', 4) }
    expect(resolveTraceTableColumnIds(DEFAULT_TRACE_TABLE_PREFERENCES, variables)).toEqual(['a', 'b', 'z'])
  })

  it('does not auto-add variables in custom mode and preserves unseen selected columns', () => {
    const preferences = {
      ...DEFAULT_TRACE_TABLE_PREFERENCES,
      columnMode: 'custom' as const,
      variableIds: ['unseen', 'known'],
    }
    expect(resolveTraceTableColumnIds(preferences, { known: variable('known', 1), new: variable('new', 2) }))
      .toEqual(['unseen', 'known'])
  })

  it('uses aliases first and preserves cached friendly labels across undiscovered runs', () => {
    const cached = refreshTraceTableCachedLabels({
      ...DEFAULT_TRACE_TABLE_PREFERENCES,
      columnMode: 'custom',
      variableIds: ['old'],
    }, { old: variable('old', 1, 'Old friendly name') })

    expect(cached).not.toBe(DEFAULT_TRACE_TABLE_PREFERENCES)
    expect(resolveTraceTableColumnLabel(cached, 'old', {})).toBe('Old friendly name')
    expect(resolveTraceTableColumnLabel({ ...cached, aliases: { old: '  Better name  ' } }, 'old', {})).toBe('Better name')
  })

  it('clears only the requested source preference record', () => {
    persistTraceTablePreferences(source, { ...DEFAULT_TRACE_TABLE_PREFERENCES, rowMode: 'every-line' })
    persistTraceTablePreferences({ filesystemId: 'class-a', path: 'other.py' }, { ...DEFAULT_TRACE_TABLE_PREFERENCES, columnMode: 'custom', variableIds: ['x'] })

    clearStoredTraceTablePreferences(source)

    expect(getStoredTraceTablePreferences(source)).toEqual(DEFAULT_TRACE_TABLE_PREFERENCES)
    expect(getStoredTraceTablePreferences({ filesystemId: 'class-a', path: 'other.py' }).variableIds).toEqual(['x'])
  })
})
