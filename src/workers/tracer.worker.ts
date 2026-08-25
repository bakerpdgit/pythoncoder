/// <reference lib="webworker" />

import { TRACE_TABLE_EVENT_LIMIT } from '../types/traceTable'
import { pyodideSkipDirs } from '../utils/pyodideFs'

const PYODIDE_BASE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full'
const PYODIDE_URL = `${PYODIDE_BASE_URL}/pyodide.js`

// Loading and compiling Pyodide is by far the most expensive part of starting a
// trace. Keep it behind a shared promise so the main thread can ask this worker
// to warm the runtime before the user presses Debug, Trace, or Run.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pyodidePromise: Promise<any> | null = null
let traceStdoutCapture: ((text: string) => void) | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ensurePyodide = (): Promise<any> => {
  if (pyodidePromise) return pyodidePromise

  pyodidePromise = (async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (self as any).loadPyodide !== 'function') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(self as any).importScripts(PYODIDE_URL)
      } catch {
        // Module worker context (Vite dev mode): importScripts unavailable, fall
        // back to a dynamic import of the same pinned Pyodide distribution.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = await (import(/* @vite-ignore */ PYODIDE_URL) as Promise<any>)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(self as any).loadPyodide && mod?.loadPyodide) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(self as any).loadPyodide = mod.loadPyodide
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (self as any).loadPyodide !== 'function') {
      throw new Error('The Pyodide loader did not initialise in the worker.')
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (self as any).loadPyodide({
      indexURL: `${PYODIDE_BASE_URL}/`,
      stdout: (text: string) => {
        self.postMessage({ type: 'print', text })
        traceStdoutCapture?.(text)
      },
      // Warnings (and any deliberate sys.stderr writes) land here. They are
      // console output, not a failed run — only the explicit 'error' messages
      // posted from the catch blocks below terminate the worker.
      stderr: (text: string) => self.postMessage({ type: 'stderr', text }),
    })
  })()

  return pyodidePromise
}

const SETUP_CODE = `
import ast
import sys
import json
import builtins
import types
import itertools
import math
_builtin_names = frozenset(dir(builtins))
if trace_table_enabled:
    import dis

# User code executes in an isolated namespace. Recorder/debugger functions keep
# their own globals, so assignments such as json=1, sys=1, or
# trace_table_flush=1 cannot corrupt tracing internals.
user_namespace = {"__name__": "__main__", "__builtins__": builtins.__dict__}
trace_runtime_global_names = frozenset(user_namespace.keys())

watch_expressions = []

def evaluate_watches(frame):
    if not watch_expressions:
        return "{}"
    old_trace = sys.gettrace()
    sys.settrace(None)
    try:
        frame.f_trace = None
    except Exception:
        pass
    results = {}
    try:
        for expr in watch_expressions:
            try:
                val = eval(expr, frame.f_globals, frame.f_locals)
                results[expr] = serialize_value(val)
            except Exception as e:
                results[expr] = {"kind": "primitive", "type": "error", "value": repr(e), "summary": f"<{type(e).__name__}>"}
    finally:
        sys.settrace(old_trace)
        try:
            frame.f_trace = old_trace
        except Exception:
            pass
    return json.dumps(results)

def my_input(prompt=""):
    caller = None
    try:
        caller = sys._getframe(1)
        fn, cls, st = snapshot_state(caller)
        wv = evaluate_watches(caller)
        trace_table_flush()
        js_send_state(caller.f_lineno, fn, cls, st, wv)
    except Exception:
        pass
    result = js_input_callback(prompt)
    if trace_table_enabled:
        # A stop wake-up is not an input submission. Do not consume or record a
        # stale buffer value; acknowledge through the normal flushed stop path.
        trace_table_check_stop()
    if trace_table_enabled and caller is not None and caller.f_code.co_filename == "simulation.py":
        trace_table_record("input-completed", caller, inputValue=result, variables=trace_table_capture_active(caller))
        trace_table_flush()
    return result
builtins.input = my_input

source_lines = user_code_str.splitlines()

tree = ast.parse(user_code_str, filename="simulation.py")
control_blocks = []
statement_descriptors = {}
loop_descriptors = {}
call_site_expressions = {}

def root_target_names(target):
    """Return root names affected by an assignment/delete target.

    Attribute and subscript writes intentionally resolve to their root object for
    this first wire format. A later UI can expose captured member paths without
    changing the execution log's write semantics.
    """
    if isinstance(target, ast.Name):
        return {target.id}
    if isinstance(target, (ast.Tuple, ast.List)):
        names = set()
        for item in target.elts:
            names.update(root_target_names(item))
        return names
    if isinstance(target, (ast.Attribute, ast.Subscript)):
        value = target.value
        while isinstance(value, (ast.Attribute, ast.Subscript)):
            value = value.value
        return {value.id} if isinstance(value, ast.Name) else set()
    if isinstance(target, ast.Starred):
        return root_target_names(target.value)
    return set()

def add_statement_descriptor(node, writes=None, deletes=None, mutations=None, kind=None):
    if not hasattr(node, "lineno"):
        return
    line = node.lineno
    descriptor = statement_descriptors.setdefault(line, {
        "line": line,
        "writes": set(),
        "deletes": set(),
        "mutations": set(),
        "kinds": set(),
    })
    descriptor["writes"].update(writes or ())
    descriptor["deletes"].update(deletes or ())
    descriptor["mutations"].update(mutations or ())
    if kind:
        descriptor["kinds"].add(kind)

for node in ast.walk(tree):
    if isinstance(node, (ast.If, ast.For, ast.While)) and hasattr(node, "end_lineno"):
        control_blocks.append({
            "start": node.lineno,
            "end": node.end_lineno,
            "kind": type(node).__name__,
        })

class StatementMutationVisitor(ast.NodeVisitor):
    def __init__(self):
        self.roots = set()

    def visit_Call(self, node):
        if isinstance(node.func, ast.Attribute):
            self.roots.update(root_target_names(node.func.value))
        # A called function may mutate a mutable argument even when its own name
        # gives no hint. Capture argument roots and retain only those whose
        # serialized value actually differs after the statement.
        argument_nodes = list(node.args) + [keyword.value for keyword in node.keywords]
        for argument in argument_nodes:
            for child in ast.walk(argument):
                if isinstance(child, ast.Name) and isinstance(child.ctx, ast.Load):
                    self.roots.add(child.id)
        self.generic_visit(node)

def statement_mutation_roots(node):
    visitor = StatementMutationVisitor()
    # Do not descend into nested statements: each gets its own source-line
    # descriptor. Expression children still include arbitrarily nested calls.
    for child in ast.iter_child_nodes(node):
        if isinstance(child, ast.stmt) or isinstance(child, ast.ExceptHandler):
            continue
        visitor.visit(child)
    return visitor.roots

if trace_table_enabled:
    # Recorder-only AST analysis is skipped entirely for Debug and Run.
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            call_site_expressions[(
                node.lineno,
                getattr(node, "end_lineno", node.lineno),
                node.col_offset,
                getattr(node, "end_col_offset", node.col_offset),
            )] = node.func
        elif isinstance(node, ast.Call) and isinstance(node.func, (ast.Subscript, ast.Attribute)):
            call_site_expressions[(
                node.lineno,
                getattr(node, "end_lineno", node.lineno),
                node.col_offset,
                getattr(node, "end_col_offset", node.col_offset),
            )] = node.func
        if isinstance(node, ast.Assign):
            names = set()
            for target in node.targets:
                names.update(root_target_names(target))
            add_statement_descriptor(node, writes=names, kind="assignment")
        elif isinstance(node, ast.AnnAssign):
            add_statement_descriptor(node, writes=root_target_names(node.target), kind="assignment")
        elif isinstance(node, ast.AugAssign):
            names = root_target_names(node.target)
            add_statement_descriptor(node, writes=names, mutations=names, kind="augmented-assignment")
        elif isinstance(node, ast.NamedExpr):
            add_statement_descriptor(node, writes=root_target_names(node.target), kind="named-expression")
        elif isinstance(node, ast.Import):
            names = {alias.asname or alias.name.split(".")[0] for alias in node.names}
            add_statement_descriptor(node, writes=names, kind="import")
        elif isinstance(node, ast.ImportFrom):
            names = {alias.asname or alias.name for alias in node.names if alias.name != "*"}
            add_statement_descriptor(node, writes=names, kind="import")
        elif isinstance(node, (ast.For, ast.AsyncFor)):
            names = root_target_names(node.target)
            add_statement_descriptor(node, writes=names, kind="loop-target")
        elif isinstance(node, (ast.With, ast.AsyncWith)):
            names = set()
            for item in node.items:
                if item.optional_vars is not None:
                    names.update(root_target_names(item.optional_vars))
            add_statement_descriptor(node, writes=names, kind="with-binding")
        elif isinstance(node, ast.ExceptHandler) and node.name:
            add_statement_descriptor(node, writes={node.name}, kind="exception-binding")
        elif isinstance(node, ast.Delete):
            names = set()
            mutation_names = set()
            for target in node.targets:
                target_names = root_target_names(target)
                if isinstance(target, (ast.Attribute, ast.Subscript)):
                    mutation_names.update(target_names)
                else:
                    names.update(target_names)
            add_statement_descriptor(node, deletes=names, mutations=mutation_names, kind="delete")

        if isinstance(node, ast.stmt):
            mutation_names = statement_mutation_roots(node)
            if mutation_names:
                add_statement_descriptor(node, mutations=mutation_names, kind="method-call")

    for node in ast.walk(tree):
        if isinstance(node, (ast.For, ast.AsyncFor, ast.While)) and node.body:
            body_start = min(getattr(item, "lineno", node.lineno) for item in node.body)
            body_end = max(getattr(item, "end_lineno", getattr(item, "lineno", node.lineno)) for item in node.body)
            target_names = sorted(root_target_names(node.target)) if isinstance(node, (ast.For, ast.AsyncFor)) else []
            loop_descriptors[node.lineno] = {
                "id": f"{type(node).__name__.lower()}:{node.lineno}:{getattr(node, 'end_lineno', node.lineno)}",
                "kind": type(node).__name__.lower(),
                "header": node.lineno,
                "body_start": body_start,
                "body_end": body_end,
                "target_names": target_names,
            }

    for descriptor in statement_descriptors.values():
        descriptor["writes"] = sorted(descriptor["writes"])
        descriptor["deletes"] = sorted(descriptor["deletes"])
        descriptor["mutations"] = sorted(descriptor["mutations"])
        descriptor["kinds"] = sorted(descriptor["kinds"])

frame_depths = {}
# Maps enabled breakpoint line numbers -> condition string ("" = unconditional).
current_breakpoints = dict(initial_breakpoints)
# Trace pauses on the first executable line. Debug and Run begin in continue
# mode, avoiding an otherwise unnecessary state snapshot and JS round-trip.
pending_action = None if pause_on_first_line else {"type": "continue"}
# Set by should_pause when the current pause is a genuine (condition-satisfied)
# breakpoint hit, so the JS side can distinguish it from step/initial pauses.
breakpoint_hit = False
MAX_ITEMS = 120
MAX_STRING = 120
MAX_SERIALIZATION_DEPTH = 6
MAX_SERIALIZATION_NODES = 500

# Trace-table recording is deliberately independent of debugger pausing. The
# debugger may Continue over thousands of lines, but these non-blocking batches
# still preserve the execution history needed by later table projections.
TRACE_TABLE_PROTOCOL_VERSION = 1
TRACE_TABLE_BATCH_SIZE = 48
TRACE_TABLE_EVENT_LIMIT = trace_table_event_limit
# Event sequences are zero-based and contiguous for the complete retained run.
trace_table_sequence = -1
trace_table_batch = []
trace_table_catalogue_batch = []
trace_table_catalogue_ids = set()
trace_table_next_call_id = 1
trace_table_frames = {}
trace_table_pending = {}
trace_table_loop_iterations = {}
trace_table_last_values = {}
trace_table_opcode_maps = {}
trace_table_closure_sources = {}

class _TraceTableStopRequested(BaseException):
    pass

class _TraceTableLimitReached(BaseException):
    pass

def is_serializable_local(name, value):
    if name.startswith("__"):
        return False
    if callable(value):
        return False
    if type(value) is types.ModuleType:
        return False
    return True

def format_scalar(value):
    value_type = type(value)
    if value_type is str:
        if len(value) > MAX_STRING:
            return value[: MAX_STRING - 1] + "\\u2026"
        return value
    if value_type is float:
        if math.isnan(value):
            return "NaN"
        if math.isinf(value):
            return "Infinity" if value > 0 else "-Infinity"
        return round(value, 4)
    return value

def summarize_value(value):
    value_type = type(value)
    if value_type is str:
        preview = format_scalar(value)
        return repr(preview)
    if value is None or value_type in (bool, int):
        return repr(value)
    if value_type is float:
        return str(format_scalar(value))
    if value_type in (list, tuple, set):
        return f"{value_type.__name__}[{len(value)}]"
    if value_type is dict:
        return f"dict {{{len(value)}}}"
    return safe_type_name(value)

def safe_type_name(value):
    try:
        # Bypass a custom metaclass __getattribute__ implementation.
        return type.__getattribute__(type(value), "__name__")
    except BaseException:
        return "unavailable"

def safe_instance_dict(value):
    """Return a plain instance dictionary without invoking user access hooks."""
    try:
        value_type = type(value)
        mro = type.__getattribute__(value_type, "__mro__")
        getattribute_impl = None
        dict_descriptor = None
        for owner in mro:
            namespace = type.__getattribute__(owner, "__dict__")
            if getattribute_impl is None and "__getattribute__" in namespace:
                getattribute_impl = namespace["__getattribute__"]
            if dict_descriptor is None and "__dict__" in namespace:
                dict_descriptor = namespace["__dict__"]
        if getattribute_impl is not object.__getattribute__:
            return None
        if type(dict_descriptor) is not types.GetSetDescriptorType:
            return None
        namespace = object.__getattribute__(value, "__dict__")
        return namespace if type(namespace) is dict else None
    except BaseException:
        return None

def _serialization_limit_node(value, reason):
    type_name = safe_type_name(value)
    return {"kind": "reference", "type": type_name, "summary": f"{type_name} ({reason})"}

def _serialize_value(value, path_ids=None, depth=0, budget=None):
    if path_ids is None:
        path_ids = set()
    if budget is None:
        budget = {"remaining": MAX_SERIALIZATION_NODES}
    if budget["remaining"] <= 0:
        return _serialization_limit_node(value, "node limit")
    budget["remaining"] -= 1
    value_type = type(value)
    if depth >= MAX_SERIALIZATION_DEPTH and not (value is None or value_type in (bool, int, float, str)):
        return _serialization_limit_node(value, "depth limit")

    if value is None or value_type in (bool, int, float, str):
        return {
            "kind": "primitive",
            "type": safe_type_name(value),
            "value": format_scalar(value),
            "summary": summarize_value(value),
        }

    if value_type in (list, tuple, set):
        object_id = id(value)
        if object_id in path_ids:
            return {"kind": "reference", "type": value_type.__name__, "summary": f"{value_type.__name__} (circular)"}
        next_ids = set(path_ids)
        next_ids.add(object_id)
        length = len(value)
        if value_type in (list, tuple):
            sequence = value[:MAX_ITEMS]
        else:
            # islice prevents copying an arbitrarily large set before applying
            # the display bound.
            sequence = list(itertools.islice(iter(value), MAX_ITEMS))
        return {
            "kind": "sequence",
            "type": value_type.__name__,
            "length": length,
            "summary": f"{value_type.__name__}[{length}]",
            "truncated": length > MAX_ITEMS,
            "items": [{"label": f"[{i}]", "value": serialize_value(item, next_ids, depth + 1, budget)} for i, item in enumerate(sequence)],
        }

    if value_type is dict:
        object_id = id(value)
        if object_id in path_ids:
            return {"kind": "reference", "type": "dict", "summary": "dict (circular)"}
        next_ids = set(path_ids)
        next_ids.add(object_id)
        entries = []
        for key, item in itertools.islice(value.items(), MAX_ITEMS):
            if callable(item) or type(item) is types.ModuleType:
                continue
            key_type = type(key)
            label = repr(key) if key is None or key_type in (bool, int, float, str) else f"<{safe_type_name(key)} key>"
            entries.append({"label": label, "value": serialize_value(item, next_ids, depth + 1, budget)})
        return {
            "kind": "mapping",
            "type": "dict",
            "length": len(value),
            "summary": f"dict {{{len(value)}}}",
            "truncated": len(value) > MAX_ITEMS,
            "entries": entries,
        }

    namespace = safe_instance_dict(value)
    if namespace is not None:
        object_id = id(value)
        if object_id in path_ids:
            type_name = safe_type_name(value)
            return {"kind": "reference", "type": type_name, "summary": f"{type_name} (circular)"}
        next_ids = set(path_ids)
        next_ids.add(object_id)
        attributes = []
        for name, item in itertools.islice(namespace.items(), MAX_ITEMS):
            if type(name) is not str or name.startswith("__") or callable(item) or type(item) is types.ModuleType:
                continue
            attributes.append({"label": name, "value": serialize_value(item, next_ids, depth + 1, budget)})
        type_name = safe_type_name(value)
        return {
            "kind": "object",
            "type": type_name,
            "summary": f"{type_name} ({len(attributes)} attrs)",
            "attrs": attributes,
        }

    type_name = safe_type_name(value)
    return {"kind": "reference", "type": type_name, "summary": type_name}

def serialize_value(value, path_ids=None, depth=0, budget=None):
    try:
        return _serialize_value(value, path_ids, depth, budget)
    except BaseException:
        # User-defined __repr__, __getattribute__, collection iteration, and
        # similar introspection hooks must never be able to abort tracing.
        try:
            type_name = safe_type_name(value)
        except BaseException:
            type_name = "unavailable"
        summary = f"<{type_name}: unavailable>"
        return {"kind": "primitive", "type": type_name, "value": summary, "summary": summary}

def trace_table_qualified_name(frame):
    return getattr(frame.f_code, "co_qualname", frame.f_code.co_name)

def trace_table_lexical_parent_name(code):
    qualified = getattr(code, "co_qualname", code.co_name)
    marker = ".<locals>."
    return qualified.rsplit(marker, 1)[0] if marker in qualified else None

def trace_table_frame_meta(frame):
    return trace_table_frames.get(id(frame))

def trace_table_defining_frame(frame, name):
    if name not in frame.f_code.co_freevars:
        return frame
    lexical_parent = trace_table_lexical_parent_name(frame.f_code)
    if lexical_parent is None:
        return frame
    current = frame.f_back
    while current is not None:
        if (
            current.f_code.co_filename == "simulation.py" and
            trace_table_qualified_name(current) == lexical_parent and
            name in current.f_locals
        ):
            return current
        current = current.f_back
    return frame

def trace_table_register_closure_value(frame, value, seen, depth=0):
    if depth > 3:
        return
    value_id = id(value)
    if value_id in seen:
        return
    seen.add(value_id)

    if type(value) is types.FunctionType:
        code = value.__code__
        closure = value.__closure__
        if closure:
            # A foreign callback may close over x while the dynamic caller
            # also has an unrelated x. Only its actual lexical parent may
            # associate those closure cells with source bindings.
            lexical_parent = trace_table_lexical_parent_name(code)
            if lexical_parent is None or trace_table_qualified_name(frame) != lexical_parent:
                return
            for free_name, cell in zip(code.co_freevars, closure):
                if free_name not in frame.f_locals:
                    continue
                source = trace_table_source(frame, free_name)
                key = (code, free_name)
                entries = trace_table_closure_sources.setdefault(key, [])
                cell_id = id(cell)
                if not any(entry["cellId"] == cell_id for entry in entries):
                    entries.append({"cellId": cell_id, "cell": cell, "source": source})
        return

    # Directly returned closures are often wrapped in a small tuple/list/dict.
    # Restrict traversal to exact built-in containers so discovery cannot invoke
    # user iteration, hashing, descriptors, or other application code.
    if type(value) in (list, tuple):
        for item in value[:100]:
            trace_table_register_closure_value(frame, item, seen, depth + 1)
    elif type(value) is dict:
        for item in list(value.values())[:100]:
            trace_table_register_closure_value(frame, item, seen, depth + 1)

def trace_table_register_closures(frame, returned=None):
    seen = set()
    for value in frame.f_locals.values():
        trace_table_register_closure_value(frame, value, seen)
    if returned is not None:
        trace_table_register_closure_value(frame, returned, seen)

def trace_table_safe_resolve(expression, frame, for_index=False):
    if isinstance(expression, ast.Name):
        value = frame.f_locals.get(expression.id, frame.f_globals.get(expression.id))
        if for_index and type(value) not in (str, int, bool, type(None)):
            return None
        return value
    if isinstance(expression, ast.Constant):
        return expression.value if type(expression.value) in (str, int, bool, type(None)) else None
    if isinstance(expression, ast.UnaryOp) and isinstance(expression.op, (ast.USub, ast.UAdd)) and isinstance(expression.operand, ast.Constant):
        value = expression.operand.value
        if type(value) in (int, float):
            return -value if isinstance(expression.op, ast.USub) else value
        return None
    if isinstance(expression, ast.Slice):
        lower = trace_table_safe_resolve(expression.lower, frame, True) if expression.lower is not None else None
        upper = trace_table_safe_resolve(expression.upper, frame, True) if expression.upper is not None else None
        step = trace_table_safe_resolve(expression.step, frame, True) if expression.step is not None else None
        return slice(lower, upper, step)
    if isinstance(expression, ast.Subscript):
        container = trace_table_safe_resolve(expression.value, frame)
        index = trace_table_safe_resolve(expression.slice, frame, True)
        try:
            if type(container) in (list, tuple, dict):
                return container[index]
        except BaseException:
            return None
        return None
    if isinstance(expression, ast.Attribute):
        owner = trace_table_safe_resolve(expression.value, frame)
        try:
            # Modules expose a plain dictionary; arbitrary object attribute
            # access could execute a descriptor or user __getattribute__ hook.
            namespace = vars(owner) if type(owner) is types.ModuleType else None
            return namespace.get(expression.attr) if type(namespace) is dict else None
        except BaseException:
            return None
    return None

def trace_table_called_function(frame):
    caller = frame.f_back
    if caller is None or caller.f_code.co_filename != "simulation.py":
        return None
    instruction = trace_table_instruction(caller)
    positions = getattr(instruction, "positions", None) if instruction is not None else None
    if positions is None or positions.lineno is None:
        return None
    key = (positions.lineno, positions.end_lineno, positions.col_offset, positions.end_col_offset)
    expression = call_site_expressions.get(key)
    if expression is None:
        return None
    candidate = trace_table_safe_resolve(expression, caller)
    try:
        candidate_code = getattr(candidate, "__code__", None)
    except BaseException:
        return None
    if candidate_code is frame.f_code:
        return candidate
    try:
        bound_function = getattr(candidate, "__func__", None)
        if getattr(bound_function, "__code__", None) is frame.f_code:
            return bound_function
    except BaseException:
        pass
    return None

def trace_table_call_closure_sources(frame):
    function = trace_table_called_function(frame)
    try:
        closure = getattr(function, "__closure__", None)
    except BaseException:
        closure = None
    if function is None or not closure:
        return {}
    sources = {}
    for free_name, cell in zip(frame.f_code.co_freevars, closure):
        entries = trace_table_closure_sources.get((frame.f_code, free_name), [])
        cell_id = id(cell)
        match = next((entry for entry in entries if entry["cellId"] == cell_id), None)
        if match is not None:
            sources[free_name] = dict(match["source"])
    return sources

def trace_table_stack(frame):
    frames = []
    current = frame
    while current is not None:
        if current.f_code.co_filename == "simulation.py":
            meta = trace_table_frame_meta(current)
            if meta is not None:
                frames.append({
                    "callId": meta["callId"],
                    "function": meta["function"],
                    "qualifiedFunction": meta["qualifiedFunction"],
                    "depth": meta["depth"],
                })
        current = current.f_back
    frames.reverse()
    return frames

def trace_table_source(frame, name):
    frame_meta = trace_table_frame_meta(frame)
    if frame_meta is not None and name in frame_meta.get("closureSources", {}):
        return dict(frame_meta["closureSources"][name])
    owner_frame = trace_table_defining_frame(frame, name)
    meta = trace_table_frame_meta(owner_frame)
    is_module = owner_frame.f_code.co_name == "<module>"
    is_local = not is_module and (name in frame.f_locals or name in frame.f_code.co_varnames or name in frame.f_code.co_freevars)
    if is_local:
        qualified = meta["qualifiedFunction"] if meta else trace_table_qualified_name(owner_frame)
        source_id = f"local:{qualified}:{name}"
        return {
            "sourceId": source_id,
            "activationSourceId": f"{source_id}@{meta['callId'] if meta else 0}",
            "name": name,
            "scope": "local",
            "function": qualified,
            "callId": meta["callId"] if meta else 0,
            "defaultLabel": f"{qualified}.{name}",
        }
    return {
        "sourceId": f"global:{name}",
        "activationSourceId": f"global:{name}",
        "name": name,
        "scope": "global",
        "function": "<module>",
        "callId": None,
        "defaultLabel": name,
    }

def trace_table_add_catalogue(source, sequence):
    source_id = source["sourceId"]
    if source_id in trace_table_catalogue_ids:
        return
    trace_table_catalogue_ids.add(source_id)
    entry = dict(source)
    entry["firstSeenSequence"] = sequence
    trace_table_catalogue_batch.append(entry)

def trace_table_visible_name(frame, name, value):
    if not is_serializable_local(name, value):
        return False
    # CPython comprehension frames use synthetic locals such as ".0". They are
    # implementation details rather than names the student can select in code.
    if name.startswith("__") or name.startswith("."):
        return False
    if frame.f_code.co_name == "<module>":
        # Built-ins are resolved through f_builtins and do not appear here unless
        # the student explicitly shadows them, in which case they are user data.
        if name in trace_runtime_global_names:
            return False
    return True

def trace_table_capture_frame(frame):
    captured = {}
    for name, value in frame.f_locals.items():
        if not trace_table_visible_name(frame, name, value):
            continue
        source = trace_table_source(frame, name)
        captured[name] = {"source": source, "value": serialize_value(value)}
    return captured

def trace_table_capture_named(frame, name):
    lexically_local = frame.f_code.co_name != "<module>" and (
        name in frame.f_code.co_varnames or
        name in frame.f_code.co_cellvars or
        name in frame.f_code.co_freevars
    )
    if name in frame.f_locals:
        value = frame.f_locals[name]
        if trace_table_visible_name(frame, name, value):
            source = trace_table_source(frame, name)
            return {"source": source, "value": serialize_value(value)}
    if lexically_local:
        # An unbound/deleted local must not fall through to a same-named global.
        return None
    if name in frame.f_globals:
        value = frame.f_globals[name]
        if is_serializable_local(name, value) and not name.startswith("__") and name not in trace_runtime_global_names:
            source = {
                "sourceId": f"global:{name}",
                "activationSourceId": f"global:{name}",
                "name": name,
                "scope": "global",
                "function": "<module>",
                "callId": None,
                "defaultLabel": name,
            }
            return {"source": source, "value": serialize_value(value)}
    return None

def trace_table_capture_active(frame):
    variables = []
    seen_activation_ids = set()
    current = frame
    while current is not None:
        if current.f_code.co_filename == "simulation.py":
            for item in trace_table_capture_frame(current).values():
                activation_id = item["source"]["activationSourceId"]
                if activation_id not in seen_activation_ids:
                    seen_activation_ids.add(activation_id)
                    variables.append({**item["source"], "value": item["value"]})
        current = current.f_back
    return variables

def trace_table_flush():
    global trace_table_batch, trace_table_catalogue_batch
    if not trace_table_batch and not trace_table_catalogue_batch:
        return
    payload = {
        "protocolVersion": TRACE_TABLE_PROTOCOL_VERSION,
        "events": trace_table_batch,
        "catalogue": trace_table_catalogue_batch,
    }
    # JSON transport failures are terminal recording errors. Retain the batch
    # until the JS bridge has parsed and posted it so a failure can never look
    # like a complete trace with silently missing history.
    js_trace_table_batch(json.dumps(payload, allow_nan=False))
    trace_table_batch = []
    trace_table_catalogue_batch = []

def trace_table_take_output():
    try:
        return json.loads(str(js_trace_table_take_output()))
    except Exception:
        return []

def trace_table_record(event_type, frame, **details):
    global trace_table_sequence
    trace_table_sequence += 1
    full_variables = details.pop("variables", [])
    active_bindings = []
    variable_deltas = []
    active_ids = set()
    for value in full_variables:
        activation_id = value["activationSourceId"]
        if activation_id in active_ids:
            continue
        active_ids.add(activation_id)
        active_bindings.append(activation_id)
        previous = trace_table_last_values.get(activation_id)
        if previous is None or not trace_table_values_equal(previous, value["value"]):
            variable_deltas.append(value)
            trace_table_last_values[activation_id] = value["value"]
    for activation_id in list(trace_table_last_values):
        if activation_id not in active_ids:
            del trace_table_last_values[activation_id]

    details["variables"] = variable_deltas
    details["activeBindings"] = active_bindings
    meta = trace_table_frame_meta(frame)
    event = {
        "sequence": trace_table_sequence,
        "type": event_type,
        "line": frame.f_lineno,
        "function": frame.f_code.co_name,
        "qualifiedFunction": trace_table_qualified_name(frame),
        "callId": meta["callId"] if meta else 0,
        "callDepth": meta["depth"] if meta else 0,
        "stack": trace_table_stack(frame),
    }
    event.update(details)
    for collection_name in ("variables", "writes", "deletes"):
        for value in event.get(collection_name, []):
            trace_table_add_catalogue(value, trace_table_sequence)
    trace_table_batch.append(event)
    if len(trace_table_batch) >= TRACE_TABLE_BATCH_SIZE:
        trace_table_flush()
    if trace_table_sequence + 1 >= TRACE_TABLE_EVENT_LIMIT:
        # Flush the exact event which reaches the bound, including any newly
        # discovered catalogue entries, before publishing the terminal ack.
        trace_table_flush()
        js_trace_table_limit_reached(trace_table_sequence + 1, TRACE_TABLE_EVENT_LIMIT, trace_table_sequence)
        raise _TraceTableLimitReached()

def trace_table_values_equal(left, right):
    try:
        return json.dumps(left, sort_keys=True, separators=(",", ":")) == json.dumps(right, sort_keys=True, separators=(",", ":"))
    except Exception:
        return left == right

def trace_table_instruction(frame):
    code = frame.f_code
    opcode_map = trace_table_opcode_maps.get(code)
    if opcode_map is None:
        opcode_map = {instruction.offset: instruction for instruction in dis.get_instructions(code)}
        trace_table_opcode_maps[code] = opcode_map
    return opcode_map.get(frame.f_lasti)

def trace_table_finalize_opcode(frame):
    meta = trace_table_frame_meta(frame)
    if meta is None:
        return
    operation = meta.pop("pendingOpcode", None)
    if operation is None:
        return
    name = operation["name"]
    if operation["kind"] == "write":
        # Register a newly stored closure while its lexical defining frame is
        # still known. Waiting until it is returned is too late for callbacks
        # invoked indirectly first, where a dynamic caller may have a different
        # local with the same name as the captured cell.
        raw_value = frame.f_locals.get(name, frame.f_globals.get(name))
        trace_table_register_closure_value(frame, raw_value, set())
    pending = trace_table_pending.get(id(frame))
    if pending is None:
        return
    if operation["kind"] == "write":
        item = trace_table_capture_named(frame, name)
        if item is not None:
            before_item = operation.get("before")
            pending["actualWrites"].append({
                **item["source"],
                "value": item["value"],
                "operation": "write",
                "changed": before_item is None or not trace_table_values_equal(before_item["value"], item["value"]),
            })
    elif operation["kind"] == "delete":
        before_item = operation.get("before")
        if before_item is not None and trace_table_capture_named(frame, name) is None:
            pending["actualDeletes"].append({**before_item["source"], "operation": "delete"})

def trace_table_note_opcode(frame):
    trace_table_finalize_opcode(frame)
    instruction = trace_table_instruction(frame)
    if instruction is None:
        return
    opname = instruction.opname
    if opname in ("STORE_FAST", "STORE_NAME", "STORE_GLOBAL", "STORE_DEREF"):
        name = str(instruction.argval)
        meta = trace_table_frame_meta(frame)
        if meta is not None:
            meta["pendingOpcode"] = {"kind": "write", "name": name, "before": trace_table_capture_named(frame, name)}
        return
    pending = trace_table_pending.get(id(frame))
    if pending is None:
        return
    if opname in ("DELETE_FAST", "DELETE_NAME", "DELETE_GLOBAL", "DELETE_DEREF"):
        name = str(instruction.argval)
        meta = trace_table_frame_meta(frame)
        if meta is not None:
            meta["pendingOpcode"] = {"kind": "delete", "name": name, "before": trace_table_capture_named(frame, name)}
    elif opname in ("STORE_ATTR", "STORE_SUBSCR", "STORE_SLICE", "DELETE_ATTR", "DELETE_SUBSCR", "DELETE_SLICE"):
        pending["actualMutation"] = True
    elif opname == "CALL" or opname.startswith("CALL_FUNCTION") or opname.startswith("CALL_METHOD"):
        pending["actualCall"] = True

def trace_table_complete_statement(frame, next_line=None, completion="line"):
    pending = trace_table_pending.pop(id(frame), None)
    if pending is None:
        return

    descriptor = pending["descriptor"]
    before_targets = pending["beforeTargets"]
    loop = pending.get("loop")
    entered_loop = False
    loop_boundary = None
    if loop is not None and next_line is not None:
        entered_loop = loop["body_start"] <= next_line <= loop["body_end"]
        if entered_loop:
            loop_key = (pending["callId"], loop["id"])
            iteration = trace_table_loop_iterations.get(loop_key, 0) + 1
            trace_table_loop_iterations[loop_key] = iteration
            loop_boundary = {"loopId": loop["id"], "loopKind": loop["kind"], "iteration": iteration}

    intended_writes = set(descriptor.get("writes", []))
    intended_deletes = set(descriptor.get("deletes", []))
    # Opcode evidence proves execution; AST intent excludes compiler-generated
    # cleanup stores such as clearing an except-as binding.
    writes = [write for write in pending.get("actualWrites", []) if write["name"] in intended_writes]
    deletes = [deleted for deleted in pending.get("actualDeletes", []) if deleted["name"] in intended_deletes]
    failed = pending.get("failed", False)

    if pending.get("actualMutation") or pending.get("actualCall"):
        for name in descriptor.get("mutations", []):
            if any(write["name"] == name for write in writes):
                continue
            before_item = before_targets.get(name)
            item = trace_table_capture_named(frame, name)
            if item is not None and before_item is not None and not trace_table_values_equal(before_item["value"], item["value"]):
                writes.append({**item["source"], "value": item["value"], "operation": "mutation", "changed": True})

    trace_table_record(
        "statement",
        frame,
        line=pending["line"],
        completedBy=completion,
        statementKinds=descriptor.get("kinds", []),
        writes=writes,
        deletes=deletes,
        failed=failed,
        loopBoundary=loop_boundary,
        output=trace_table_take_output(),
        variables=trace_table_capture_active(frame),
    )

def trace_table_begin_statement(frame, line_no):
    descriptor = statement_descriptors.get(line_no, {"writes": [], "deletes": [], "mutations": [], "kinds": []})
    meta = trace_table_frame_meta(frame)
    target_names = set(descriptor.get("writes", [])) | set(descriptor.get("deletes", [])) | set(descriptor.get("mutations", []))
    trace_table_pending[id(frame)] = {
        "line": line_no,
        "callId": meta["callId"] if meta else 0,
        "descriptor": descriptor,
        "beforeTargets": {name: trace_table_capture_named(frame, name) for name in target_names},
        "loop": loop_descriptors.get(line_no),
        "failed": False,
        "actualWrites": [],
        "actualDeletes": [],
        "actualMutation": False,
        "actualCall": False,
    }

def trace_table_register_call(frame):
    global trace_table_next_call_id
    try:
        frame.f_trace_opcodes = True
    except Exception:
        pass
    existing = trace_table_frame_meta(frame)
    if existing is not None:
        existing["suspended"] = False
        trace_table_record("generator-resume", frame, variables=trace_table_capture_active(frame))
        return
    parent_depth = -1
    current = frame.f_back
    while current is not None:
        parent_meta = trace_table_frame_meta(current)
        if parent_meta is not None:
            parent_depth = parent_meta["depth"]
            break
        current = current.f_back
    meta = {
        "callId": trace_table_next_call_id,
        "function": frame.f_code.co_name,
        "qualifiedFunction": trace_table_qualified_name(frame),
        "depth": parent_depth + 1,
        "closureSources": trace_table_call_closure_sources(frame),
        "pendingException": None,
        "suspended": False,
        "pendingOpcode": None,
    }
    trace_table_next_call_id += 1
    trace_table_frames[id(frame)] = meta
    parameters = []
    positional_and_keyword = frame.f_code.co_argcount + frame.f_code.co_kwonlyargcount
    parameter_names = list(frame.f_code.co_varnames[:positional_and_keyword])
    next_index = positional_and_keyword
    if frame.f_code.co_flags & 0x04:
        parameter_names.append(frame.f_code.co_varnames[next_index])
        next_index += 1
    if frame.f_code.co_flags & 0x08:
        parameter_names.append(frame.f_code.co_varnames[next_index])
    captured = trace_table_capture_frame(frame)
    for name in parameter_names:
        if name in captured:
            item = captured[name]
            parameters.append({**item["source"], "value": item["value"], "operation": "parameter", "changed": True})
    trace_table_record("function-entry", frame, writes=parameters, variables=trace_table_capture_active(frame))

def trace_table_is_generator_yield(frame):
    flags = frame.f_code.co_flags
    if not (flags & 0x20 or flags & 0x200):
        return False
    try:
        code = frame.f_code.co_code
        current_op = dis.opname[code[frame.f_lasti]]
        # Python 3.13 reports f_lasti at the RESUME immediately following a
        # yield; older supported runtimes report the YIELD opcode itself.
        previous_op = dis.opname[code[frame.f_lasti - 2]] if frame.f_lasti >= 2 else ""
        return current_op in ("YIELD_VALUE", "YIELD_FROM") or previous_op in ("YIELD_VALUE", "YIELD_FROM")
    except Exception:
        return False

def trace_table_check_stop():
    try:
        if js_trace_stop_requested():
            trace_table_flush()
            js_trace_table_stop_ack()
            raise _TraceTableStopRequested()
    except _TraceTableStopRequested:
        raise
    except Exception:
        pass

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
        if frame.f_code.co_name == "<module>" and name in trace_runtime_global_names:
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
        if name in trace_runtime_global_names:
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

def breakpoint_matches(frame, line_no):
    # Returns True when line_no has an enabled breakpoint whose condition (if any)
    # evaluates truthy in the current frame. A broken condition never pauses.
    if line_no not in current_breakpoints:
        return False
    cond = current_breakpoints[line_no]
    if not cond:
        return True
    try:
        return bool(eval(cond, frame.f_globals, frame.f_locals))
    except Exception:
        return False

def should_pause(frame, line_no):
    global pending_action, breakpoint_hit
    breakpoint_hit = False
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
        if breakpoint_matches(frame, line_no):
            pending_action = None
            breakpoint_hit = True
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
        if trace_table_enabled:
            trace_table_check_stop()
            trace_table_register_call(frame)
        return trace_calls

    if event == "opcode":
        if trace_table_enabled:
            trace_table_note_opcode(frame)
        return trace_calls

    if trace_table_enabled:
        trace_table_finalize_opcode(frame)

    if event == "return":
        if trace_table_enabled:
            meta = trace_table_frame_meta(frame)
            if trace_table_is_generator_yield(frame):
                trace_table_complete_statement(frame, completion="yield")
                if meta is not None:
                    meta["suspended"] = True
                trace_table_record("generator-yield", frame, returnValue=serialize_value(arg), variables=trace_table_capture_active(frame))
                trace_table_check_stop()
                return trace_calls

            trace_table_register_closures(frame, arg)
            pending_exception = meta.get("pendingException") if meta is not None else None
            trace_table_complete_statement(frame, completion="exception" if pending_exception else "return")
            if pending_exception:
                trace_table_record("function-exception-exit", frame, exception=pending_exception, variables=trace_table_capture_active(frame))
            else:
                try:
                    return_value = serialize_value(arg)
                except Exception:
                    return_value = {"kind": "primitive", "type": "unknown", "value": "<unavailable>", "summary": "<unavailable>"}
                trace_table_record("function-return", frame, returnValue=return_value, variables=trace_table_capture_active(frame))
            trace_table_pending.pop(id(frame), None)
            trace_table_frames.pop(id(frame), None)
        frame_depths.pop(id(frame), None)
        if trace_table_enabled:
            trace_table_check_stop()
        return trace_calls

    if event == "exception":
        if trace_table_enabled:
            pending = trace_table_pending.get(id(frame))
            if pending is not None:
                pending["failed"] = True
            try:
                exc_type, exc_value, _ = arg
                exception_info = {"type": getattr(exc_type, "__name__", str(exc_type)), "message": str(exc_value)}
            except Exception:
                exception_info = {"type": "Exception", "message": "<unavailable>"}
            meta = trace_table_frame_meta(frame)
            if meta is not None:
                meta["pendingException"] = exception_info
            trace_table_record("exception", frame, exception=exception_info, variables=trace_table_capture_active(frame))
            trace_table_check_stop()
        return trace_calls

    if event != "line":
        return trace_calls

    ensure_frame_depth(frame)
    line_no = frame.f_lineno
    if trace_table_enabled:
        # CPython 3.13 resets opcode tracing after the call callback; setting it
        # on each line keeps STORE/DELETE fidelity across supported runtimes.
        try:
            frame.f_trace_opcodes = True
        except Exception:
            pass
        # Register concrete function/cell identities before this source line
        # can pass a closure through an indirect callback. Lexical-parent
        # validation prevents same-named locals in dynamic callers poisoning
        # the registry.
        trace_table_register_closures(frame)
        trace_table_complete_statement(frame, next_line=line_no)
        meta = trace_table_frame_meta(frame)
        if meta is not None:
            # Reaching another line in the same frame proves its last exception
            # was handled locally rather than escaping during stack unwind.
            meta["pendingException"] = None
        trace_table_check_stop()

    if line_no <= len(source_lines):
        stripped = source_lines[line_no - 1].strip()
        if stripped.startswith('def ') or stripped.startswith('class ') or stripped.startswith('@'):
            return trace_calls

    if trace_table_enabled:
        trace_table_begin_statement(frame, line_no)

    if not should_pause(frame, line_no):
        return trace_calls

    if trace_table_enabled:
        trace_table_flush()
    func_name, class_name, sim_state = snapshot_state(frame)
    watch_vals = evaluate_watches(frame)
    current_depth = get_depth(frame)

    cmd = js_trace_callback(line_no, func_name, class_name, sim_state, watch_vals, breakpoint_hit)
    if cmd == 5:
        trace_table_check_stop()
    elif cmd == 2:
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
  if (e.data.type === 'prewarm') {
    try {
      await ensurePyodide()
      self.postMessage({ type: 'runtime-ready' })
    } catch (err) {
      self.postMessage({ type: 'warm-error', error: String(err) })
    }
    return
  }
  if (e.data.type !== 'init') return

  const sab: SharedArrayBuffer = e.data.sab
  const int32View = new Int32Array(sab)
  const uint8View = new Uint8Array(sab)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pyodide: any
  try {
    pyodide = await ensurePyodide()
  } catch (err) {
    self.postMessage({ type: 'error', error: 'Failed to load Pyodide in the worker. ' + String(err) })
    return
  }

  const useSvgTurtle = Boolean(e.data.svgTurtleBootstrap)
  const stdctxBootstrap = String(e.data.stdctxBootstrap ?? '')
  // stdctx key state is a separate SharedArrayBuffer so the tightly packed
  // trace SAB layout above stays untouched.
  const stdctxKeys: Uint8Array | null = e.data.stdctxKeyBuffer
    ? new Uint8Array(e.data.stdctxKeyBuffer as SharedArrayBuffer)
    : null
  // Private buffer used only to park the worker for stdctx's time.sleep().
  const stdctxSleepView = new Int32Array(new SharedArrayBuffer(4))
  const traceTableEnabled = Boolean(e.data.traceTableEnabled ?? e.data.pauseOnFirstLine)
  const traceTableSessionId = String(e.data.traceTableSessionId ?? `trace-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const requestedTraceTableEventLimit = Number(e.data.traceTableEventLimit ?? TRACE_TABLE_EVENT_LIMIT)
  const traceTableEventLimit = Number.isSafeInteger(requestedTraceTableEventLimit) && requestedTraceTableEventLimit > 0
    ? requestedTraceTableEventLimit
    : TRACE_TABLE_EVENT_LIMIT
  let traceTableBatchIndex = 0
  let traceTableStopAcknowledged = false
  let traceTableLimitReached = false
  let traceTableTransportError: string | null = null
  const pendingTraceOutput: string[] = []

  // This callback never blocks the Python worker. Debugger pauses continue to
  // use js_trace_callback + SharedArrayBuffer; trace-table history is delivered
  // separately in modest batches so Continue/Step Over still records all lines.
  pyodide.globals.set('js_trace_table_batch', (payloadStr: string) => {
    try {
      const payload = JSON.parse(payloadStr) as {
        protocolVersion: number
        events: unknown[]
        catalogue: unknown[]
      }
      const batchSequence = traceTableBatchIndex
      self.postMessage({
        type: 'trace-table-batch',
        sessionId: traceTableSessionId,
        batchSequence,
        protocolVersion: payload.protocolVersion,
        events: payload.events,
        catalogue: payload.catalogue,
      })
      traceTableBatchIndex += 1
    } catch (error) {
      traceTableTransportError = error instanceof Error ? error.message : String(error)
      // Propagate into Python so trace_table_flush keeps ownership of the
      // unposted batch. A user handler may catch the bridge exception, but the
      // terminal flush below checks this persistent failure before completion.
      throw error
    }
  })

  pyodide.globals.set('js_trace_stop_requested', () => Atomics.load(int32View, 751) === 1)
  pyodide.globals.set('js_trace_table_take_output', () => {
    const output = pendingTraceOutput.splice(0)
    return JSON.stringify(output)
  })
  pyodide.globals.set('js_trace_table_stop_ack', () => {
    if (traceTableStopAcknowledged) return
    traceTableStopAcknowledged = true
    self.postMessage({ type: 'trace-table-stop-ack', sessionId: traceTableSessionId, batchCount: traceTableBatchIndex })
  })
  pyodide.globals.set('js_trace_table_limit_reached', (eventCount: number, eventLimit: number, lastSequence: number) => {
    if (traceTableLimitReached) return
    traceTableLimitReached = true
    const updatedFiles = collectUpdatedFiles()
    let finalTurtleSvg = ''
    if (useSvgTurtle) {
      try { finalTurtleSvg = String(pyodide.globals.get('__turtle_svg__') ?? '') } catch { /* ignore */ }
    }
    self.postMessage({
      type: 'trace-table-limit-reached',
      sessionId: traceTableSessionId,
      batchCount: traceTableBatchIndex,
      eventCount,
      eventLimit,
      lastSequence,
      droppedEventCount: 0,
    })
    if (finalTurtleSvg) self.postMessage({ type: 'turtle_update', svg: finalTurtleSvg })
    self.postMessage({ type: 'done', files: updatedFiles, traceTableLimitReached: true })

    // The terminal messages above are FIFO after the exact final batch. Block
    // inside the JS bridge so no bare `except`/BaseException handler in user
    // Python can intercept the fallback sentinel and continue untraced. The
    // main thread handles `done` and terminates this worker.
    const terminalWait = new Int32Array(new SharedArrayBuffer(4))
    for (;;) Atomics.wait(terminalWait, 0, 0)
  })

  pyodide.globals.set('js_trace_callback', (line: number, func: string, cls: string, stateStr: string, watchValsStr: string, isBreakpoint: boolean) => {
    let turtleSvg = ''
    if (useSvgTurtle) {
      try { turtleSvg = String(pyodide.globals.get('__turtle_svg__') ?? '') } catch { /* ignore */ }
    }
    let watchValues: Record<string, unknown> = {}
    try { if (watchValsStr && watchValsStr !== '{}') watchValues = JSON.parse(watchValsStr) } catch { /* ignore */ }
    Atomics.store(int32View, 0, 1)
    self.postMessage({ type: 'trace', line, func, cls, state: stateStr, turtleSvg, watchValues, isBreakpoint })
    Atomics.wait(int32View, 0, 1)
    if (traceTableEnabled && Atomics.load(int32View, 751) === 1) return 5
    const cmd = Atomics.load(int32View, 1)
    // Rebuild the breakpoint map: enabled line numbers (int32[500]=count,
    // int32[501..]) plus a conditions JSON blob (int32[600]=byteLen, uint8[2404..]).
    // A Map (not a plain object) makes pyodide.toPy produce int keys.
    const bpCount = Atomics.load(int32View, 500)
    const bpMap = new Map<number, string>()
    for (let i = 0; i < bpCount && i < 99; i++) bpMap.set(Atomics.load(int32View, 501 + i), '')
    try {
      const condLen = Atomics.load(int32View, 600)
      if (condLen > 0) {
        // .slice() (not .subarray()) copies into a non-shared ArrayBuffer;
        // TextDecoder.decode() rejects SharedArrayBuffer-backed views.
        const condBytes = uint8View.slice(2404, 2404 + Math.min(condLen, 592))
        const condMap = JSON.parse(new TextDecoder().decode(condBytes)) as Record<string, string>
        for (const k in condMap) bpMap.set(Number(k), condMap[k])
      }
    } catch { /* ignore malformed conditions */ }
    pyodide.globals.set('current_breakpoints', pyodide.toPy(bpMap))
    // Read updated watch expressions from SAB. int32[751] is reserved for the
    // cooperative stop flag, so JSON starts at byte 3008.
    try {
      const watchLen = Atomics.load(int32View, 750)
      if (watchLen >= 0) {
        // .slice() copies out of the SharedArrayBuffer (TextDecoder can't decode a shared view).
        const watchBytes = uint8View.slice(3008, 3008 + Math.min(watchLen, 1088))
        const exprs: string[] = watchLen === 0 ? [] : JSON.parse(new TextDecoder().decode(watchBytes))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pyodide.globals.set('watch_expressions', (pyodide as any).toPy(exprs))
      }
    } catch { /* ignore */ }
    return cmd
  })

  // ── stdctx bridge ────────────────────────────────────────────────────────
  pyodide.globals.set('js_stdctx_send', (commandsJson: string) => {
    self.postMessage({ type: 'stdctx_draw', commands: String(commandsJson) })
  })
  pyodide.globals.set('js_stdctx_check_key', (keyCode: number) => {
    if (!stdctxKeys) return false
    const code = Number(keyCode)
    if (!Number.isInteger(code) || code < 0 || code >= stdctxKeys.length) return false
    return Atomics.load(stdctxKeys, code) > 0
  })
  pyodide.globals.set('js_stdaud_send', (commandJson: string) => {
    self.postMessage({ type: 'stdaud', command: String(commandJson) })
  })
  pyodide.globals.set('js_stdctx_sleep', (seconds: number) => {
    const ms = Number(seconds) * 1000
    if (!Number.isFinite(ms) || ms <= 0) return
    // Nothing ever notifies this buffer, so the wait always runs to timeout.
    // Blocking here (rather than spinning) leaves the main thread free to
    // paint the draw batches already queued by postMessage.
    Atomics.wait(stdctxSleepView, 0, 0, ms)
  })

  pyodide.globals.set('js_input_callback', (promptText: string) => {
    Atomics.store(int32View, 0, 2)
    self.postMessage({ type: 'input', prompt: promptText })
    Atomics.wait(int32View, 0, 2)
    if (traceTableEnabled && Atomics.load(int32View, 751) === 1) return ''
    const len = Math.max(0, Math.min(Atomics.load(int32View, 2), 1988))
    const decoder = new TextDecoder()
    const copiedBytes = new Uint8Array(len)
    copiedBytes.set(uint8View.subarray(12, 12 + len))
    return decoder.decode(copiedBytes)
  })

  pyodide.globals.set('js_send_state', (line: number, func: string, cls: string, stateStr: string, watchValsStr: string) => {
    let watchValues: Record<string, unknown> = {}
    try { if (watchValsStr && watchValsStr !== '{}') watchValues = JSON.parse(watchValsStr) } catch { /* ignore */ }
    self.postMessage({ type: 'trace', line, func, cls, state: stateStr, watchValues })
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
    const skipDirs = pyodideSkipDirs(mountedPaths)
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
        if (skipDirs.has(full)) continue
        if (visited.has(full)) continue; visited.add(full)
        try {
          const stat = pyodide.FS.stat(full)
          if (pyodide.FS.isDir(stat.mode)) { walk(full) }
          else if (pyodide.FS.isFile(stat.mode)) {
            const bytes = pyodide.FS.readFile(full) as Uint8Array
            // No MIME opinion from here: syncFilesFromPyodide keeps whatever the
            // virtual filesystem already recorded, so a .wav or .png that the
            // program merely read does not come back typed as text.
            results.push({ path: full, content: bytes.buffer.slice(0) as ArrayBuffer, mimeType: '' })
          }
        } catch { /* skip */ }
      }
    }
    for (const d of dirsToScan) walk(d)
    return results
  }

  try {
    const userCode: string = e.data.code
    // The user's source gets parsed three times (Pyodide's import scan, then
    // our own ast.parse and compile), so a SyntaxWarning would be reported
    // three times over — once against Pyodide's anonymous "<unknown>" file.
    // Silence the import scan, then report each distinct warning once against
    // simulation.py, which is the name the student can actually act on.
    await pyodide.runPythonAsync('import warnings; warnings.simplefilter("ignore", SyntaxWarning)')
    await pyodide.loadPackagesFromImports(userCode)
    await pyodide.runPythonAsync('warnings.simplefilter("once", SyntaxWarning)')
    if (useSvgTurtle) {
      await pyodide.runPythonAsync(e.data.svgTurtleBootstrap as string)
    }
    if (stdctxBootstrap) {
      await pyodide.runPythonAsync(stdctxBootstrap)
    }
    const initialBreakpoints = new Map<number, string>()
    for (const breakpoint of (e.data.breakpoints ?? []) as Array<{ line: number; condition: string }>) {
      initialBreakpoints.set(breakpoint.line, breakpoint.condition)
    }
    pyodide.globals.set('initial_breakpoints', pyodide.toPy(initialBreakpoints))
    pyodide.globals.set('pause_on_first_line', Boolean(e.data.pauseOnFirstLine))
    pyodide.globals.set('trace_table_enabled', traceTableEnabled)
    pyodide.globals.set('trace_table_event_limit', traceTableEventLimit)
    pyodide.globals.set('user_code_str', userCode)
    await pyodide.runPythonAsync(SETUP_CODE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pyodide.globals.set('watch_expressions', (pyodide as any).toPy((e.data.watches ?? []) as string[]))
    traceStdoutCapture = traceTableEnabled ? text => pendingTraceOutput.push(text) : null
    await pyodide.runPythonAsync(`
code_obj = compile(user_code_str, "simulation.py", "exec")
exec(code_obj, user_namespace, user_namespace)
    `)
    await pyodide.runPythonAsync('trace_table_flush()')
    traceStdoutCapture = null
    if (traceTableTransportError) throw new Error(`Trace table transport failed: ${traceTableTransportError}`)
    const updatedFiles = collectUpdatedFiles()
    let finalTurtleSvg = ''
    if (useSvgTurtle) {
      try { finalTurtleSvg = String(pyodide.globals.get('__turtle_svg__') ?? '') } catch { /* ignore */ }
    }
    if (finalTurtleSvg) self.postMessage({ type: 'turtle_update', svg: finalTurtleSvg })
    if (traceTableEnabled) self.postMessage({ type: 'trace-table-end', sessionId: traceTableSessionId, status: 'done', batchCount: traceTableBatchIndex })
    self.postMessage({ type: 'done', files: updatedFiles })
  } catch (err) {
    traceStdoutCapture = null
    // Flush ordinary runtime/stop failures, but never retry a transport batch
    // after the bridge has failed: its delivered prefix is the only history
    // the terminal acknowledgement may claim as complete.
    if (!traceTableTransportError) {
      try { await pyodide.runPythonAsync('trace_table_flush()') } catch { /* best effort */ }
    }
    const updatedFiles = collectUpdatedFiles()
    let finalTurtleSvg = ''
    if (useSvgTurtle) {
      try { finalTurtleSvg = String(pyodide.globals.get('__turtle_svg__') ?? '') } catch { /* ignore */ }
    }
    if (finalTurtleSvg) self.postMessage({ type: 'turtle_update', svg: finalTurtleSvg })
    if (traceTableLimitReached) {
      // The exact capped prefix and acknowledgement were already posted FIFO.
      // Limit termination is deliberate, not a runtime error or ordinary end.
      self.postMessage({ type: 'done', files: updatedFiles, traceTableLimitReached: true })
      return
    }
    if (traceTableStopAcknowledged) {
      if (traceTableEnabled) self.postMessage({ type: 'trace-table-end', sessionId: traceTableSessionId, status: 'stopped', batchCount: traceTableBatchIndex })
      self.postMessage({ type: 'done', files: updatedFiles })
      return
    }
    if (traceTableEnabled) self.postMessage({
      type: 'trace-table-end',
      sessionId: traceTableSessionId,
      status: 'error',
      batchCount: traceTableBatchIndex,
      error: String(err),
      traceDataIncomplete: traceTableTransportError !== null,
    })
    self.postMessage({ type: 'error', error: String(err), files: updatedFiles })
  }
}
