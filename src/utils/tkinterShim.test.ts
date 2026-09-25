import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The browser tkinter (src/python/tkinter) run under native Python against a
// fake `_coder_tk_host`: operations it sends are recorded, events can be
// scripted, and `pyodide.ffi` can be faked so that mainloop() runs its real
// JSPI loop. Everything a program can observe from Python — options, indices,
// bindings, variables, geometry errors — is pinned down here; what the page
// draws is tkinterRenderer.test.ts.

const pythonAvailable = spawnSync('python', ['--version']).status === 0
const SRC = resolve(__dirname, '../python')

interface RunOptions {
  /** Batches of events, one batch per poll() — the page's queue as it would fill. */
  events?: unknown[][]
  /** Pretend the browser has JSPI, so mainloop() blocks and runs the loop. */
  jspi?: boolean
}

function py(body: string, options: RunOptions = {}) {
  const preamble = [
    'import sys, json, types, time',
    `sys.path.insert(0, ${JSON.stringify(SRC)})`,
    'OPS = []',
    `EVENTS = json.loads(${JSON.stringify(JSON.stringify(options.events ?? []))})`,
    'host = types.ModuleType("_coder_tk_host")',
    'host.flush = lambda s: OPS.extend(json.loads(s))',
    'host.query = lambda s: "null"',
    'host.poll = lambda: json.dumps(EVENTS.pop(0)) if EVENTS else ""',
    'host.should_stop = lambda: False',
    'host.sleep = lambda ms: time.sleep(ms / 1000.0)',
    'host.dialog = lambda s: "null"',
    'host.dialog_sync = lambda s: "null"',
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
    'from tkinter import ttk',
    'def ops(name):',
    '    tk._app.flush()',
    '    return [o for o in OPS if o[0] == name]',
    'def out(*values):',
    '    print(json.dumps(values if len(values) != 1 else values[0], default=str))',
  ].join('\n')
  const result = spawnSync('python', ['-c', `${preamble}\n${body}`], { encoding: 'utf8', timeout: 20_000 })
  const lines = result.stdout.split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line) } catch { return line }
  })
  return { status: result.status, lines, stdout: result.stdout, stderr: result.stderr }
}

describe.skipIf(!pythonAvailable)('the browser tkinter under native Python', () => {
  it('names widgets and reports their class as tkinter does', () => {
    const r = py([
      'root = tk.Tk()',
      'f = tk.Frame(root); b = tk.Button(f); b2 = tk.Button(f); l = ttk.Label(root)',
      'class App(tk.Frame): pass',
      'a = App(root)',
      'out(str(f), str(b), str(b2), str(a), b.winfo_class(), l.winfo_class(), b.winfo_parent(), root.title())',
    ].join('\n'))
    expect(r.stderr).toBe('')
    expect(r.lines[0]).toEqual(['.!frame', '.!frame.!button', '.!frame.!button2', '.!app', 'Button', 'TLabel', '.!frame', 'tk'])
  })

  it('refuses options a widget does not have, naming them as the program wrote them', () => {
    const r = py([
      'root = tk.Tk()',
      'for make in (lambda: ttk.Button(root, bg="red"), lambda: tk.Label(root, colour="red")):',
      '    try:',
      '        make()',
      '    except tk.TclError as e:',
      '        out(str(e))',
      'lab = tk.Label(root, text="hi", fg="blue")',
      'out(lab.cget("fg"), lab["text"], lab.cget("relief"), lab.keys()[:3])',
    ].join('\n'))
    expect(r.lines).toEqual([
      'unknown option "-bg"',
      'unknown option "-colour"',
      ['blue', 'hi', 'flat', ['activebackground', 'activeforeground', 'anchor']],
    ])
  })

  it('will not mix pack and grid in one master, with Tk\'s own message', () => {
    const r = py([
      'root = tk.Tk()',
      'tk.Label(root).grid(row=0, column=0)',
      'try:',
      '    tk.Label(root).pack()',
      'except tk.TclError as e:',
      '    out(str(e))',
    ].join('\n'))
    expect(r.lines).toEqual(['cannot use geometry manager pack inside . which already has slaves managed by grid'])
  })

  it('keeps variables, traces and textvariable widgets in step', () => {
    const r = py([
      'root = tk.Tk()',
      'v = tk.StringVar(value="a")',
      'seen = []',
      'v.trace_add("write", lambda *args: seen.append(v.get()))',
      'lab = tk.Label(root, textvariable=v)',
      'v.set("b")',
      'labels = [o[2]["text"] for o in ops("config") if o[1] == lab._id]',
      'n = tk.IntVar(value="3.0")',
      'try:',
      '    tk.IntVar(value="x").get()',
      'except tk.TclError as e:',
      '    err = str(e)',
      'out(seen, labels[-1], n.get(), err, tk.BooleanVar(value="yes").get())',
    ].join('\n'))
    expect(r.lines[0]).toEqual([['b'], 'b', 3, 'expected floating-point number but got "x"', true])
  })

  it('edits an Entry by index and validates keystrokes with %P', () => {
    const r = py([
      'root = tk.Tk()',
      'e = tk.Entry(root)',
      'e.insert(0, "hello"); e.insert("end", "!"); e.delete(0, 1)',
      'first = e.get()',
      'digits = tk.Entry(root, validate="key")',
      'digits.configure(validatecommand=(root.register(lambda p: p.isdigit() or p == ""), "%P"))',
      'digits._on_edit({"v": "12"}); digits._on_edit({"v": "12x"})',
      'reverted = [o[2] for o in ops("value") if o[1] == digits._id]',
      'out(first, digits.get(), reverted[-1])',
    ].join('\n'))
    expect(r.lines[0]).toEqual(['ello!', '12', '12'])
  })

  it('answers Text indices as Tk does, final newline included', () => {
    const r = py([
      'root = tk.Tk()',
      't = tk.Text(root)',
      't.insert("end", "one\\ntwo")',
      'a = [t.get("1.0", "end"), t.index("end"), t.get("1.0", "end-1c"), t.index("2.end"), t.get("2.0", "2.0 lineend")]',
      't.insert("1.3", "!")',
      'b = [t.get("1.0", "1.end"), t.search("two", "1.0"), t.index("1.0+5c")]',
      't.delete("1.0", "end")',
      't2 = tk.Text(root, state="disabled"); t2.insert("end", "ignored")',
      'out(a, b, t.get("1.0", "end"), t2.get("1.0", "end-1c"))',
    ].join('\n'))
    expect(r.lines[0]).toEqual([
      ['one\ntwo\n', '3.0', 'one\ntwo', '2.3', 'two'],
      ['one!', '2.0', '2.0'],
      '\n',
      '',
    ])
  })

  it('parses event sequences and rejects the ones Tk rejects', () => {
    const r = py([
      'root = tk.Tk()',
      'good = [tk._parse_sequence(s) for s in ("<Button-1>", "<1>", "<Double-Button-1>", "<Return>", "<Control-s>", "<B1-Motion>", "a", "<Key>", "<<Custom>>")]',
      'bad = []',
      'for s in ("<enter>", "<Button-9>", "<Kye-a>"):',
      '    try:',
      '        tk._parse_sequence(s)',
      '    except tk.TclError as e:',
      '        bad.append(str(e))',
      'out([[p[0], p[1], sorted(p[2]), p[3]] for p in good], bad)',
    ].join('\n'))
    expect(r.lines[0]).toEqual([
      [
        ['ButtonPress', '1', [], 1], ['ButtonPress', '1', [], 1], ['ButtonPress', '1', [], 2],
        ['KeyPress', 'Return', [], 1], ['KeyPress', 's', ['Control'], 1], ['Motion', null, ['B1'], 1],
        ['KeyPress', 'a', [], 1], ['KeyPress', null, [], 1], ['Virtual', 'Custom', [], 1],
      ],
      ['bad event type or keysym "enter"', 'bad button number "9"', 'bad event type or keysym "Kye"'],
    ])
  })

  it('runs a widget binding before the window\'s, and "break" stops the rest', () => {
    const r = py([
      'root = tk.Tk()',
      'e = tk.Entry(root)',
      'calls = []',
      'e.bind("<Return>", lambda ev: calls.append(("entry", ev.keysym, ev.widget is e)))',
      'root.bind("<Return>", lambda ev: calls.append(("root", ev.keysym)))',
      'root.bind("<Key>", lambda ev: calls.append(("any", ev.char)))',
      'b = tk.Button(root)',
      'b.bind("<Return>", lambda ev: (calls.append(("button",)), "break")[1])',
      'tk._app.handle({"t": "key", "k": "press", "w": e._id, "key": "Enter", "code": "Enter", "m": 0})',
      'tk._app.handle({"t": "key", "k": "press", "w": b._id, "key": "Enter", "code": "Enter", "m": 0})',
      'tk._app.handle({"t": "key", "k": "press", "w": root._id, "key": "x", "code": "KeyX", "m": 0})',
      'out(calls)',
    ].join('\n'))
    expect(r.lines[0]).toEqual([['entry', 'Return', true], ['root', 'Return'], ['button'], ['any', 'x']])
  })

  it('clicks, ticks and selections from the page reach the program', () => {
    const r = py([
      'root = tk.Tk()',
      'log = []',
      'b = tk.Button(root, command=lambda: log.append("clicked"))',
      'v = tk.IntVar()',
      'cb = tk.Checkbutton(root, variable=v, command=lambda: log.append(("check", v.get())))',
      'choice = tk.StringVar(value="a")',
      'r1 = tk.Radiobutton(root, variable=choice, value="a"); r2 = tk.Radiobutton(root, variable=choice, value="b")',
      'lb = tk.Listbox(root); lb.insert("end", "x", "y", "z")',
      'lb.bind("<<ListboxSelect>>", lambda e: log.append(("pick", lb.curselection(), lb.get(lb.curselection()[0]))))',
      'for ev in ({"t": "cmd", "w": b._id}, {"t": "check", "w": cb._id, "v": True},',
      '           {"t": "radio", "w": r2._id}, {"t": "lbsel", "w": lb._id, "sel": [2]}):',
      '    tk._app.handle(ev)',
      'checked = [o[2]["checked"] for o in ops("config") if o[1] == r1._id]',
      'out(log, choice.get(), checked[-1])',
    ].join('\n'))
    expect(r.lines[0]).toEqual([['clicked', ['check', 1], ['pick', [2], 'z']], 'b', false])
  })

  it('moves, finds and tags canvas items, and runs item bindings first', () => {
    const r = py([
      'root = tk.Tk()',
      'c = tk.Canvas(root, width=200, height=100)',
      'a = c.create_rectangle(10, 10, 30, 30, fill="red", tags=("player", "solid"))',
      'b = c.create_oval(50, 50, 70, 70, tags="enemy")',
      'c.move("player", 5, 0)',
      'hits = []',
      'c.tag_bind("enemy", "<Button-1>", lambda e: hits.append(("enemy", c.gettags("current"))))',
      'c.bind("<Button-1>", lambda e: hits.append(("canvas", e.x, e.y)))',
      'tk._app.handle({"t": "mouse", "k": "press", "w": c._id, "i": b, "x": 60, "y": 60, "b": 1, "n": 1, "m": 0})',
      'c.itemconfig(a, fill="blue")',
      'res = [c.coords(a), c.bbox(a), c.find_overlapping(0, 0, 40, 40), c.find_withtag("solid"), c.itemcget(a, "fill"), c.type(b)]',
      'c.delete("enemy")',
      'out(res, hits, c.find_all(), c.cget("width"))',
      'try:',
      '    c.create_line(1, 2)',
      'except tk.TclError as e:',
      '    out(str(e))',
    ].join('\n'))
    expect(r.lines[0]).toEqual([
      [[15, 10, 35, 30], [14, 9, 36, 31], [1], [1], 'blue', 'oval'],
      [['enemy', ['enemy', 'current']], ['canvas', 60, 60]],
      [1],
      '200',
    ])
    expect(r.lines[1]).toBe('wrong # coordinates: expected at least 4, got 2')
  })

  it('counts menu entries from the tearoff line, as Tk does', () => {
    const r = py([
      'root = tk.Tk()',
      'log = []',
      'm = tk.Menu(root)',
      'm.add_command(label="Open", command=lambda: log.append("open"))',
      'flag = tk.BooleanVar()',
      'm.add_checkbutton(label="Grid", variable=flag)',
      'root.option_add("*tearOff", False)',
      'plain = tk.Menu(root)',
      'plain.add_command(label="Only")',
      'm.invoke(1); m.invoke("Grid")',
      'out(m.index("end"), m.type(0), plain.index("end"), plain.type(0), log, flag.get())',
    ].join('\n'))
    expect(r.lines[0]).toEqual([2, 'tearoff', 0, 'command', ['open'], true])
  })

  it('treats ttk the way programs expect: Treeview values, Notebook tabs, Combobox', () => {
    const r = py([
      'root = tk.Tk()',
      'tree = ttk.Treeview(root, columns=("name", "age"), show="headings")',
      'i = tree.insert("", "end", values=("Bob", 12))',
      'j = tree.insert("", "end", values=("007", "x"))',
      'tree.selection_set(j)',
      'nb = ttk.Notebook(root); p1 = ttk.Frame(nb); p2 = ttk.Frame(nb)',
      'nb.add(p1, text="One"); nb.add(p2, text="Two"); nb.select(p2)',
      'cb = ttk.Combobox(root, values=("red", "green")); cb.current(1)',
      'out(i, tree.item(i)["values"], tree.item(j)["values"], tree.item(i, "values"), tree.selection(),',
      '    tree.get_children(), nb.index("current"), nb.tab(0, "text"), nb.select() == str(p2), cb.get(), cb.current())',
    ].join('\n'))
    expect(r.lines[0]).toEqual(['I001', ['Bob', 12], [7, 'x'], ['Bob', 12], ['I002'], ['I001', 'I002'], 1, 'One', true, 'green', 1])
  })

  it('reports an error in a callback and carries on, as Tk does', () => {
    const r = py([
      'root = tk.Tk()',
      'b = tk.Button(root, command=lambda: 1 / 0)',
      'tk._app.deliver(tk._app.handle, {"t": "cmd", "w": b._id})',
      'out("still going")',
    ].join('\n'))
    expect(r.lines).toEqual(['still going'])
    expect(r.stderr).toContain('Exception in Tkinter callback')
    expect(r.stderr).toContain('ZeroDivisionError')
    // The frames of the shim itself are how the callback was reached, not where
    // the mistake is, so they are left out.
    expect(r.stderr).not.toContain('tkinter')
  })

  it('without JSPI, mainloop() returns at once and the window stays', () => {
    const r = py([
      'root = tk.Tk()',
      'root.after(10, lambda: out("timer"))',
      'root.mainloop()',
      'out("after mainloop", tk._app.mainloop_deferred, bool(tk._app.roots))',
    ].join('\n'))
    expect(r.lines).toEqual([['after mainloop', true, true]])
  })

  it('with JSPI, mainloop() runs timers and events until the window closes', () => {
    const r = py([
      'root = tk.Tk()',
      'b = tk.Button(root, command=lambda: out("clicked"))',
      'root.after(0, lambda: out("timer"))',
      'root.mainloop()',
      'out("after mainloop", len(tk._app.roots))',
    ].join('\n'), {
      jspi: true,
      events: [[], [{ t: 'cmd', w: 2 }], [], [{ t: 'close', w: 1 }]],
    })
    expect(r.stderr).toBe('')
    expect(r.lines).toEqual(['timer', 'clicked', ['after mainloop', 0]])
  })

  it('with JSPI, quit() ends mainloop and SystemExit in a callback ends the program', () => {
    const r = py([
      'root = tk.Tk()',
      'root.after(1, root.quit)',
      'root.mainloop()',
      'out("quit returned")',
      'root.after(1, lambda: exit())',
      'try:',
      '    root.mainloop()',
      'except SystemExit:',
      '    out("exited")',
    ].join('\n'), { jspi: true })
    expect(r.lines).toEqual(['quit returned', 'exited'])
  })

  it('refuses a destroyed widget with Tk\'s message', () => {
    const r = py([
      'root = tk.Tk()',
      'lab = tk.Label(root)',
      'root.destroy()',
      'try:',
      '    lab.configure(text="x")',
      'except tk.TclError as e:',
      '    out(str(e), lab.winfo_exists())',
    ].join('\n'))
    expect(r.lines[0]).toEqual(['invalid command name ".!label"', 0])
  })

  it('reads PNG and GIF sizes, puts pixels, and refuses JPEG like Tk 8.6', () => {
    const r = py([
      'import base64, os, tempfile',
      'root = tk.Tk()',
      'img = tk.PhotoImage(width=3, height=2)',
      'img.put("red", (1, 1))',
      'img.put("{blue green}", to=(0, 0))',
      'png = tk._encode_png(4, 5, bytearray(4 * 5 * 4))',
      'from_png = tk.PhotoImage(data=base64.b64encode(png).decode())',
      'path = os.path.join(tempfile.mkdtemp(), "photo.jpg")',
      'open(path, "wb").write(b"\\xff\\xd8\\xff\\xe0" + b"0" * 20)',
      'try:',
      '    tk.PhotoImage(file=path)',
      'except tk.TclError as e:',
      '    err = str(e).replace(path, "PATH")',
      'out(img.get(1, 1), img.get(0, 0), img.get(1, 0), [from_png.width(), from_png.height()], err, from_png.subsample(2).width())',
    ].join('\n'))
    expect(r.lines[0]).toEqual([[255, 0, 0], [0, 0, 255], [0, 128, 0], [4, 5], 'couldn\'t recognize data in image file "PATH"', 2])
  })

  it('sends Tk colours and fonts to the page as CSS', () => {
    const r = py([
      'out([tk._color(c) for c in ("SystemButtonFace", "light blue", "gray50", "red3", "#ff000000ffff", "")],',
      '    tk._font_css(("Arial", 12, "bold italic")), tk._font_css("{Courier New} 10 underline"), tk._font_css(("Helvetica", -14)))',
    ].join('\n'))
    expect(r.lines[0]).toEqual([
      ['#f0f0f0', 'lightblue', '#808080', 'color-mix(in srgb, red 80%, black)', '#ff00ff', ''],
      ['italic bold 12pt Arial, Helvetica, sans-serif', ''],
      ['10pt "Courier New", Courier, monospace', 'underline'],
      ['14px Helvetica, Arial, sans-serif', ''],
    ])
  })

  it('answers message boxes and prompts headlessly without blocking', () => {
    const r = py([
      'from tkinter import messagebox, simpledialog, filedialog',
      'out(messagebox.showinfo("t", "m"), messagebox.askyesno("t", "m"), simpledialog.askstring("t", "p"), filedialog.askopenfilename())',
    ].join('\n'))
    expect(r.lines[0]).toEqual(['ok', false, null, ''])
  })
})
