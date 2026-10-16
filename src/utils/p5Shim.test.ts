import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Coder's p5 (src/python/p5) under native Python. Headless — no page, as in
// the tester worker — a sketch runs setup() and then draw() a set number of
// times and keeps what it drew (`_coder_capture`), which is what most of
// these read. With a fake `_coder_tk_host` in 'sync' mode (the trace worker's
// kind) the real frame loop runs on tkinter's timers, so the sketch's window,
// its frames and its events can be checked as the page would receive them.
// What the page then paints is p5Draw.test.ts.

const pythonAvailable = spawnSync('python', ['--version']).status === 0
const SRC = resolve(__dirname, '../python')

interface RunOptions {
  /** A fake page in 'sync' mode: the frame loop runs, and `EVENTS` (built by the body) are polled. */
  host?: boolean
}

function py(body: string, options: RunOptions = {}) {
  const preamble = [
    'import sys, json, types, time',
    `sys.path.insert(0, ${JSON.stringify(SRC)})`,
    'OPS = []',
    'EVENTS = []',
    ...(options.host ? [
      'host = types.ModuleType("_coder_tk_host")',
      'host.mode = "sync"',
      'host.flush = lambda s: OPS.extend(json.loads(s))',
      'host.query = lambda s: "null"',
      'host.poll = lambda: json.dumps([EVENTS.pop(0)]) if EVENTS else ""',
      'host.should_stop = lambda: False',
      'host.sleep_sync = lambda ms, interruptible=False: time.sleep(ms / 1000.0)',
      'host.dialog_sync = lambda s: "null"',
      'sys.modules["_coder_tk_host"] = host',
    ] : []),
    'import p5',
    'def sketch(code, frames=1, mouse=None, pressed=False):',
    '    p5._coder_test_config(frames=frames, mouse=mouse, pressed=pressed)',
    '    ns = {"__name__": "__main__"}',
    '    exec(compile(code, "simulation.py", "exec"), ns)',
    '    p5._coder_autorun(ns)',
    '    return ns, json.loads(p5._coder_capture())',
    'def out(*values):',
    '    print(json.dumps(values if len(values) != 1 else values[0], default=str))',
  ].join('\n')
  const result = spawnSync('python', ['-c', `${preamble}\n${body}`], { encoding: 'utf8', timeout: 20_000 })
  const lines = result.stdout.split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line) } catch { return line }
  })
  return { status: result.status, lines, stdout: result.stdout, stderr: result.stderr }
}

const src = (...lines: string[]) => JSON.stringify(lines.join('\n'))

describe.skipIf(!pythonAvailable)('Coder’s p5 under native Python', () => {
  it('runs setup() once and draw() once per frame, publishing frame_count and the size into the sketch', () => {
    const r = py([
      `ns, cap = sketch(${src(
        'from p5 import *',
        'seen = []',
        'def setup():',
        '    size(200, 120)',
        '    seen.append(("setup", width, height, frame_count))',
        'def draw():',
        '    seen.append(("draw", frame_count, mouseX, mouse_y))',
        'run()',
      )}, frames=3, mouse=(15, 25))`,
      'out(ns["seen"], cap["w"], cap["h"], cap["started"])',
    ].join('\n'))
    expect(r.stderr).toBe('')
    expect(r.lines[0]).toEqual([
      [['setup', 200, 120, 0], ['draw', 1, 15, 25], ['draw', 2, 15, 25], ['draw', 3, 15, 25]],
      200, 120, true,
    ])
  })

  it('starts a sketch that never calls run(), and draws draw() once after no_loop() in setup', () => {
    const r = py([
      `ns, cap = sketch(${src(
        'from pyp5js import *',
        'count = 0',
        'def setup():',
        '    createCanvas(50, 50)',
        '    noLoop()',
        'def draw():',
        '    global count',
        '    count += 1',
        '    background(255, 0, 0)',
      )}, frames=10)`,
      'out(ns["count"], cap["ops"])',
    ].join('\n'))
    expect(r.stderr).toBe('')
    expect(r.lines[0]).toEqual([1, [['bg', 'rgb(255,0,0)']]])
  })

  it('keeps only what an opaque background has not painted over, with the state re-sent after it', () => {
    const r = py([
      `ns, cap = sketch(${src(
        'from p5 import *',
        'def setup():',
        '    size(100, 100)',
        'def draw():',
        '    fill(0, 255, 0)',
        '    circle(10, 10, 5)',
        '    background(0, 0, 0, 100)',
        '    circle(20, 20, 5)',
        '    background(200)',
        '    rect(1, 2, 3, 4)',
        'run()',
      )}, frames=2)`,
      'out(cap["ops"])',
    ].join('\n'))
    expect(r.stderr).toBe('')
    expect(r.lines[0]).toEqual([
      ['bg', 'rgb(200,200,200)'],
      ['tf', 1, 0, 0, 1, 0, 0], ['fs', 'rgb(0,255,0)'], ['ss', 'rgb(0,0,0)'], ['lw', 1], ['cap', 'round'], ['join', 'miter'],
      ['r', 1, 2, 3, 4],
    ])
  })

  it('works out colours in Python: greys, RGB with alpha, names, hex, HSB and color() objects', () => {
    const r = py([
      'from p5 import *',
      'out(color(128)._css(), color(255, 0, 0, 128)._css(), color("orange")._css(), color("#0f08")._css())',
      'color_mode(HSB)',
      'out(color(120, 100, 100)._css(), color(0, 0, 50)._css())',
      'color_mode(HSB, 1)',
      'out(color(0.5, 1, 1)._css())',
      'color_mode(RGB)',
      'c = lerp_color(color(0), color(255, 0, 0), 0.5)',
      'out(c._css(), red(color(10, 20, 30)), green("lime"), alpha(color(1, 2, 3, 40)))',
      'try:',
      '    fill("not a colour")',
      'except ValueError as e:',
      '    out(str(e))',
    ].join('\n'))
    expect(r.stderr).toBe('')
    expect(r.lines).toEqual([
      ['rgb(128,128,128)', 'rgba(255,0,0,0.502)', 'rgb(255,165,0)', 'rgba(0,255,0,0.533)'],
      ['rgb(0,255,0)', 'rgb(128,128,128)'],
      'rgb(0,255,255)',
      ['rgb(128,0,0)', 10, 255, 40],
      '"not a colour" is not a colour name p5 knows',
    ])
  })

  it('reads rect_mode and ellipse_mode, rounds corners, and normalises negative sizes', () => {
    const r = py([
      `ns, cap = sketch(${src(
        'from p5 import *',
        'def draw():',
        '    no_stroke()',
        '    rect_mode(CENTER)',
        '    rect(50, 50, 20, 10)',
        '    rect_mode(CORNERS)',
        '    rect(30, 30, 10, 20)',
        '    rect_mode(CORNER)',
        '    square(0, 0, 10, 50)',
        '    rect(0, 0, 40, 20, 1, 2, 3, 4)',
        '    ellipse_mode(CORNER)',
        '    ellipse(10, 10, 20, 10)',
        '    ellipse_mode(RADIUS)',
        '    circle(5, 5, 4)',
        'run()',
      )})`,
      'out([op for op in cap["ops"] if op[0] in ("r", "e")])',
    ].join('\n'))
    expect(r.stderr).toBe('')
    expect(r.lines[0]).toEqual([
      ['r', 40, 45, 20, 10],
      ['r', 10, 20, 20, 10],
      ['r', 0, 0, 10, 10, [5, 5, 5, 5]],
      ['r', 0, 0, 40, 20, [1, 2, 3, 4]],
      ['e', 20, 15, 10, 5],
      ['e', 5, 5, 4, 4],
    ])
  })

  it('sends the transformation as a matrix, with push() and pop() restoring it and the style', () => {
    const r = py([
      `ns, cap = sketch(${src(
        'from p5 import *',
        'def draw():',
        '    angle_mode(DEGREES)',
        '    push()',
        '    translate(10, 20)',
        '    rotate(90)',
        '    scale(2)',
        '    fill(255, 0, 0)',
        '    point(1, 1)',
        '    rect(0, 0, 1, 1)',
        '    pop()',
        '    rect(0, 0, 1, 1)',
        'run()',
      )})`,
      'out([op for op in cap["ops"] if op[0] in ("tf", "fs", "r")])',
    ].join('\n'))
    expect(r.stderr).toBe('')
    expect(r.lines[0]).toEqual([
      ['tf', 0, 2, -2, 0, 10, 20],
      ['fs', 'rgb(255,0,0)'],
      ['r', 0, 0, 1, 1],
      ['tf', 1, 0, 0, 1, 0, 0],
      ['fs', 'rgb(255,255,255)'],
      ['r', 0, 0, 1, 1],
    ])
  })

  it('draws arcs clockwise from start to stop, in degrees too, and full turns as whole ellipses', () => {
    const r = py([
      `ns, cap = sketch(${src(
        'from p5 import *',
        'def draw():',
        '    arc(50, 50, 40, 40, 0, HALF_PI)',
        '    arc(50, 50, 40, 40, -HALF_PI, 0, PIE)',
        '    angle_mode(DEGREES)',
        '    arc(50, 50, 40, 40, 270, 90, CHORD)',
        '    arc(50, 50, 40, 40, 0, 360)',
        'run()',
      )})`,
      'out([op for op in cap["ops"] if op[0] == "a"])',
    ].join('\n'))
    expect(r.stderr).toBe('')
    expect(r.lines[0]).toEqual([
      ['a', 50, 50, 20, 20, 0, 1.571, 'default'],
      ['a', 50, 50, 20, 20, 4.712, 6.283, 'pie'],
      ['a', 50, 50, 20, 20, 4.712, 7.854, 'chord'],
      ['a', 50, 50, 20, 20, 0, 6.283, 'default'],
    ])
  })

  it('builds begin_shape() paths: polygons, curves through curve_vertex(), holes and the kinds', () => {
    const r = py([
      `ns, cap = sketch(${src(
        'from p5 import *',
        'def draw():',
        '    begin_shape()',
        '    vertex(0, 0); vertex(10, 0); vertex(10, 10)',
        '    end_shape(CLOSE)',
        '    begin_shape()',
        '    for x, y in [(0, 0), (0, 0), (10, 10), (20, 0), (20, 0)]:',
        '        curve_vertex(x, y)',
        '    end_shape()',
        '    begin_shape()',
        '    vertex(0, 0); vertex(30, 0); vertex(30, 30); vertex(0, 30)',
        '    begin_contour()',
        '    vertex(10, 10); vertex(10, 20); vertex(20, 20)',
        '    end_contour()',
        '    end_shape(CLOSE)',
        '    begin_shape(TRIANGLES)',
        '    for i in range(6):',
        '        vertex(i, i)',
        '    end_shape()',
        'run()',
      )})`,
      'out([op for op in cap["ops"] if op[0] in ("p", "sh")])',
    ].join('\n'))
    expect(r.stderr).toBe('')
    const [poly, curve, holed, t1, t2] = r.lines[0]
    expect(poly).toEqual(['p', [0, 0, 10, 0, 10, 10], 1])
    expect(curve[0]).toBe('sh')
    expect(curve[1][0]).toEqual(['M', 0, 0])
    expect(curve[1].slice(1).map((s: unknown[]) => s[0])).toEqual(['C', 'C'])
    expect(holed[1].map((s: unknown[]) => s[0])).toEqual(['M', 'L', 'L', 'L', 'Z', 'M', 'L', 'L', 'Z'])
    expect([t1, t2]).toEqual([['p', [0, 0, 1, 1, 2, 2], 1], ['p', [3, 3, 4, 4, 5, 5], 1]])
  })

  it('writes text with the font, alignment and leading worked out, one line at a time', () => {
    const r = py([
      `ns, cap = sketch(${src(
        'from p5 import *',
        'def draw():',
        '    text_size(20)',
        '    text_style(BOLD)',
        '    text_font("Georgia")',
        '    text_align(CENTER, CENTER)',
        '    text("one\\ntwo", 50, 50)',
        '    stroke(255, 0, 0)',
        '    text(42, 0, 0)',
        'run()',
      )})`,
      'out([op for op in cap["ops"] if op[0] in ("font", "ta", "t")])',
    ].join('\n'))
    expect(r.stderr).toBe('')
    expect(r.lines[0]).toEqual([
      ['font', 'bold 20px "Georgia"'],
      ['ta', 'center', 'middle'],
      ['t', 'one', 50, 37.5, 0],
      ['t', 'two', 50, 62.5, 0],
      // A stroke set with stroke() outlines text; the default black does not.
      ['t', '42', 0, 0, 1],
    ])
  })

  it('leaves a shape out when a number in it is not a number, and says when a value is the wrong type', () => {
    const r = py([
      `ns, cap = sketch(${src(
        'from p5 import *',
        'def draw():',
        '    circle(float("nan"), 0, 10)',
        '    try:',
        '        circle(0, 0, "big")',
        '    except TypeError as e:',
        '        print(e)',
        'run()',
      )})`,
      'out([op for op in cap["ops"] if op[0] == "e"])',
    ].join('\n'))
    expect(r.stderr).toBe('')
    expect(r.lines).toEqual(['width must be a number, not str', []])
  })

  it('keeps Python’s random module and map() working after from p5 import *', () => {
    const r = py([
      'import random',
      'from p5 import *',
      'random.seed(1); a = random.randint(1, 100)',
      'random.seed(1); b = random.randint(1, 100)',
      'random_seed(5); x = [random(10) for _ in range(3)]',
      'random_seed(5); y = [random(10) for _ in range(3)]',
      'out(a == b, x == y, all(0 <= v < 10 for v in x), random(["a"]), list(map(int, ["1", "2"])), map(5, 0, 10, 0, 100))',
      'noise_seed(3); n1 = [noise(i * 0.1) for i in range(20)]',
      'noise_seed(3); n2 = [noise(i * 0.1) for i in range(20)]',
      'out(n1 == n2, all(0 <= v <= 1 for v in n1), max(abs(n1[i + 1] - n1[i]) for i in range(19)) < 0.2)',
      'out(constrain(15, 0, 10), lerp(0, 10, 0.25), dist(0, 0, 3, 4), floor(2.7), norm(5, 0, 10))',
    ].join('\n'))
    expect(r.stderr).toBe('')
    expect(r.lines).toEqual([
      [true, true, true, 'a', [1, 2], 50],
      [true, true, true],
      [10, 2.5, 5, 2, 0.5],
    ])
  })

  it('does vector arithmetic as p5 does: add() changes the vector, + makes a new one', () => {
    const r = py([
      'from p5 import *',
      'v = create_vector(3, 4)',
      'w = v + Vector(1, 1)',
      'v.add(1, 0)',
      'u = Vector(10, 0).limit(5)',
      'angle_mode(DEGREES)',
      'h = Vector(0, 1).heading()',
      'r = Vector(1, 0).rotate(90)',
      'out(repr(v), repr(w), v.mag(), repr(u), h, round(r.x, 6), round(r.y, 6), repr(Vector.from_angle(0, 2)), PVector is Vector)',
    ].join('\n'))
    expect(r.stderr).toBe('')
    expect(r.lines[0]).toEqual(['Vector(4, 4)', 'Vector(4, 5)', Math.sqrt(32), 'Vector(5, 0)', 90, 0, 1, 'Vector(2, 0)', true])
  })

  it('leaves the program’s own variable of the same name alone', () => {
    const r = py([
      `ns, cap = sketch(${src(
        'from p5 import *',
        'key = "mine"',
        'def draw():',
        '    pass',
        'run()',
      )})`,
      'out(ns["key"], ns["mouse_x"], ns["frame_count"])',
    ].join('\n'))
    expect(r.stderr).toBe('')
    expect(r.lines[0]).toEqual(['mine', 0, 1])
  })

  it('reads image sizes from their files', () => {
    const r = py([
      'import base64, os, tempfile',
      'png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAEElEQVR4nGNgYGD4z8DAAAAEBAEAqKfpWAAAAABJRU5ErkJggg==")',
      'path = os.path.join(tempfile.mkdtemp(), "tiny.png")',
      'open(path, "wb").write(png)',
      'from p5 import *',
      'img = load_image(path)',
      'out(img.width, img.height)',
      'try:',
      '    load_image("nowhere.png")',
      'except FileNotFoundError as e:',
      '    out(str(e))',
    ].join('\n'))
    expect(r.stderr).toBe('')
    expect(r.lines).toEqual([[3, 2], 'load_image() could not find "nowhere.png" — is the file in your filesystem?'])
  })

  it('on a page: makes a canvas window, sends each frame, and ends when the sketch can do nothing more', () => {
    const r = py([
      'code = ' + src(
        'from p5 import *',
        'def setup():',
        '    size(120, 80)',
        'def draw():',
        '    background(frame_count)',
        '    if frame_count == 3:',
        '        no_loop()',
        'run()',
        'print("run returned")',
      ),
      'exec(compile(code, "simulation.py", "exec"), {"__name__": "__main__"})',
      'import tkinter',
      'tkinter._app.flush()',
      'out([op[2] for op in OPS if op[0] == "create"])',
      'out([op[2] for op in OPS if op[0] == "ctx2d"])',
    ].join('\n'), { host: true })
    expect(r.stderr).toBe('')
    expect(r.lines[0]).toBe('run returned')
    expect(r.lines[1]).toEqual(['toplevel', 'canvas2d'])
    // The size goes with the first batch, then one batch per frame.
    expect(r.lines[2]).toEqual([
      [['size', 120, 80]],
      [['bg', 'rgb(1,1,1)']],
      [['bg', 'rgb(2,2,2)']],
      [['bg', 'rgb(3,3,3)']],
    ])
  })

  it('on a page: the mouse and keys reach the sketch’s variables and functions', () => {
    const r = py([
      'code = ' + src(
        'from p5 import *',
        'log = []',
        'def draw():',
        '    if frame_count > 30:',
        '        raise SystemExit',
        'def mouse_pressed():',
        '    log.append(("press", mouse_x, mouse_y, mouse_is_pressed, mouse_button))',
        'def mouse_released():',
        '    log.append(("release", mouse_is_pressed))',
        'def key_pressed():',
        '    log.append(("key", key, key_code, key_is_down(LEFT_ARROW)))',
        'def key_released():',
        '    log.append(("up", key_is_pressed))',
        'run()',
      ),
      'def queue():',
      '    import p5',
      '    c, root = p5._s.canvas._id, p5._s.root._id',
      '    EVENTS.extend([',
      '        {"t": "mouse", "k": "motion", "w": c, "x": 30, "y": 40, "m": 0},',
      '        {"t": "mouse", "k": "press", "w": c, "x": 31, "y": 41, "b": 3, "n": 1, "m": 0},',
      '        {"t": "mouse", "k": "release", "w": c, "x": 31, "y": 41, "b": 3, "m": 0},',
      '        {"t": "key", "k": "press", "w": root, "key": "ArrowLeft", "code": "ArrowLeft", "kc": 37, "m": 0},',
      '        {"t": "key", "k": "press", "w": root, "key": "ArrowLeft", "code": "ArrowLeft", "kc": 37, "m": 0},',
      '        {"t": "key", "k": "release", "w": root, "key": "ArrowLeft", "code": "ArrowLeft", "kc": 37, "m": 0},',
      '    ])',
      'import p5',
      'original = p5._make_window',
      'def make_and_queue():',
      '    original()',
      '    queue()',
      'p5._make_window = make_and_queue',
      'ns = {"__name__": "__main__"}',
      'try:',
      '    exec(compile(code, "simulation.py", "exec"), ns)',
      'except SystemExit:',
      '    pass',
      'out(ns["log"])',
    ].join('\n'), { host: true })
    expect(r.stderr).toBe('')
    expect(r.lines[0]).toEqual([
      ['press', 31, 41, true, 'right'],
      ['release', false],
      // The browser repeats a held key; the sketch hears one press.
      ['key', 'ArrowLeft', 37, true],
      ['up', false],
    ])
  })

  it('on a page: an error in draw() ends run() with the student’s own line in the traceback', () => {
    const r = py([
      'code = ' + src(
        'from p5 import *',
        'def draw():',
        '    if frame_count == 2:',
        '        1 / 0',
        'run()',
      ),
      'import traceback',
      'try:',
      '    exec(compile(code, "simulation.py", "exec"), {"__name__": "__main__"})',
      'except ZeroDivisionError:',
      '    tb = traceback.format_exc()',
      '    out("simulation.py\\", line 4" in tb, "_tick" in tb)',
    ].join('\n'), { host: true })
    expect(r.stderr).toBe('')
    expect(r.lines[0]).toEqual([true, false])
  })
})
