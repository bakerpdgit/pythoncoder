import { PYODIDE_BASE_URL } from '../constants'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mainPyodidePromise: Promise<any> | null = null

const loadExternalScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null
    if (existing) {
      if (existing.dataset.loaded === 'true') { resolve(); return }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error(`Failed to load remote script: ${src}`)), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.crossOrigin = 'anonymous'
    script.onload = () => { script.dataset.loaded = 'true'; resolve() }
    script.onerror = () => reject(new Error(`Failed to load remote script: ${src}`))
    document.head.appendChild(script)
  })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const loadMainThreadPyodide = async (): Promise<any> => {
  await loadExternalScript(`${PYODIDE_BASE_URL}/pyodide.js`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (window as any).loadPyodide !== 'function') {
    throw new Error('Pyodide did not load on the main thread.')
  }
  if (!mainPyodidePromise) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mainPyodidePromise = (window as any).loadPyodide({ indexURL: `${PYODIDE_BASE_URL}/` })
  }
  return mainPyodidePromise
}

export const PYGAME_MAIN_THREAD_BOOTSTRAP = String.raw`
import ast
import asyncio
import builtins
import inspect
import time


def __coder_prompt_input(prompt=""):
    return js_input_prompt(prompt)


builtins.input = __coder_prompt_input

try:
    import pygame
except Exception as exc:
    raise RuntimeError("pygame-ce could not be imported in Pyodide.") from exc


class CoderBrowserClock:
    def __init__(self):
        self._last = time.perf_counter()
        self._time = 0
        self._rawtime = 0
        self._fps = 0.0

    def _sample(self):
        now = time.perf_counter()
        elapsed = max(0.0, now - self._last)
        self._last = now
        milliseconds = int(round(elapsed * 1000))
        self._time = milliseconds
        self._rawtime = milliseconds
        self._fps = (1.0 / elapsed) if elapsed > 1e-9 else 0.0
        return milliseconds

    def tick(self, fps=0):
        return self._sample()

    def tick_busy_loop(self, fps=0):
        return self._sample()

    def get_time(self):
        return self._time

    def get_rawtime(self):
        return self._rawtime

    def get_fps(self):
        return self._fps


class CoderMainThreadStop(Exception):
    pass


def coder_check_main_thread_stop():
    if js_should_stop_main_thread():
        raise CoderMainThreadStop()


async def coder_pygame_frame(delay_seconds=0.0):
    coder_check_main_thread_stop()
    try:
        delay = float(delay_seconds or 0.0)
    except Exception:
        delay = 0.0
    await asyncio.sleep(max(0.0, delay))
    coder_check_main_thread_stop()


async def coder_pygame_tick(clock, fps=0):
    coder_check_main_thread_stop()
    try:
        fps_value = float(fps or 0)
    except Exception:
        fps_value = 0.0
    if fps_value > 0:
        await asyncio.sleep(1.0 / fps_value)
    else:
        await asyncio.sleep(0)
    coder_check_main_thread_stop()
    return clock.tick(fps)


async def coder_pygame_wait(milliseconds=0):
    coder_check_main_thread_stop()
    try:
        delay = max(0.0, float(milliseconds) / 1000.0)
    except Exception:
        delay = 0.0
    await asyncio.sleep(delay)
    coder_check_main_thread_stop()
    return int(round(delay * 1000))


pygame.time.Clock = CoderBrowserClock


def coder_attr_chain(expr):
    parts = []
    current = expr
    while isinstance(current, ast.Attribute):
        parts.append(current.attr)
        current = current.value
    if isinstance(current, ast.Name):
        parts.append(current.id)
        return list(reversed(parts))
    return None


def coder_call_id(call):
    func = call.func
    if isinstance(func, ast.Name):
        return ("name", func.id)
    if isinstance(func, ast.Attribute):
        return ("attr", func.attr)
    return None


def coder_is_display_frame_call(call):
    chain = coder_attr_chain(call.func)
    return chain in (["pygame", "display", "flip"], ["pygame", "display", "update"])


def coder_is_clock_tick_call(call):
    return isinstance(call.func, ast.Attribute) and call.func.attr in {"tick", "tick_busy_loop"}


def coder_is_wait_call(call):
    chain = coder_attr_chain(call.func)
    return chain in (["pygame", "time", "wait"], ["pygame", "time", "delay"])


def coder_is_async_pause_call(call):
    if coder_is_clock_tick_call(call) or coder_is_wait_call(call):
        return True
    chain = coder_attr_chain(call.func)
    if chain == ["asyncio", "sleep"]:
        return True
    if isinstance(call.func, ast.Name) and call.func.id in {"coder_pygame_frame", "coder_pygame_tick", "coder_pygame_wait"}:
        return True
    return False


class CoderLoopFeatureVisitor(ast.NodeVisitor):
    def __init__(self):
        self.has_frame_call = False
        self.has_async_pause = False

    def visit_Call(self, node):
        if coder_is_display_frame_call(node):
            self.has_frame_call = True
        if coder_is_clock_tick_call(node) or coder_is_wait_call(node):
            self.has_frame_call = True
            self.has_async_pause = True
        elif coder_is_async_pause_call(node):
            self.has_async_pause = True
        self.generic_visit(node)

    def visit_Await(self, node):
        self.has_async_pause = True
        self.generic_visit(node)

    def visit_FunctionDef(self, node): return None
    def visit_AsyncFunctionDef(self, node): return None
    def visit_ClassDef(self, node): return None
    def visit_Lambda(self, node): return None


def coder_loop_features(loop_node):
    visitor = CoderLoopFeatureVisitor()
    for statement in list(loop_node.body) + list(loop_node.orelse):
        visitor.visit(statement)
    return visitor.has_frame_call, visitor.has_async_pause


class CoderLoopSignalVisitor(ast.NodeVisitor):
    def __init__(self):
        self.has_frame_loop = False
        self.frame_loop_count = 0

    def visit_While(self, node):
        has_frame_call, _ = coder_loop_features(node)
        if has_frame_call:
            self.has_frame_loop = True
            self.frame_loop_count += 1
        for statement in list(node.body) + list(node.orelse):
            self.visit(statement)

    def visit_FunctionDef(self, node): return None
    def visit_AsyncFunctionDef(self, node): return None
    def visit_ClassDef(self, node): return None
    def visit_Lambda(self, node): return None


def coder_body_frame_loop_info(body):
    visitor = CoderLoopSignalVisitor()
    for statement in body:
        visitor.visit(statement)
    return visitor.has_frame_loop, visitor.frame_loop_count


class CoderCallCollector(ast.NodeVisitor):
    def __init__(self):
        self.calls = set()

    def visit_Call(self, node):
        call_id = coder_call_id(node)
        if call_id is not None:
            self.calls.add(call_id)
        self.generic_visit(node)

    def visit_FunctionDef(self, node): return None
    def visit_AsyncFunctionDef(self, node): return None
    def visit_ClassDef(self, node): return None
    def visit_Lambda(self, node): return None


def coder_collect_calls(body):
    collector = CoderCallCollector()
    for statement in body:
        collector.visit(statement)
    return collector.calls


class CoderFunctionIndexVisitor(ast.NodeVisitor):
    def __init__(self):
        self.scope = []
        self.records = {}
        self.module_calls = set()
        self.module_has_frame_loop = False
        self.module_frame_loops = 0

    def visit_Module(self, node):
        self.module_calls = coder_collect_calls(node.body)
        self.module_has_frame_loop, self.module_frame_loops = coder_body_frame_loop_info(node.body)
        for statement in node.body:
            if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                self.visit(statement)

    def visit_ClassDef(self, node):
        self.scope.append(node.name)
        for statement in node.body:
            if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                self.visit(statement)
        self.scope.pop()

    def visit_FunctionDef(self, node): self._record(node)
    def visit_AsyncFunctionDef(self, node): self._record(node)

    def _record(self, node):
        qualname = ".".join(self.scope + [node.name])
        has_frame_loop, frame_loop_count = coder_body_frame_loop_info(node.body)
        self.records[qualname] = {"name": node.name, "calls": coder_collect_calls(node.body), "has_frame_loop": has_frame_loop, "frame_loop_count": frame_loop_count}
        self.scope.append(node.name)
        for statement in node.body:
            if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                self.visit(statement)
        self.scope.pop()


def coder_resolve_async_targets(records):
    async_targets = {qualname for qualname, record in records.items() if record["has_frame_loop"]}
    async_names = {records[qualname]["name"] for qualname in async_targets}
    changed = True
    while changed:
        changed = False
        for qualname, record in records.items():
            if qualname in async_targets:
                continue
            if any(call_name in async_names for _, call_name in record["calls"]):
                async_targets.add(qualname)
                async_names.add(record["name"])
                changed = True
    return async_targets, async_names


class CoderPygameBrowserTransformer(ast.NodeTransformer):
    def __init__(self, async_names):
        self.async_names = set(async_names)
        self.async_context_stack = [True]
        self.in_await = False

    @property
    def in_async_context(self):
        return self.async_context_stack[-1]

    def _visit_body(self, body, async_context=None):
        if async_context is not None:
            self.async_context_stack.append(async_context)
        updated_body = []
        for statement in body:
            visited = self.visit(statement)
            if visited is None: continue
            if isinstance(visited, list): updated_body.extend(visited)
            else: updated_body.append(visited)
        if async_context is not None:
            self.async_context_stack.pop()
        return updated_body

    def visit_Module(self, node):
        node.body = self._visit_body(node.body)
        return node

    def visit_ClassDef(self, node):
        node.bases = [self.visit(base) for base in node.bases]
        node.keywords = [self.visit(keyword) for keyword in node.keywords]
        node.decorator_list = [self.visit(dec) for dec in node.decorator_list]
        node.body = self._visit_body(node.body)
        return node

    def visit_FunctionDef(self, node):
        is_async_target = node.name in self.async_names
        args = self.visit(node.args)
        decorator_list = [self.visit(dec) for dec in node.decorator_list]
        returns = self.visit(node.returns) if node.returns else None
        type_comment = node.type_comment
        type_params = getattr(node, "type_params", [])
        body = self._visit_body(node.body, async_context=is_async_target)
        if is_async_target:
            replacement_kwargs = dict(name=node.name, args=args, body=body, decorator_list=decorator_list, returns=returns, type_comment=type_comment)
            if "type_params" in getattr(ast.AsyncFunctionDef, "_fields", ()):
                replacement_kwargs["type_params"] = type_params
            replacement = ast.AsyncFunctionDef(**replacement_kwargs)
            return ast.copy_location(replacement, node)
        node.args = args
        node.decorator_list = decorator_list
        node.returns = returns
        node.body = body
        if hasattr(node, "type_params"):
            node.type_params = type_params
        return node

    def visit_AsyncFunctionDef(self, node):
        node.args = self.visit(node.args)
        node.decorator_list = [self.visit(dec) for dec in node.decorator_list]
        node.returns = self.visit(node.returns) if node.returns else None
        node.body = self._visit_body(node.body, async_context=True)
        return node

    def visit_Await(self, node):
        was_in_await = self.in_await
        self.in_await = True
        node.value = self.visit(node.value)
        self.in_await = was_in_await
        return node

    def visit_Call(self, node):
        node = self.generic_visit(node)
        if self.in_await or not self.in_async_context:
            return node
        if coder_is_clock_tick_call(node):
            replacement = ast.Call(func=ast.Name(id="coder_pygame_tick", ctx=ast.Load()), args=[node.func.value, *node.args], keywords=node.keywords)
            return ast.copy_location(ast.Await(value=replacement), node)
        if coder_is_wait_call(node):
            replacement = ast.Call(func=ast.Name(id="coder_pygame_wait", ctx=ast.Load()), args=node.args, keywords=node.keywords)
            return ast.copy_location(ast.Await(value=replacement), node)
        call_id = coder_call_id(node)
        if call_id is not None and call_id[1] in self.async_names:
            return ast.copy_location(ast.Await(value=node), node)
        return node

    def visit_While(self, node):
        has_frame_call, has_async_pause = coder_loop_features(node)
        node.test = self.visit(node.test)
        node.body = self._visit_body(node.body)
        node.orelse = self._visit_body(node.orelse)
        if has_frame_call and self.in_async_context:
            stop_check = ast.Expr(value=ast.Call(func=ast.Name(id="coder_check_main_thread_stop", ctx=ast.Load()), args=[], keywords=[]))
            anchor = node.body[-1] if node.body else node
            node.body.insert(0, ast.copy_location(stop_check, node))
            if not has_async_pause:
                frame_yield = ast.Expr(value=ast.Await(value=ast.Call(func=ast.Name(id="coder_pygame_frame", ctx=ast.Load()), args=[], keywords=[])))
                node.body.append(ast.copy_location(frame_yield, anchor))
        return node


__coder_tree = ast.parse(__coder_user_code__, filename="simulation.py")
__coder_index = CoderFunctionIndexVisitor()
__coder_index.visit(__coder_tree)
__coder_async_targets, __coder_async_names = coder_resolve_async_targets(__coder_index.records)
__coder_transformer = CoderPygameBrowserTransformer(__coder_async_names)
__coder_tree = __coder_transformer.visit(__coder_tree)
ast.fix_missing_locations(__coder_tree)

__coder_async_count = len(__coder_async_targets)
__coder_frame_loop_count = __coder_index.module_frame_loops + sum(record["frame_loop_count"] for record in __coder_index.records.values())

js_set_main_thread_status(
    "pygame browser compatibility active: "
    + str(__coder_frame_loop_count)
    + " loop(s) adapted across "
    + str(__coder_async_count)
    + " async definition(s)."
)
js_append_main_thread_log(
    "[INFO] pygame browser compatibility active: "
    + str(__coder_frame_loop_count)
    + " loop(s), "
    + str(__coder_async_count)
    + " async definition(s)."
)

try:
    __coder_code_obj = compile(__coder_tree, "simulation.py", "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
    __coder_result = eval(__coder_code_obj, globals())
    if inspect.isawaitable(__coder_result):
        await __coder_result
except SystemExit:
    pass
except CoderMainThreadStop:
    js_append_main_thread_log("[INFO] Main-thread pygame run stopped.")
finally:
    try:
        pygame.quit()
    except Exception:
        pass
`
