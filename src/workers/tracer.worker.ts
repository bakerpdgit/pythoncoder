/// <reference lib="webworker" />


const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/pyodide.js'

const SETUP_CODE = `
import ast
import sys
import json
import builtins
_builtin_names = frozenset(dir(builtins))

def my_input(prompt=""):
    try:
        caller = sys._getframe(1)
        fn, cls, st = snapshot_state(caller)
        js_send_state(caller.f_lineno, fn, cls, st)
    except Exception:
        pass
    return js_input_callback(prompt)
builtins.input = my_input

source_lines = user_code_str.splitlines()

tree = ast.parse(user_code_str, filename="simulation.py")
control_blocks = []
for node in ast.walk(tree):
    if isinstance(node, (ast.If, ast.For, ast.While)) and hasattr(node, "end_lineno"):
        control_blocks.append({
            "start": node.lineno,
            "end": node.end_lineno,
            "kind": type(node).__name__,
        })

frame_depths = {}
pending_action = None
current_breakpoints = []
MAX_ITEMS = 120
MAX_STRING = 120

def is_serializable_local(name, value):
    if name.startswith("__"):
        return False
    if callable(value):
        return False
    if isinstance(value, type(sys)):
        return False
    return True

def format_scalar(value):
    if isinstance(value, str):
        if len(value) > MAX_STRING:
            return value[: MAX_STRING - 1] + "\\u2026"
        return value
    if isinstance(value, float):
        return round(value, 4)
    return value

def summarize_value(value):
    if isinstance(value, str):
        preview = format_scalar(value)
        return repr(preview)
    if value is None or isinstance(value, (bool, int, float)):
        return repr(value)
    if isinstance(value, (list, tuple, set)):
        return f"{type(value).__name__}[{len(value)}]"
    if isinstance(value, dict):
        return f"dict {{{len(value)}}}"
    return getattr(value, "__class__", type(value)).__name__

def serialize_value(value, path_ids=None):
    if path_ids is None:
        path_ids = set()

    if value is None or isinstance(value, (bool, int, float, str)):
        return {
            "kind": "primitive",
            "type": type(value).__name__,
            "value": format_scalar(value),
            "summary": summarize_value(value),
        }

    if isinstance(value, (list, tuple, set)):
        object_id = id(value)
        if object_id in path_ids:
            return {"kind": "reference", "type": type(value).__name__, "summary": f"{type(value).__name__} (circular)"}
        next_ids = set(path_ids)
        next_ids.add(object_id)
        sequence = list(value)
        return {
            "kind": "sequence",
            "type": type(value).__name__,
            "length": len(sequence),
            "summary": f"{type(value).__name__}[{len(sequence)}]",
            "truncated": len(sequence) > MAX_ITEMS,
            "items": [{"label": f"[{i}]", "value": serialize_value(item, next_ids)} for i, item in enumerate(sequence[:MAX_ITEMS])],
        }

    if isinstance(value, dict):
        object_id = id(value)
        if object_id in path_ids:
            return {"kind": "reference", "type": "dict", "summary": "dict (circular)"}
        next_ids = set(path_ids)
        next_ids.add(object_id)
        entries = []
        for key, item in list(value.items())[:MAX_ITEMS]:
            if callable(item) or isinstance(item, type(sys)):
                continue
            entries.append({"label": repr(key), "value": serialize_value(item, next_ids)})
        return {
            "kind": "mapping",
            "type": "dict",
            "length": len(value),
            "summary": f"dict {{{len(value)}}}",
            "truncated": len(value) > MAX_ITEMS,
            "entries": entries,
        }

    if hasattr(value, "__dict__"):
        object_id = id(value)
        if object_id in path_ids:
            return {"kind": "reference", "type": value.__class__.__name__, "summary": f"{value.__class__.__name__} (circular)"}
        next_ids = set(path_ids)
        next_ids.add(object_id)
        attributes = []
        for name, item in value.__dict__.items():
            if name.startswith("__") or callable(item) or isinstance(item, type(sys)):
                continue
            attributes.append({"label": name, "value": serialize_value(item, next_ids)})
        return {
            "kind": "object",
            "type": value.__class__.__name__,
            "summary": f"{value.__class__.__name__} ({len(attributes)} attrs)",
            "attrs": attributes,
        }

    return {"kind": "primitive", "type": type(value).__name__, "value": summarize_value(value), "summary": summarize_value(value)}

def build_scope_snapshot(frame, func_name):
    parameter_names = []
    positional_and_keyword = frame.f_code.co_argcount + frame.f_code.co_kwonlyargcount
    parameter_names.extend(frame.f_code.co_varnames[:positional_and_keyword])
    next_index = positional_and_keyword
    if frame.f_code.co_flags & 0x04:
        parameter_names.append(frame.f_code.co_varnames[next_index])
        next_index += 1
    if frame.f_code.co_flags & 0x08:
        parameter_names.append(frame.f_code.co_varnames[next_index])

    parameter_entries = []
    seen_names = set()
    for name in parameter_names:
        if name not in frame.f_locals:
            continue
        value = frame.f_locals[name]
        if not is_serializable_local(name, value):
            continue
        seen_names.add(name)
        parameter_entries.append({"label": name, "value": serialize_value(value)})

    local_entries = []
    for name, value in frame.f_locals.items():
        if name in seen_names or not is_serializable_local(name, value):
            continue
        if name.startswith("_"):
            continue
        local_entries.append({"label": name, "value": serialize_value(value)})

    locals_view = {
        "label": f"{func_name} locals",
        "node": {
            "kind": "scope",
            "type": func_name,
            "summary": f"{len(parameter_entries)} params \\u2022 {len(local_entries)} locals",
            "entries": parameter_entries + local_entries,
        },
    }

    global_entries = []
    for name, value in frame.f_globals.items():
        if not is_serializable_local(name, value):
            continue
        if name.startswith("_"):
            continue
        if name in _builtin_names:
            continue
        global_entries.append({"label": name, "value": serialize_value(value)})

    globals_view = {
        "label": "Global Variables",
        "node": {
            "kind": "scope",
            "type": "globals",
            "summary": f"{len(global_entries)} globals",
            "entries": global_entries,
        },
    }

    return {"key": f"frame:{id(frame)}:{func_name}", "label": func_name, "views": {"locals": locals_view, "globals": globals_view}}

def ensure_frame_depth(frame):
    frame_id = id(frame)
    if frame_id not in frame_depths:
        parent = frame.f_back
        parent_depth = frame_depths.get(id(parent), -1) if parent is not None else -1
        frame_depths[frame_id] = parent_depth + 1
    return frame_depths[frame_id]

def get_depth(frame):
    return ensure_frame_depth(frame)

def find_innermost_control_block(line_no):
    matches = [block for block in control_blocks if block["start"] <= line_no <= block["end"]]
    if not matches:
        return None
    return min(matches, key=lambda block: (block["end"] - block["start"], -block["start"]))

def should_pause(frame, line_no):
    global pending_action
    if pending_action is None:
        return True

    action_type = pending_action["type"]
    depth = get_depth(frame)
    frame_id = id(frame)

    if action_type == "step_over":
        if depth > pending_action["depth"]:
            return False
        if depth == pending_action["depth"] and frame_id == pending_action["frame_id"] and line_no == pending_action["line"]:
            return False
        pending_action = None
        return True

    if action_type == "out_block":
        if depth > pending_action["depth"]:
            return False
        if depth == pending_action["depth"] and frame_id == pending_action["frame_id"] and pending_action["start"] <= line_no <= pending_action["end"]:
            return False
        pending_action = None
        return True

    if action_type == "out_function":
        if depth > pending_action["depth"]:
            return False
        pending_action = None
        return True

    if action_type == "continue":
        if line_no in current_breakpoints:
            pending_action = None
            return True
        return False

    pending_action = None
    return True

def snapshot_state(frame):
    func_name = frame.f_code.co_name
    class_name = ""
    if "self" in frame.f_locals:
        class_name = frame.f_locals["self"].__class__.__name__
    try:
        return func_name, class_name, json.dumps({"Inspector": build_scope_snapshot(frame, func_name)})
    except Exception:
        pass
    try:
        return func_name, class_name, json.dumps({"Inspector": build_scope_snapshot(frame, func_name)})
    except Exception:
        return func_name, class_name, "{}"

def trace_calls(frame, event, arg):
    global pending_action

    if frame.f_code.co_filename != "simulation.py":
        return trace_calls

    if event == "call":
        ensure_frame_depth(frame)
        return trace_calls

    if event == "return":
        frame_depths.pop(id(frame), None)
        return trace_calls

    if event != "line":
        return trace_calls

    ensure_frame_depth(frame)
    line_no = frame.f_lineno

    if line_no <= len(source_lines):
        stripped = source_lines[line_no - 1].strip()
        if stripped.startswith('def ') or stripped.startswith('class ') or stripped.startswith('@'):
            return trace_calls

    if not should_pause(frame, line_no):
        return trace_calls

    func_name, class_name, sim_state = snapshot_state(frame)
    current_depth = get_depth(frame)

    cmd = js_trace_callback(line_no, func_name, class_name, sim_state)
    if cmd == 2:
        pending_action = {"type": "step_over", "depth": current_depth, "frame_id": id(frame), "line": line_no}
    elif cmd == 3:
        current_block = find_innermost_control_block(line_no)
        if current_block is not None:
            pending_action = {"type": "out_block", "depth": current_depth, "frame_id": id(frame), "start": current_block["start"], "end": current_block["end"]}
        elif func_name != "<module>":
            pending_action = {"type": "out_function", "depth": max(current_depth - 1, 0)}
        else:
            pending_action = {"type": "step_over", "depth": current_depth, "frame_id": id(frame), "line": line_no}
    elif cmd == 4:
        pending_action = {"type": "continue"}
    else:
        pending_action = None

    return trace_calls

sys.settrace(trace_calls)
`

self.onmessage = async function (e: MessageEvent) {
  if (e.data.type !== 'init') return

  const sab: SharedArrayBuffer = e.data.sab
  const int32View = new Int32Array(sab)
  const uint8View = new Uint8Array(sab)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(self as any).importScripts(PYODIDE_URL)
  } catch {
    // Module worker context (Vite dev mode): importScripts unavailable, fall back to dynamic import
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await (import(/* @vite-ignore */ PYODIDE_URL) as Promise<any>)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(self as any).loadPyodide && mod?.loadPyodide) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(self as any).loadPyodide = mod.loadPyodide
      }
    } catch (dynErr) {
      self.postMessage({
        type: 'error',
        error: 'Failed to load Pyodide in the worker. ' + (dynErr instanceof Error ? dynErr.message : String(dynErr)),
      })
      return
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pyodide = await (self as any).loadPyodide({
    stdout: (text: string) => self.postMessage({ type: 'print', text }),
    stderr: (text: string) => self.postMessage({ type: 'error', error: text }),
  })

  const useSvgTurtle = Boolean(e.data.svgTurtleBootstrap)

  pyodide.globals.set('js_trace_callback', (line: number, func: string, cls: string, stateStr: string) => {
    let turtleSvg = ''
    if (useSvgTurtle) {
      try { turtleSvg = String(pyodide.globals.get('__turtle_svg__') ?? '') } catch { /* ignore */ }
    }
    self.postMessage({ type: 'trace', line, func, cls, state: stateStr, turtleSvg })
    Atomics.store(int32View, 0, 1)
    Atomics.wait(int32View, 0, 1)
    const cmd = Atomics.load(int32View, 1)
    const bpCount = Atomics.load(int32View, 500)
    const bps: number[] = []
    for (let i = 0; i < bpCount && i < 99; i++) bps.push(Atomics.load(int32View, 501 + i))
    pyodide.globals.set('current_breakpoints', pyodide.toPy(bps))
    return cmd
  })

  pyodide.globals.set('js_input_callback', (promptText: string) => {
    self.postMessage({ type: 'input', prompt: promptText })
    Atomics.store(int32View, 0, 2)
    Atomics.wait(int32View, 0, 2)
    const len = Math.max(0, Atomics.load(int32View, 2))
    const decoder = new TextDecoder()
    const copiedBytes = new Uint8Array(len)
    copiedBytes.set(uint8View.subarray(12, 12 + len))
    return decoder.decode(copiedBytes)
  })

  pyodide.globals.set('js_send_state', (line: number, func: string, cls: string, stateStr: string) => {
    self.postMessage({ type: 'trace', line, func, cls, state: stateStr })
  })

  // Mount virtual filesystem files
  const vfsFiles: Array<{ path: string; content: ArrayBuffer; mimeType: string }> = e.data.files ?? []
  const vfsCwd: string = e.data.cwd ?? '/'
  const mountedPaths: string[] = []
  for (const file of vfsFiles) {
    try {
      const dir = file.path.substring(0, file.path.lastIndexOf('/')) || '/'
      if (dir !== '/') { try { pyodide.FS.mkdirTree(dir) } catch { /* exists */ } }
      pyodide.FS.writeFile(file.path, new Uint8Array(file.content))
      mountedPaths.push(file.path)
    } catch { /* skip */ }
  }
  try { pyodide.FS.chdir(vfsCwd) } catch { /* ignore */ }

  function collectUpdatedFiles(): Array<{ path: string; content: ArrayBuffer; mimeType: string }> {
    const results: Array<{ path: string; content: ArrayBuffer; mimeType: string }> = []
    const visited = new Set<string>()
    const dirsToScan = new Set<string>([vfsCwd])
    for (const p of mountedPaths) {
      const d = p.substring(0, p.lastIndexOf('/')) || '/'
      dirsToScan.add(d)
    }
    function walk(dir: string) {
      let entries: string[]
      try { entries = pyodide.FS.readdir(dir) as string[] } catch { return }
      for (const name of entries) {
        if (name === '.' || name === '..') continue
        const full = dir === '/' ? `/${name}` : `${dir}/${name}`
        if (visited.has(full)) continue; visited.add(full)
        try {
          const stat = pyodide.FS.stat(full)
          if (pyodide.FS.isDir(stat.mode)) { walk(full) }
          else if (pyodide.FS.isFile(stat.mode)) {
            const bytes = pyodide.FS.readFile(full) as Uint8Array
            results.push({ path: full, content: bytes.buffer.slice(0) as ArrayBuffer, mimeType: 'text/plain' })
          }
        } catch { /* skip */ }
      }
    }
    for (const d of dirsToScan) walk(d)
    return results
  }

  try {
    const userCode: string = e.data.code
    await pyodide.loadPackagesFromImports(userCode)
    if (useSvgTurtle) {
      await pyodide.runPythonAsync(e.data.svgTurtleBootstrap as string)
    }
    pyodide.globals.set('user_code_str', userCode)
    await pyodide.runPythonAsync(SETUP_CODE)
    await pyodide.runPythonAsync(`
code_obj = compile(user_code_str, "simulation.py", "exec")
exec(code_obj, globals())
    `)
    const updatedFiles = collectUpdatedFiles()
    let finalTurtleSvg = ''
    if (useSvgTurtle) {
      try { finalTurtleSvg = String(pyodide.globals.get('__turtle_svg__') ?? '') } catch { /* ignore */ }
    }
    if (finalTurtleSvg) self.postMessage({ type: 'turtle_update', svg: finalTurtleSvg })
    self.postMessage({ type: 'done', files: updatedFiles })
  } catch (err) {
    const updatedFiles = collectUpdatedFiles()
    let finalTurtleSvg = ''
    if (useSvgTurtle) {
      try { finalTurtleSvg = String(pyodide.globals.get('__turtle_svg__') ?? '') } catch { /* ignore */ }
    }
    if (finalTurtleSvg) self.postMessage({ type: 'turtle_update', svg: finalTurtleSvg })
    self.postMessage({ type: 'error', error: String(err), files: updatedFiles })
  }
}
