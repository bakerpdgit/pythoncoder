import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// CPython's own turtle.py (src/python/turtle.py, vendored unmodified) running
// on Coder's tkinter under native Python, against a fake `_coder_tk_host`.
// What is pinned down here is what the page receives — operations, the view
// that centres the drawing, the pauses that make it animate — and that the
// errors a student sees are CPython's own. tkinterShim.test.ts covers the
// package on its own; the page side is tkinterRenderer.test.ts.

const pythonAvailable = spawnSync('python', ['--version']).status === 0
const SRC = resolve(__dirname, '../python')

interface RunOptions {
  /** Batches of events, one batch per poll(). */
  events?: unknown[][]
  /** Pretend the browser has JSPI, so pauses really pause and mainloop() loops. */
  jspi?: boolean
  /** Pretend to be the trace worker's host, which blocks itself ('sync'). */
  sync?: boolean
  /** What dialog_sync answers (a JSON value), for textinput() / numinput(). */
  dialogs?: unknown[]
  /** The turtle bootstrap's flag: done() returns once nothing could happen. */
  idleExit?: boolean
}

function py(body: string, options: RunOptions = {}) {
  const preamble = [
    'import sys, json, types, time',
    'sys.dont_write_bytecode = True',
    `sys.path.insert(0, ${JSON.stringify(SRC)})`,
    'OPS = []',
    'FLUSHES = []',
    'SLEEPS = []',
    `EVENTS = json.loads(${JSON.stringify(JSON.stringify(options.events ?? []))})`,
    `DIALOGS = json.loads(${JSON.stringify(JSON.stringify(options.dialogs ?? []))})`,
    // Every widget is the size of turtle's default window on the 1366x768
    // screen the package assumes, so the view the canvas settles on is fixed.
    'def query(s):',
    '    q = json.loads(s)',
    '    if q.get("q") == "geom":',
    '        return json.dumps({"w": 683, "h": 576, "x": 0, "y": 0, "rx": 0, "ry": 0, "m": 1, "rw": 683, "rh": 576})',
    '    return "null"',
    'def flush(s):',
    '    batch = json.loads(s)',
    '    FLUSHES.append(batch)',
    '    OPS.extend(batch)',
    'host = types.ModuleType("_coder_tk_host")',
    'host.flush = flush',
    'host.query = query',
    'host.poll = lambda: json.dumps(EVENTS.pop(0)) if EVENTS else ""',
    'host.should_stop = lambda: False',
    'host.sleep = lambda ms, interruptible=True: SLEEPS.append((ms, interruptible))',
    'host.dialog = lambda s: json.dumps(DIALOGS.pop(0)) if DIALOGS else "null"',
    'host.dialog_sync = lambda s: json.dumps(DIALOGS.pop(0)) if DIALOGS else "null"',
    ...(options.sync ? [
      'host.mode = "sync"',
      'host.sleep_sync = lambda ms, interruptible: SLEEPS.append((ms, interruptible))',
    ] : []),
    'sys.modules["_coder_tk_host"] = host',
    ...(options.jspi ? [
      'ffi = types.ModuleType("pyodide.ffi")',
      'ffi.can_run_sync = lambda: True',
      'ffi.run_sync = lambda awaitable: awaitable',
      'pkg = types.ModuleType("pyodide")',
      'pkg.ffi = ffi',
      'sys.modules["pyodide"] = pkg',
      'sys.modules["pyodide.ffi"] = ffi',
    ] : []),
    'import tkinter as tk',
    `tk._app.idle_exit = ${options.idleExit ? 'True' : 'False'}`,
    'import turtle',
    'def ops(name):',
    '    tk._app.flush()',
    '    return [o for o in OPS if o[0] == name]',
    'def out(*values):',
    '    print(json.dumps(values if len(values) != 1 else values[0], default=str))',
  ].join('\n')
  const result = spawnSync('python', ['-c', `${preamble}\n${body}`], { encoding: 'utf8', timeout: 30_000 })
  const lines = result.stdout.split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line) } catch { return line }
  })
  return { status: result.status, lines, stdout: result.stdout, stderr: result.stderr }
}

describe.skipIf(!pythonAvailable)('CPython\'s turtle on the browser tkinter', () => {
  it('is the vendored module, in a window titled as IDLE titles it', () => {
    const r = py([
      'import os',
      's = turtle.Screen()',
      'out(os.path.relpath(turtle.__file__, sys.path[0]), s._root.title(), s.window_width(), s.window_height())',
    ].join('\n'))
    expect(r.stderr).toBe('')
    expect(r.lines[0]).toEqual(['turtle.py', 'Python Turtle Graphics', 683, 576])
  })

  it('scrolls its canvas so that (0, 0) is in the middle, by Tk\'s arithmetic', () => {
    const r = py([
      's = turtle.Screen()',
      'cv = s.getcanvas()',
      'out(ops("cvview")[-1], cv.canvasx(341), cv.canvasy(288), [round(f, 4) for f in cv.xview()])',
    ].join('\n'))
    expect(r.stderr).toBe('')
    // Region -200..200 by -150..150 in a 683x576 window with a 4px inset.
    const [view, x, y, fractions] = r.lines[0]
    expect(view).toEqual(['cvview', expect.any(Number), -345, -291])
    expect([x, y]).toEqual([-4, -3])
    expect(fractions).toEqual([0, 1])
  })

  it('raises only what moved, and leaves the canvas options alone while drawing', () => {
    const r = py([
      't = turtle.Turtle()',
      'OPS.clear()',
      'for _ in range(4):',
      '    t.forward(50)',
      '    t.left(90)',
      'counts = {}',
      'for o in ops("cvraise") + ops("cvorder") + ops("cvcoords") + ops("cvitem") + ops("config"):',
      '    counts[o[0]] = counts.get(o[0], 0) + 1',
      'out(counts)',
    ].join('\n'))
    expect(r.stderr).toBe('')
    const counts = r.lines[0]
    expect(counts.cvorder).toBeUndefined()
    expect(counts.config).toBeUndefined()
    expect(counts.cvraise).toBeGreaterThan(0)
    // Moving is coordinates; a fresh item (and its colours) only now and then.
    expect(counts.cvcoords).toBeGreaterThan(counts.cvitem ?? 0)
  })

  it('animates with its own pauses: one 10ms delay per update, fixed-length', () => {
    const r = py([
      't = turtle.Turtle()',
      't.speed(0)',
      'SLEEPS.clear()',
      't.forward(100)',
      'zero = list(SLEEPS)',
      't.speed(1)',
      'SLEEPS.clear()',
      't.forward(100)',
      'out(zero, len(SLEEPS), sorted(set(SLEEPS)))',
    ].join('\n'), { jspi: true })
    expect(r.stderr).toBe('')
    const [zero, slowCount, kinds] = r.lines[0]
    // speed(0) still updates once, with the screen's 10ms delay, as in CPython.
    expect(zero).toEqual([[10, false]])
    // speed(1): 1 + int(100 / 3.3) hops, each an update and a 10ms pause.
    expect(slowCount).toBeGreaterThanOrEqual(30)
    // Never interruptible: pressing keys cannot speed a drawing up.
    expect(kinds).toEqual([[10, false]])
  })

  it('draws a tracer(0) program in one batch at update()', () => {
    const r = py([
      'turtle.tracer(0)',
      't = turtle.Turtle()',
      'FLUSHES.clear()',
      'for i in range(500):',
      '    t.forward(2)',
      '    t.left(1)',
      'before = len(FLUSHES)',
      'turtle.update()',
      'out(before, len(FLUSHES))',
    ].join('\n'))
    expect(r.stderr).toBe('')
    expect(r.lines[0]).toEqual([0, 1])
  })

  it('skips its delays when nothing can wait for the page', () => {
    const r = py([
      't = turtle.Turtle()',
      't.speed(1)',
      'start = time.monotonic()',
      't.circle(100)',
      'out(SLEEPS, time.monotonic() - start < 2)',
    ].join('\n'))
    expect(r.lines[0]).toEqual([[], true])
  })

  it('reports a bad colour and a browser key name as CPython does', () => {
    const r = py([
      't = turtle.Turtle()',
      'try:',
      '    t.color("bleu")',
      'except turtle.TurtleGraphicsError as e:',
      '    out(str(e))',
      't.color("DarkOliveGreen3")',
      'out(t.pencolor())',
      's = turtle.Screen()',
      'try:',
      '    s.onkey(lambda: None, "ArrowUp")',
      'except tk.TclError as e:',
      '    out(str(e))',
      's.onkey(lambda: None, "Up")',
      'out("Up is fine")',
    ].join('\n'))
    expect(r.lines).toEqual([
      'bad color string: bleu',
      'DarkOliveGreen3',
      'bad event type or keysym "ArrowUp"',
      'Up is fine',
    ])
  })

  it('asks textinput() and numinput() through a dialog', () => {
    const r = py([
      's = turtle.Screen()',
      'out(s.textinput("Name", "Your name?"), s.numinput("Sides", "How many?", 4, minval=3, maxval=10))',
    ].join('\n'), { dialogs: ['Ada', '6'] })
    expect(r.stderr).toBe('')
    expect(r.lines[0]).toEqual(['Ada', 6])
  })

  it('finishes done() at once when nothing could happen, and waits when keys are bound', () => {
    const plain = py([
      't = turtle.Turtle()',
      't.forward(10)',
      'turtle.done()',
      'out("done returned", tk._app.wants_events())',
    ].join('\n'), { jspi: true, idleExit: true })
    expect(plain.stderr).toBe('')
    expect(plain.lines).toEqual([['done returned', false]])

    // With a key bound, done() runs the event loop: the key moves the turtle,
    // and closing the window ends it. (Every animation step polls for events,
    // as Tk's update() does, so the close is queued after the move has room
    // to finish.)
    const keyed = py([
      's = turtle.Screen()',
      't = turtle.Turtle()',
      't.speed(0)',
      's.onkey(lambda: t.forward(30), "Up")',
      's.listen()',
      'cid = s.getcanvas()._canvas._id',
      'EVENTS.extend([[], [{"t": "key", "k": "press", "w": cid, "key": "ArrowUp", "code": "ArrowUp"}, {"t": "key", "k": "release", "w": cid, "key": "ArrowUp", "code": "ArrowUp"}], [], [], [], [{"t": "close", "w": s._root._id}]])',
      'try:',
      '    turtle.done()',
      'except turtle.Terminator:',
      '    pass',
      'out("after", t.xcor())',
    ].join('\n'), { jspi: true, idleExit: true })
    expect(keyed.stderr).toBe('')
    expect(keyed.lines).toEqual([['after', 30]])
  })

  it('raises Terminator after the window is closed, as in IDLE', () => {
    const r = py([
      's = turtle.Screen()',
      't = turtle.Turtle()',
      'tk._app.deliver(tk._app.handle, {"t": "close", "w": s._root._id})',
      'try:',
      '    t.forward(10)',
      'except turtle.Terminator:',
      '    out("Terminator")',
    ].join('\n'))
    expect(r.lines).toEqual(['Terminator'])
  })

  it('runs every page of the shipped Turtle book, and only page 10 waits for keys', () => {
    const r = py([
      'import glob, os, runpy',
      `for path in sorted(glob.glob(os.path.join(${JSON.stringify(resolve(__dirname, '../../Turtle'))}, "*.py"))):`,
      '    for name in [m for m in sys.modules if m == "turtle" or m == "tkinter" or m.startswith("tkinter.")]:',
      '        del sys.modules[name]',
      '    import tkinter as tk',
      '    tk._app.idle_exit = True',
      '    import turtle',
      '    runpy.run_path(path, run_name="__main__")',
      '    out(os.path.basename(path), tk._app.wants_events())',
    ].join('\n'))
    expect(r.stderr).toBe('')
    expect(r.lines).toHaveLength(10)
    expect(r.lines.filter((line: [string, boolean]) => line[1]).map((line: [string, boolean]) => line[0])).toEqual(['10_keyboard_control.py'])
  })

  it('marks one replay step per finished command: none for reading, one for update() under tracer(0)', () => {
    const r = py([
      'tk._coder_watch_turtle(turtle)',
      'def marks():',
      '    tk._app.flush()',
      '    n = sum(1 for o in OPS if o[0] == "mark")',
      '    OPS.clear()',
      '    return n',
      'counts = {}',
      't = turtle.Turtle(); counts["Turtle()"] = marks()',
      't.speed(0); counts["speed"] = marks()',
      'for _ in range(4):',
      '    t.forward(50)',
      '    t.left(90)',
      'counts["square"] = marks()',
      't.circle(30); counts["circle"] = marks()',
      't.pos(); t.heading(); counts["getters"] = marks()',
      'turtle.tracer(0)',
      'for _ in range(50):',
      '    t.forward(1)',
      'counts["tracer0"] = marks()',
      'turtle.update(); counts["update"] = marks()',
      'out(counts)',
    ].join('\n'))
    expect(r.stderr).toBe('')
    expect(r.lines[0]).toEqual({ 'Turtle()': 1, speed: 0, square: 8, circle: 1, getters: 0, tracer0: 0, update: 1 })
  })

  it('in the worker, pauses by blocking, and mainloop and the after-program loop wait for the student', () => {
    const r = py([
      't = turtle.Turtle()',
      't.speed(0)',
      'SLEEPS.clear()',
      't.forward(10)',
      'moved = list(SLEEPS)',
      's = turtle.Screen()',
      's.onkey(lambda: out("key", t.xcor()), "Up")',
      's.listen()',
      'cid = s.getcanvas()._canvas._id',
      'EVENTS.extend([[], [{"t": "key", "k": "release", "w": cid, "key": "ArrowUp", "code": "ArrowUp"}], [], [{"t": "close", "w": s._root._id}]])',
      'SLEEPS.clear()',
      'tk._coder_keepalive_sync()',
      'out("moved", moved, "waited", sorted(set(i for _, i in SLEEPS)))',
    ].join('\n'), { sync: true, idleExit: true })
    expect(r.stderr).toBe('')
    // A fixed 10ms delay per update; the event loop waits interruptibly.
    expect(r.lines).toEqual([['key', 10], ['moved', [[10, false]], 'waited', [true]]])
  })

  it('in the worker, answers textinput() through the host and checks for a stop afterwards', () => {
    const r = py([
      'stops = []',
      'host.should_stop = lambda: stops.append(1) or False',
      's = turtle.Screen()',
      'out(s.textinput("Name", "Your name?"), len(stops) > 0)',
    ].join('\n'), { sync: true, dialogs: ['Ada'] })
    expect(r.stderr).toBe('')
    expect(r.lines[0]).toEqual(['Ada', true])
  })

  it('writes one canonical SVG for drawings that are the same picture, whatever the route', () => {
    const r = py([
      'from tkinter._coder_svg import turtle_svg',
      'def drawing(program, include_turtles=False):',
      '    for name in [m for m in sys.modules if m in ("turtle", "tkinter") or m.startswith("tkinter.")]:',
      '        del sys.modules[name]',
      '    sys.modules["_coder_tk_host"] = host',
      '    exec(program, {"__name__": "__main__"})',
      '    import turtle as fresh',
      '    from tkinter._coder_svg import turtle_svg as svg',
      '    return svg(fresh, include_turtles)',
      'one = drawing("import turtle\\nt = turtle.Turtle()\\nfor _ in range(4):\\n    t.forward(100)\\n    t.left(90)\\n")',
      'two = drawing("import turtle\\nt = turtle.Turtle()\\nfor _ in range(4):\\n    t.forward(50)\\n    t.forward(50)\\n    t.right(270)\\n")',
      'red = drawing("import turtle\\nt = turtle.Turtle()\\nt.pencolor(\'red\')\\nfor _ in range(4):\\n    t.forward(100)\\n    t.left(90)\\n")',
      'dot = drawing("import turtle\\nt = turtle.Turtle()\\nt.dot(20, \'blue\')\\n")',
      'shown = drawing("import turtle\\nt = turtle.Turtle()\\nt.forward(10)\\n", True)',
      'out(one == two, one == red, "<circle" in dot and \'fill="#0000ff"\' in dot, one.count("<line"), "<polygon" in shown, "<polygon" in one)',
    ].join('\n'))
    expect(r.stderr).toBe('')
    // The same square by two routes is one picture; in red it is another; a
    // dot is a circle; the turtle itself appears only when asked for.
    expect(r.lines[0]).toEqual([true, false, true, 4, true, false])
  })

  it('keeps stamps, undo, clicks on the turtle and mode("logo") working', () => {
    const r = py([
      'turtle.mode("logo")',
      't = turtle.Turtle()',
      'heading = t.heading()',
      't.forward(20)',
      'pos_logo = [round(v) for v in t.pos()]',
      'sid = t.stamp()',
      't.clearstamp(sid)',
      't.forward(10)',
      't.undo()',
      'clicked = []',
      't.onclick(lambda x, y: clicked.append((x, y)))',
      'out(heading, pos_logo, [round(v) for v in t.pos()], t.undobufferentries() >= 1)',
    ].join('\n'))
    expect(r.stderr).toBe('')
    // Logo mode: facing north, so forward goes up the screen.
    expect(r.lines[0]).toEqual([0, [0, 20], [0, 20], true])
  })
})
