import { beforeEach, describe, expect, it } from 'vitest'
import type { TraceTablePreferences, TraceVariableDefinition } from '../types/traceTable'
import {
  DEFAULT_TRACE_TABLE_PREFERENCES,
  clearStoredTraceTablePreferences,
  getStoredTraceTablePreferences,
  persistTraceTablePreferences,
  refreshTraceTableCachedLabels,
  resetTraceTablePreferencesForNewSession,
  resolveTraceTableColumnOrder,
  resolveTraceTableColumnIds,
  resolveTraceTableColumnLabel,
  traceTablePreferenceStorageKey,
  traceTableVariableColumnKey,
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

  it('defaults Output on at the right and preserves an explicit removal', () => {
    expect(resolveTraceTableColumnOrder(DEFAULT_TRACE_TABLE_PREFERENCES, {
      x: variable('x', 1),
    })).toEqual(['variable:x', 'meta:output'])

    expect(resolveTraceTableColumnOrder({
      ...DEFAULT_TRACE_TABLE_PREFERENCES,
      metaColumnIds: [],
      outputColumnVisible: false,
      columnOrder: [],
    }, { x: variable('x', 1) })).toEqual(['variable:x'])
  })

  it('persists source choices without leaking them across filesystem/path pairs', () => {
    const preferences: TraceTablePreferences = {
      ...DEFAULT_TRACE_TABLE_PREFERENCES,
      rowMode: 'every-line' as const,
      columnMode: 'custom' as const,
      outputColumnVisible: false,
      variableIds: ['global:score'],
      metaColumnIds: [],
      columnOrder: ['variable:global:score'],
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
      aliases: { x: '  X value ', y: '', bad: 7, 'meta:function': 'Routine' },
      cachedDefaultLabels: { y: ' Prior y ', null: null },
    }))
    expect(getStoredTraceTablePreferences(source)).toEqual({
      rowMode: 'compact', columnMode: 'custom', variableIds: ['x', 'y'],
      metaColumnIds: ['meta:output'],
      outputColumnVisible: true,
      columnOrder: ['variable:x', 'variable:y', 'meta:output'],
      aliases: { x: 'X value' }, columnWidths: {}, displayDepths: {}, cachedDefaultLabels: { y: 'Prior y' },
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

  it('migrates legacy preferences, pins metadata, and drops the retired Function column', () => {
    const legacy = {
      rowMode: 'compact', columnMode: 'custom', variableIds: ['x', 'unseen'],
      aliases: {}, cachedDefaultLabels: {},
    }
    expect(resolveTraceTableColumnOrder(legacy as typeof DEFAULT_TRACE_TABLE_PREFERENCES, { x: variable('x', 1) }))
      .toEqual(['variable:x', 'variable:unseen', 'meta:output'])

    const mixed: TraceTablePreferences = {
      ...DEFAULT_TRACE_TABLE_PREFERENCES,
      columnMode: 'custom' as const,
      variableIds: ['x', 'y'],
      metaColumnIds: ['meta:function', 'meta:call-depth'],
      columnOrder: ['variable:x', 'meta:function', 'variable:y', 'meta:call-depth'],
    }
    expect(resolveTraceTableColumnOrder(mixed, { x: variable('x', 1), y: variable('y', 2) }))
      .toEqual(['meta:call-depth', 'variable:x', 'variable:y', 'meta:output'])
  })

  it('pins metadata left and appends newly discovered variables in auto mode', () => {
    const preferences: TraceTablePreferences = {
      ...DEFAULT_TRACE_TABLE_PREFERENCES,
      columnOrder: [traceTableVariableColumnKey('x'), 'meta:call-number'],
    }
    expect(resolveTraceTableColumnOrder(preferences, {
      x: variable('x', 1),
      y: variable('y', 2),
    })).toEqual(['meta:call-number', 'variable:x', 'variable:y', 'meta:output'])
  })

  it('normalises persisted column widths and nested display depths', () => {
    persistTraceTablePreferences(source, {
      ...DEFAULT_TRACE_TABLE_PREFERENCES,
      columnWidths: {
        'meta:call-depth': 40,
        'meta:function': 200,
        'variable:x': 900,
        'variable:y': 150.6,
      },
      displayDepths: { x: -2, y: 2.6, z: 20 },
    })

    expect(getStoredTraceTablePreferences(source)).toEqual(expect.objectContaining({
      columnWidths: { 'meta:call-depth': 96, 'variable:x': 480, 'variable:y': 151 },
      displayDepths: { x: 0, y: 3, z: 6 },
    }))
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

  it('resets each new session to automatic variables while retaining pinned metadata choices', () => {
    persistTraceTablePreferences(source, {
      ...DEFAULT_TRACE_TABLE_PREFERENCES,
      rowMode: 'every-line',
      columnMode: 'custom',
      variableIds: ['x'],
      metaColumnIds: ['meta:call-number'],
      columnOrder: ['variable:x', 'meta:call-number'],
      aliases: { 'variable:x': 'Value', 'meta:call-number': 'Call' },
      columnWidths: { 'variable:x': 250, 'meta:call-number': 110 },
      displayDepths: { x: 4 },
      cachedDefaultLabels: { x: 'Old x' },
    })

    const reset = resetTraceTablePreferencesForNewSession(source)

    expect(reset).toEqual({
      rowMode: 'every-line',
      columnMode: 'auto',
      variableIds: [],
      metaColumnIds: ['meta:call-number', 'meta:output'],
      outputColumnVisible: true,
      columnOrder: ['meta:call-number', 'meta:output'],
      aliases: { 'meta:call-number': 'Call' },
      columnWidths: { 'meta:call-number': 110 },
      displayDepths: {},
      cachedDefaultLabels: {},
    })
    expect(getStoredTraceTablePreferences(source)).toEqual(reset)
  })
})
