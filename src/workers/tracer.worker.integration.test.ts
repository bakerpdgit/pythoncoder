import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

type WireEvent = {
  sequence: number
  type: string
  line: number
  function: string
  callId: number
  callDepth: number
  stack: Array<{ callId: number; function: string }>
  writes?: Array<{ name: string; sourceId: string; activationSourceId: string; callId: number | null; operation: string; changed?: boolean; value?: { value?: unknown } }>
  variables?: Array<{ name: string; sourceId: string; activationSourceId: string; callId: number | null; value?: { value?: unknown } }>
  deletes?: Array<{ name: string; sourceId: string; operation: string }>
  loopBoundary?: { loopId: string; loopKind: string; iteration: number } | null
  exception?: { type: string; message: string }
}

type WireBatch = { protocolVersion: number; events: WireEvent[]; catalogue: Array<{ name: string; sourceId: string }> }
type InspectorSnapshot = {
  Inspector?: { views?: { globals?: { node?: { entries?: Array<{ label: string }> } } } }
}
type RecorderResult = {
  batches: WireBatch[]
  error: string | null
  inspectorSnapshots: InspectorSnapshot[]
  stopAcks: number
  inputReads: number
}

const workerPath = resolve(process.cwd(), 'src/workers/tracer.worker.ts')
const workerSource = readFileSync(workerPath, 'utf8')
const setupStart = workerSource.indexOf('const SETUP_CODE = `')
const setupEnd = workerSource.indexOf('\n`\n\nself.onmessage', setupStart)

if (setupStart < 0 || setupEnd < 0) {
  throw new Error('Unable to extract SETUP_CODE from tracer.worker.ts')
}

// This deliberately executes the exact Python embedded in the worker. The
// bridge has only the callbacks normally supplied by Pyodide; every assertion
// below is against the JSON protocol delivered to JS, not a copied recorder.
const setupCode = workerSource.slice(setupStart + 'const SETUP_CODE = `'.length, setupEnd)
const pythonAvailable = spawnSync('python', ['--version'], { encoding: 'utf8' }).status === 0

function record(code: string, options: {
  pauseOnFirstLine?: boolean
  traceCommand?: number
  stopRequested?: boolean
  stopOnInput?: boolean
} = {}): RecorderResult {
  if (!pythonAvailable) throw new Error('Native Python is unavailable; recorder integration tests cannot run.')

  const harness = `
import json
import sys

batches = []
inspector_snapshots = []
stop_requested = ${options.stopRequested === true ? 'True' : 'False'}
stop_acks = 0
input_reads = 0
def js_trace_table_batch(payload):
    batches.append(json.loads(payload))
def js_trace_callback(*args):
    global stop_requested
    try:
        inspector_snapshots.append(json.loads(args[3]))
    except Exception:
        pass
    if ${options.traceCommand === 5 ? 'True' : 'False'}:
        stop_requested = True
    return ${options.traceCommand ?? 4}
def js_input_callback(_prompt):
    global stop_requested, input_reads
    if ${options.stopOnInput === true ? 'True' : 'False'}:
        stop_requested = True
        return ''
    input_reads += 1
    return ''
def js_send_state(*_args):
    return None
def js_trace_stop_requested():
    return stop_requested
def js_trace_table_stop_ack():
    global stop_acks
    if stop_acks == 0:
        stop_acks = 1

initial_breakpoints = {}
pause_on_first_line = ${options.pauseOnFirstLine === true ? 'True' : 'False'}
trace_table_enabled = True
user_code_str = ${JSON.stringify(code)}

${setupCode}

run_error = None
try:
    exec(compile(user_code_str, 'simulation.py', 'exec'), user_namespace, user_namespace)
except BaseException as exc:
    run_error = f'{type(exc).__name__}: {exc}'
finally:
    trace_table_flush()
    sys.settrace(None)

print(json.dumps({
    'batches': batches,
    'error': run_error,
    'inspectorSnapshots': inspector_snapshots,
    'stopAcks': stop_acks,
    'inputReads': input_reads,
}, separators=(',', ':')))
`
  const result = spawnSync('python', ['-'], { input: harness, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  if (result.status !== 0) {
    throw new Error(`Native Python recorder harness failed:\n${result.stderr}\n${result.stdout}`)
  }
  return JSON.parse(result.stdout) as RecorderResult
}

function events(result: RecorderResult): WireEvent[] {
  return result.batches.flatMap(batch => batch.events)
}

describe.skipIf(!pythonAvailable)('tracer worker embedded Python recorder', () => {
  it('records an explicit same-value assignment in its actual JSON wire payload', () => {
    const result = record('x = 1\nx = 1\n')
    const xWrites = events(result).flatMap(event => event.writes ?? []).filter(write => write.name === 'x')

    expect(result.error).toBeNull()
    expect(xWrites).toEqual([
      expect.objectContaining({ sourceId: 'global:x', operation: 'write', changed: true }),
      expect.objectContaining({ sourceId: 'global:x', operation: 'write', changed: false }),
    ])
  })

  it('isolates recorder helpers from colliding user global assignments', () => {
    const result = record([
      'json = 1',
      'sys = 2',
      'dis = 3',
      'ast = 4',
      'builtins = 5',
      'trace_table_flush = 6',
      'serialize_value = 7',
    ].join('\n'))
    const writtenNames = events(result).flatMap(event => event.writes ?? []).map(write => write.name)
    const catalogueNames = result.batches.flatMap(batch => batch.catalogue).map(item => item.name)

    expect(result.error).toBeNull()
    for (const name of ['json', 'sys', 'dis', 'ast', 'builtins', 'trace_table_flush', 'serialize_value']) {
      expect(writtenNames).toContain(name)
      expect(catalogueNames).toContain(name)
    }
    expect(result.batches.length).toBeGreaterThan(0)
  })

  it('uses executed stores rather than non-executed same-line branch intent', () => {
    const result = record([
      'x = 1',
      'if False: x = 2',
      'y = 3',
      'z = 1; z = 2',
    ].join('\n'))
    const writes = events(result).flatMap(event => event.writes ?? [])

    expect(writes.filter(write => write.name === 'x')).toHaveLength(1)
    expect(writes.filter(write => write.name === 'y')).toHaveLength(1)
    expect(writes.filter(write => write.name === 'z').map(write => write.value?.value)).toEqual([1, 2])
  })

  it('retains an executed store when a later operation on the same line raises', () => {
    const result = record('x = 1; raise ValueError("after store")\n')
    const xWrites = events(result).flatMap(event => event.writes ?? []).filter(write => write.name === 'x')

    expect(result.error).toBe('ValueError: after store')
    expect(xWrites).toEqual([expect.objectContaining({ sourceId: 'global:x', operation: 'write' })])
  })

  it('never resolves an unbound or deleted local through a same-named global', () => {
    const result = record([
      'x = 1',
      'def f():',
      '    x = 1',
      '    del x',
      'f()',
    ].join('\n'))
    const recordedEvents = events(result)
    const localWrite = recordedEvents
      .filter(event => event.function === 'f')
      .flatMap(event => event.writes ?? [])
      .find(write => write.name === 'x')
    const localDelete = recordedEvents
      .filter(event => event.function === 'f')
      .flatMap(event => event.deletes ?? [])
      .find(deleted => deleted.name === 'x')

    expect(result.error).toBeNull()
    expect(localWrite).toEqual(expect.objectContaining({ sourceId: 'local:f:x', changed: true }))
    expect(localDelete).toEqual(expect.objectContaining({ sourceId: 'local:f:x', operation: 'delete' }))
  })

  it('stops at a paused line before executing it and acknowledges after flushing', () => {
    const result = record('x = 1\n', {
      pauseOnFirstLine: true,
      traceCommand: 5,
    })

    expect(result.error).toBe('_TraceTableStopRequested: ')
    expect(result.stopAcks).toBe(1)
    expect(events(result).flatMap(event => event.writes ?? []).some(write => write.name === 'x')).toBe(false)
  })

  it('does not consume or record input when stop wakes an input wait', () => {
    const result = record('answer = input("value: ")\n', { stopOnInput: true })

    expect(result.error).toBe('_TraceTableStopRequested: ')
    expect(result.stopAcks).toBe(1)
    expect(result.inputReads).toBe(0)
    expect(events(result).some(event => event.type === 'input-completed')).toBe(false)
    expect(events(result).flatMap(event => event.writes ?? []).some(write => write.name === 'answer')).toBe(false)
  })

  it('keeps a returned closure nonlocal bound to its defining activation', () => {
    const result = record([
      'def make_counter():',
      '    count = 0',
      '    def increment():',
      '        nonlocal count',
      '        count += 1',
      '        return count',
      '    return increment',
      'counter = make_counter()',
      'first = counter()',
      'second = counter()',
    ].join('\n'))
    const recordedEvents = events(result)
    const definingCall = recordedEvents.find(event => event.type === 'function-entry' && event.function === 'make_counter')?.callId
    const nonlocalWrites = recordedEvents
      .filter(event => event.function === 'increment')
      .flatMap(event => event.writes ?? [])
      .filter(write => write.name === 'count')

    expect(nonlocalWrites).toHaveLength(2)
    expect(new Set(nonlocalWrites.map(write => write.sourceId))).toEqual(new Set(['local:make_counter:count']))
    expect(new Set(nonlocalWrites.map(write => write.activationSourceId)).size).toBe(1)
    expect(new Set(nonlocalWrites.map(write => write.callId))).toEqual(new Set([definingCall]))
  })

  it('distinguishes equal-valued cells belonging to two live returned closures', () => {
    const result = record([
      'def make(value):',
      '    x = value',
      '    def touch():',
      '        nonlocal x',
      '        x = x',
      '        return x',
      '    return touch',
      'a = make(1)',
      'b = make(1)',
      'first = a()',
      'second = b()',
      'third = a()',
    ].join('\n'))
    const touchWrites = events(result)
      .filter(event => event.function === 'touch')
      .flatMap(event => event.writes ?? [])
      .filter(write => write.name === 'x')

    expect(result.error).toBeNull()
    expect(touchWrites).toHaveLength(3)
    expect(touchWrites.every(write => write.changed === false)).toBe(true)
    expect(touchWrites[0].activationSourceId).toBe(touchWrites[2].activationSourceId)
    expect(touchWrites[0].callId).toBe(touchWrites[2].callId)
    expect(touchWrites[0].activationSourceId).not.toBe(touchWrites[1].activationSourceId)
    expect(touchWrites[0].callId).not.toBe(touchWrites[1].callId)
  })

  it('resolves equal-valued returned closures through safe list subscripts', () => {
    const result = record([
      'def make(value):',
      '    x = value',
      '    def touch():',
      '        nonlocal x',
      '        x = x',
      '        return x',
      '    return touch',
      'funcs = [make(1), make(1)]',
      'first = funcs[0]()',
      'second = funcs[1]()',
      'third = funcs[0]()',
    ].join('\n'))
    const touchWrites = events(result)
      .filter(event => event.function === 'touch')
      .flatMap(event => event.writes ?? [])
      .filter(write => write.name === 'x')

    expect(result.error).toBeNull()
    expect(touchWrites).toHaveLength(3)
    expect(touchWrites[0].activationSourceId).toBe(touchWrites[2].activationSourceId)
    expect(touchWrites[0].callId).toBe(touchWrites[2].callId)
    expect(touchWrites[0].activationSourceId).not.toBe(touchWrites[1].activationSourceId)
    expect(touchWrites[0].callId).not.toBe(touchWrites[1].callId)
  })

  it('registers direct-return lambdas against their defining activations', () => {
    const result = record([
      'def make(value):',
      '    x = value',
      '    return lambda: x',
      'funcs = [make(1), make(1)]',
      'first = funcs[0]()',
      'second = funcs[1]()',
    ].join('\n'))
    const recordedEvents = events(result)
    const definingCalls = recordedEvents
      .filter(event => event.type === 'function-entry' && event.function === 'make')
      .map(event => event.callId)
    const lambdaBindings = recordedEvents
      .filter(event => event.type === 'function-entry' && event.function === '<lambda>')
      .flatMap(event => event.variables ?? [])
      .filter(variable => variable.name === 'x')

    expect(result.error).toBeNull()
    expect(lambdaBindings).toHaveLength(2)
    expect(new Set(lambdaBindings.map(variable => variable.sourceId))).toEqual(new Set(['local:make:x']))
    expect(new Set(lambdaBindings.map(variable => variable.callId))).toEqual(new Set(definingCalls))
    expect(lambdaBindings[0].activationSourceId).not.toBe(lambdaBindings[1].activationSourceId)
  })

  it('falls back safely when user introspection hooks raise', () => {
    const result = record([
      'class Hostile:',
      '    def __getattribute__(self, name):',
      '        if name == "__dict__":',
      '            raise RuntimeError("no dictionary")',
      '        return object.__getattribute__(self, name)',
      '    def __repr__(self):',
      '        raise RuntimeError("no repr")',
      'item = Hostile()',
      'after = 42',
    ].join('\n'))
    const afterWrite = events(result).flatMap(event => event.writes ?? []).find(write => write.name === 'after')

    expect(result.error).toBeNull()
    expect(afterWrite).toEqual(expect.objectContaining({ sourceId: 'global:after', changed: true }))
  })

  it('marks each entered loop body with an ordered loop boundary', () => {
    const result = record('total = 0\nfor item in [4, 4]:\n    total += item\n')
    const boundaries = events(result)
      .map(event => event.loopBoundary)
      .filter((boundary): boundary is NonNullable<WireEvent['loopBoundary']> => boundary !== null && boundary !== undefined)

    expect(boundaries).toEqual([
      expect.objectContaining({ loopKind: 'for', iteration: 1 }),
      expect.objectContaining({ loopKind: 'for', iteration: 2 }),
    ])
    expect(events(result).flatMap(event => event.writes ?? []).filter(write => write.name === 'item')).toHaveLength(2)
  })

  it('keeps nested and recursive call activations distinct on the wire', () => {
    const result = record([
      'def outer(value):',
      '    def countdown(n):',
      '        if n <= 0:',
      '            return n',
      '        return countdown(n - 1)',
      '    return countdown(value)',
      'answer = outer(2)',
    ].join('\n'))
    const entries = events(result).filter(event => event.type === 'function-entry')
    const countdownEntries = entries.filter(event => event.function === 'countdown')

    expect(result.error).toBeNull()
    expect(new Set(countdownEntries.map(event => event.callId)).size).toBe(3)
    expect(countdownEntries.map(event => event.callDepth)).toEqual([2, 3, 4])
    expect(countdownEntries.every(event => event.stack.some(frame => frame.function === 'outer'))).toBe(true)
  })

  it('records handled and unhandled exceptions without losing the exception wire event', () => {
    const handled = record('try:\n    x = 1 / 0\nexcept ZeroDivisionError as err:\n    handled = str(err)\n')
    const unhandled = record('x = 1\nraise ValueError("boom")\n')

    expect(handled.error).toBeNull()
    expect(events(handled).some(event => event.type === 'exception' && event.exception?.type === 'ZeroDivisionError')).toBe(true)
    expect(events(handled).flatMap(event => event.writes ?? []).some(write => write.name === 'err')).toBe(true)
    expect(unhandled.error).toBe('ValueError: boom')
    expect(events(unhandled).some(event => event.type === 'exception' && event.exception?.message === 'boom')).toBe(true)
    const exceptionalExit = events(unhandled).find(event => event.type === 'function-exception-exit' && event.exception?.type === 'ValueError')
    expect(exceptionalExit).toBeDefined()
    expect(events(unhandled).some(event => event.type === 'function-return' && event.callId === exceptionalExit?.callId)).toBe(false)
  })

  it('records generator yields and resumes as ordered protocol events', () => {
    const result = record([
      'def values():',
      '    yield 1',
      '    yield 2',
      'stream = values()',
      'first = next(stream)',
      'second = next(stream)',
      'try:',
      '    next(stream)',
      'except StopIteration:',
      '    pass',
    ].join('\n'))
    const generatorEvents = events(result).filter(event => event.function === 'values')

    expect(result.error).toBeNull()
    const yields = generatorEvents.filter(event => event.type === 'generator-yield')
    const resumes = generatorEvents.filter(event => event.type === 'generator-resume')
    const returns = generatorEvents.filter(event => event.type === 'function-return')

    expect(generatorEvents.some(event => event.type === 'function-entry')).toBe(true)
    expect(yields).toHaveLength(2)
    // The third resume is the call that exhausts the generator and produces
    // its single terminal function-return event.
    expect(resumes).toHaveLength(2)
    expect(returns).toHaveLength(1)
    expect(new Set([...yields, ...resumes, ...returns].map(event => event.callId)).size).toBe(1)
    expect(generatorEvents.map(event => event.sequence)).toEqual([...generatorEvents.map(event => event.sequence)].sort((a, b) => a - b))
  })

  it('distinguishes an in-place mutation from a deletion', () => {
    const result = record('items = []\nitems.append(1)\ndel items\n')
    const recordedEvents = events(result)

    expect(recordedEvents.flatMap(event => event.writes ?? [])).toContainEqual(
      expect.objectContaining({ name: 'items', operation: 'mutation', changed: true }),
    )
    expect(recordedEvents.flatMap(event => event.deletes ?? [])).toContainEqual(
      expect.objectContaining({ name: 'items', operation: 'delete' }),
    )
  })

  it('only publishes user-visible runtime values into the catalogue', () => {
    const result = record('import math\nvisible = 1\n__hidden = 2\n')
    const names = result.batches.flatMap(batch => batch.catalogue).map(item => item.name)

    expect(names).toContain('visible')
    expect(names).not.toContain('math')
    expect(names).not.toContain('__hidden')
    expect(names).not.toContain('trace_table_enabled')
  })

  it('does not expose recorder helper globals through the inspector snapshot', () => {
    const result = record('visible = 1\nmarker = 2\n', { pauseOnFirstLine: true, traceCommand: 0 })
    const names = result.inspectorSnapshots.flatMap(snapshot =>
      snapshot.Inspector?.views?.globals?.node?.entries?.map(entry => entry.label) ?? [],
    )

    expect(names).toContain('visible')
    expect(names).not.toContain('trace_table_enabled')
    expect(names).not.toContain('trace_table_frames')
    expect(names).not.toContain('trace_table_record')
    expect(names).not.toContain('trace_runtime_global_names')
  })

  it('flushes ordered final batches after a long uninterrupted trace', () => {
    const code = Array.from({ length: 70 }, (_, index) => `value = ${index}`).join('\n')
    const result = record(code)
    const flattened = events(result)
    const sequences = flattened.map(event => event.sequence)

    expect(result.error).toBeNull()
    expect(result.batches.length).toBeGreaterThan(1)
    expect(sequences).toEqual(Array.from({ length: sequences.length }, (_, index) => index + 1))
    expect(result.batches.at(-1)?.events.length).toBeGreaterThan(0)
  })
})

describe.skipIf(pythonAvailable)('tracer worker embedded Python recorder', () => {
  it('is skipped because native Python is unavailable', () => {
    // The worker itself runs in Pyodide. This integration harness uses native
    // Python only to make the recorder contract deterministic in CI.
  })
})
