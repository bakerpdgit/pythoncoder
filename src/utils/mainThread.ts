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

// ── Turtle canvas bootstrap (pyo-js-turtle mode, main thread) ─────────────

export const TURTLE_CANVAS_BOOTSTRAP = String.raw`
import ast, asyncio, builtins, math, sys, types as _types_mod

def __coder_prompt_input(prompt=""):
    return js_input_prompt(prompt)
builtins.input = __coder_prompt_input

import js
from pyodide.ffi import create_proxy as _create_proxy

_canvas = js.document.getElementById('canvas')
_canvas.width = 600
_canvas.height = 600
_ctx = _canvas.getContext('2d')
_ctx.fillStyle = 'white'
_ctx.fillRect(0, 0, 600, 600)

_SPEED_DELAY = {0: 0.0, 1: 0.12, 2: 0.07, 3: 0.045, 4: 0.027, 5: 0.016,
                6: 0.010, 7: 0.006, 8: 0.003, 9: 0.001, 10: 0.0}

_COLOR_MAP = {
    'red':'#ff0000','green':'#008000','blue':'#0000ff','yellow':'#ffff00',
    'orange':'#ffa500','purple':'#800080','pink':'#ffc0cb','black':'#000000',
    'white':'#ffffff','gray':'#808080','grey':'#808080','brown':'#a52a2a',
    'cyan':'#00ffff','magenta':'#ff00ff','lime':'#00ff00','maroon':'#800000',
    'navy':'#000080','olive':'#808000','teal':'#008080','silver':'#c0c0c0',
    'gold':'#ffd700','violet':'#ee82ee','indigo':'#4b0082','turquoise':'#40e0d0',
    'coral':'#ff7f50','salmon':'#fa8072','dark red':'#8b0000','dark green':'#006400',
    'dark blue':'#00008b','light blue':'#add8e6','light green':'#90ee90',
}

def _parse_color(c):
    if c is None: return '#000000'
    if isinstance(c, (list, tuple)) and len(c) == 3:
        r, g, b = c
        if all(isinstance(v, float) and 0.0 <= v <= 1.0 for v in (r,g,b)):
            return f'rgb({int(r*255)},{int(g*255)},{int(b*255)})'
        return f'rgb({int(r)},{int(g)},{int(b)})'
    s = str(c).lower().strip()
    return _COLOR_MAP.get(s, s)

def _tx(x): return x + _canvas.width / 2
def _ty(y): return _canvas.height / 2 - y

class _Screen:
    def __init__(self):
        self._bgcolor = 'white'
        self._key_handlers = {}

    def setup(self, width=None, height=None, startx=None, starty=None):
        w = int(width) if width is not None else _canvas.width
        h = int(height) if height is not None else _canvas.height
        _canvas.width = w; _canvas.height = h
        js_turtle_resize(w, h)
        _ctx.fillStyle = self._bgcolor
        _ctx.fillRect(0, 0, w, h)

    def screensize(self, canvwidth=None, canvheight=None, bg=None):
        if canvwidth is not None: _canvas.width = int(canvwidth)
        if canvheight is not None: _canvas.height = int(canvheight)
        if bg is not None: self.bgcolor(bg)

    def bgcolor(self, color=None):
        if color is not None:
            self._bgcolor = _parse_color(color)
            _ctx.fillStyle = self._bgcolor
            _ctx.fillRect(0, 0, _canvas.width, _canvas.height)
        return self._bgcolor

    def title(self, s): pass
    def tracer(self, n=None, delay=None): pass
    def update(self): pass
    def listen(self): js_turtle_listen()

    def onkeypress(self, fun, key=None):
        if key is not None and fun is not None:
            self._key_handlers[key] = fun

    def onkey(self, fun, key=None): self.onkeypress(fun, key)
    def onkeyrelease(self, fun, key=None): pass
    def onclick(self, fun, btn=1, add=None): pass
    def ontimer(self, fun, t=0): pass
    def mainloop(self): pass
    def done(self): pass
    def bye(self): pass
    def exitonclick(self): pass
    def numinput(self, title, prompt, default=None, minval=None, maxval=None):
        try: return float(js_input_prompt(prompt))
        except: return default
    def textinput(self, title, prompt): return js_input_prompt(prompt)
    def window_width(self): return _canvas.width
    def window_height(self): return _canvas.height
    def cv(self): return None

class _Turtle:
    def __init__(self):
        self._x = 0.0; self._y = 0.0; self._heading = 0.0
        self._pen = True; self._pc = '#000000'; self._fc = '#000000'
        self._pw = 1; self._visible = True; self._speed = 6
        self._filling = False; self._fp = []

    def _move_to(self, nx, ny):
        if self._pen:
            _ctx.beginPath()
            _ctx.strokeStyle = self._pc
            _ctx.lineWidth = self._pw
            _ctx.lineCap = 'round'
            _ctx.moveTo(_tx(self._x), _ty(self._y))
            _ctx.lineTo(_tx(nx), _ty(ny))
            _ctx.stroke()
        if self._filling:
            self._fp.append((nx, ny))
        self._x = nx; self._y = ny

    def forward(self, dist):
        rad = math.radians(self._heading)
        self._move_to(self._x + dist*math.cos(rad), self._y + dist*math.sin(rad))
    fd = forward

    def backward(self, dist): self.forward(-dist)
    bk = backward; back = backward

    def right(self, angle): self._heading = (self._heading - angle) % 360
    rt = right
    def left(self, angle): self._heading = (self._heading + angle) % 360
    lt = left

    def goto(self, x, y=None):
        if y is None and hasattr(x, '__iter__'): x, y = tuple(x)
        self._move_to(float(x), float(y))
    setpos = goto; setposition = goto
    def setx(self, x): self._move_to(x, self._y)
    def sety(self, y): self._move_to(self._x, y)
    def setheading(self, a): self._heading = float(a) % 360
    seth = setheading

    def home(self): self._move_to(0.0, 0.0); self._heading = 0.0

    def circle(self, radius, extent=None, steps=None):
        if extent is None: extent = 360
        if steps is None: steps = max(int(abs(radius) * abs(extent) / 60), 4)
        step_a = extent / steps
        step_len = 2*math.pi*abs(radius)*abs(extent)/360/steps if steps > 0 else 0
        sign = 1 if radius >= 0 else -1
        for _ in range(steps): self.forward(step_len); self.left(sign*step_a)

    def dot(self, size=None, color=None):
        if size is None: size = max(self._pw+4, self._pw*2)
        _ctx.beginPath()
        _ctx.fillStyle = _parse_color(color) if color else self._pc
        _ctx.arc(_tx(self._x), _ty(self._y), size/2, 0, 2*math.pi)
        _ctx.fill()

    def stamp(self): return id(self)
    def clearstamp(self, s): pass
    def clearstamps(self, n=None): pass

    def penup(self): self._pen = False
    pu = penup; up = penup
    def pendown(self): self._pen = True
    pd = pendown; down = pendown

    def pensize(self, w=None):
        if w is not None: self._pw = max(1, int(w))
        return self._pw
    width = pensize

    def pencolor(self, *a):
        if a: self._pc = _parse_color(a[0] if len(a)==1 else list(a))
        return self._pc
    def fillcolor(self, *a):
        if a: self._fc = _parse_color(a[0] if len(a)==1 else list(a))
        return self._fc
    def color(self, *a):
        if len(a)==1: self._pc = self._fc = _parse_color(a[0])
        elif len(a)==2: self._pc=_parse_color(a[0]); self._fc=_parse_color(a[1])
        return self._pc, self._fc

    def begin_fill(self): self._filling = True; self._fp = [(self._x, self._y)]
    def end_fill(self):
        if self._filling and len(self._fp) >= 3:
            _ctx.beginPath()
            _ctx.moveTo(_tx(self._fp[0][0]), _ty(self._fp[0][1]))
            for px, py in self._fp[1:]: _ctx.lineTo(_tx(px), _ty(py))
            _ctx.closePath(); _ctx.fillStyle = self._fc; _ctx.fill()
        self._filling = False; self._fp = []

    def clear(self):
        _ctx.fillStyle = _global_screen._bgcolor
        _ctx.fillRect(0, 0, _canvas.width, _canvas.height)
    def reset(self):
        self.clear(); self._x=self._y=0.0; self._heading=0.0
        self._pen=True; self._pc='#000000'; self._fc='#000000'; self._pw=1

    def hideturtle(self): self._visible = False
    ht = hideturtle
    def showturtle(self): self._visible = True
    st = showturtle
    def isvisible(self): return self._visible
    def isdown(self): return self._pen

    def pos(self): return (self._x, self._y)
    position = pos
    def xcor(self): return self._x
    def ycor(self): return self._y
    def heading(self): return self._heading

    def towards(self, x, y=None):
        if y is None and hasattr(x,'__iter__'): x,y=tuple(x)
        return math.degrees(math.atan2(float(y)-self._y, float(x)-self._x))%360
    def distance(self, x, y=None):
        if y is None and hasattr(x,'__iter__'): x,y=tuple(x)
        return math.sqrt((float(x)-self._x)**2+(float(y)-self._y)**2)

    def speed(self, s=None):
        if s is not None: self._speed = s if s==0 else max(1,min(10,int(s)))
        return self._speed
    def shape(self, *a): return 'classic'
    def shapesize(self, *a): pass
    def resizemode(self, *a): pass
    def onclick(self, *a): pass
    def onrelease(self, *a): pass
    def ondrag(self, *a): pass

    def write(self, arg, move=False, align='left', font=('Arial',8,'normal')):
        fname=font[0] if isinstance(font,(list,tuple)) and len(font)>0 else 'Arial'
        fsize=font[1] if isinstance(font,(list,tuple)) and len(font)>1 else 8
        fstyle=font[2] if isinstance(font,(list,tuple)) and len(font)>2 else 'normal'
        fb='bold' if 'bold' in str(fstyle) else 'normal'
        _ctx.font=f'{fb} {fsize}px {fname}'
        _ctx.fillStyle=self._pc
        _ctx.fillText(str(arg), _tx(self._x), _ty(self._y))

_global_screen = _Screen()
_default_turtle = _Turtle()

def __turtle_delay__():
    return _SPEED_DELAY.get(_default_turtle._speed, 0.010)

_turtle_mod = _types_mod.ModuleType('turtle')
for _fn, _tgt in [
    ('forward',_default_turtle.forward),('fd',_default_turtle.fd),
    ('backward',_default_turtle.backward),('bk',_default_turtle.bk),
    ('back',_default_turtle.back),('right',_default_turtle.right),
    ('rt',_default_turtle.rt),('left',_default_turtle.left),
    ('lt',_default_turtle.lt),('goto',_default_turtle.goto),
    ('setpos',_default_turtle.setpos),('setposition',_default_turtle.setposition),
    ('setx',_default_turtle.setx),('sety',_default_turtle.sety),
    ('setheading',_default_turtle.setheading),('seth',_default_turtle.seth),
    ('home',_default_turtle.home),('circle',_default_turtle.circle),
    ('dot',_default_turtle.dot),('stamp',_default_turtle.stamp),
    ('penup',_default_turtle.penup),('pu',_default_turtle.pu),
    ('up',_default_turtle.up),('pendown',_default_turtle.pendown),
    ('pd',_default_turtle.pd),('down',_default_turtle.down),
    ('pensize',_default_turtle.pensize),('width',_default_turtle.width),
    ('pencolor',_default_turtle.pencolor),('fillcolor',_default_turtle.fillcolor),
    ('color',_default_turtle.color),('begin_fill',_default_turtle.begin_fill),
    ('end_fill',_default_turtle.end_fill),('clear',_default_turtle.clear),
    ('reset',_default_turtle.reset),('hideturtle',_default_turtle.hideturtle),
    ('ht',_default_turtle.ht),('showturtle',_default_turtle.showturtle),
    ('st',_default_turtle.st),('isdown',_default_turtle.isdown),
    ('isvisible',_default_turtle.isvisible),('pos',_default_turtle.pos),
    ('position',_default_turtle.position),('xcor',_default_turtle.xcor),
    ('ycor',_default_turtle.ycor),('heading',_default_turtle.heading),
    ('towards',_default_turtle.towards),('distance',_default_turtle.distance),
    ('speed',_default_turtle.speed),('write',_default_turtle.write),
    ('shape',_default_turtle.shape),('shapesize',_default_turtle.shapesize),
    ('setup',_global_screen.setup),('screensize',_global_screen.screensize),
    ('bgcolor',_global_screen.bgcolor),('title',_global_screen.title),
    ('tracer',_global_screen.tracer),('update',_global_screen.update),
    ('listen',_global_screen.listen),('onkeypress',_global_screen.onkeypress),
    ('onkey',_global_screen.onkey),('onkeyrelease',_global_screen.onkeyrelease),
    ('mainloop',_global_screen.mainloop),('done',_global_screen.done),
    ('bye',_global_screen.bye),('exitonclick',_global_screen.exitonclick),
    ('window_width',_global_screen.window_width),
    ('window_height',_global_screen.window_height),
    ('numinput',_global_screen.numinput),('textinput',_global_screen.textinput),
]: _turtle_mod.__dict__[_fn] = _tgt
_turtle_mod.__dict__['Turtle'] = _Turtle
_turtle_mod.__dict__['Pen'] = _Turtle
_turtle_mod.__dict__['Screen'] = lambda: _global_screen
sys.modules['turtle'] = _turtle_mod

class _TurtleYielder(ast.NodeTransformer):
    def _yield(self):
        return ast.Expr(value=ast.Await(value=ast.Call(
            func=ast.Attribute(value=ast.Name(id='asyncio',ctx=ast.Load()),
                               attr='sleep',ctx=ast.Load()),
            args=[ast.Call(func=ast.Name(id='__turtle_delay__',ctx=ast.Load()),
                           args=[],keywords=[])],
            keywords=[])))
    def visit_For(self, node):
        self.generic_visit(node); node.body.append(self._yield()); return node
    def visit_While(self, node):
        self.generic_visit(node); node.body.append(self._yield()); return node
    def visit_Module(self, node):
        self.generic_visit(node)
        # import * is illegal inside a function; hoist those stmts to module level
        star_imports = []
        other_stmts = []
        for s in node.body:
            if isinstance(s, ast.ImportFrom) and any(a.name == '*' for a in s.names):
                star_imports.append(s)
            else:
                other_stmts.append(s)
        fn = ast.AsyncFunctionDef(
            name='__turtle_user_code__',
            args=ast.arguments(posonlyargs=[],args=[],vararg=None,
                               kwonlyargs=[],kw_defaults=[],kwarg=None,defaults=[]),
            body=other_stmts or [ast.Pass()],
            decorator_list=[],returns=None)
        ast.fix_missing_locations(fn)
        return ast.Module(body=star_imports + [fn], type_ignores=[])

try:
    __tree = ast.parse(__coder_user_code__, filename='simulation.py')
    __tree = _TurtleYielder().visit(__tree)
    ast.fix_missing_locations(__tree)
    __code_obj = compile(__tree, 'simulation.py', 'exec')
    __user_ns = {
        '__name__': '__main__',
        'asyncio': asyncio,
        '__turtle_delay__': __turtle_delay__,
    }
    exec(__code_obj, __user_ns)
    if '__turtle_user_code__' in __user_ns:
        js_set_main_thread_status('Turtle running...')
        await __user_ns['__turtle_user_code__']()
except SystemExit:
    pass
except Exception as __e:
    js_append_main_thread_log(f'[ERROR] {__e}')
    raise

if _global_screen._key_handlers and not js_should_stop_main_thread():
    js_set_main_thread_status('Turtle event loop running. Click Stop to exit.')
    while not js_should_stop_main_thread():
        __evts = js_turtle_poll_keys()
        if __evts is not None:
            for __k in list(__evts):
                __k_str = str(__k)
                __cb = _global_screen._key_handlers.get(__k_str)
                if __cb:
                    try:
                        __r = __cb()
                        if asyncio.iscoroutine(__r): await __r
                    except Exception as __ke:
                        js_append_main_thread_log(f'[Key callback error] {__ke}')
        await asyncio.sleep(0.016)
`

// ── Turtle SVG bootstrap (basthon-svg mode, main thread) ──────────────────

export const TURTLE_SVG_BOOTSTRAP = String.raw`
import builtins, math, sys, types as _types_mod

def __coder_prompt_input(prompt=""):
    return js_input_prompt(prompt)
builtins.input = __coder_prompt_input

_turtle_sw = 600; _turtle_sh = 600; _turtle_bg = 'white'
_turtle_elements = []

def _tx(x): return x + _turtle_sw / 2
def _ty(y): return _turtle_sh / 2 - y

def _safe(s):
    return str(s).replace('&','&amp;').replace('<','&lt;').replace('>','&gt;').replace('"','&quot;')

_COLOR_MAP = {
    'red':'#ff0000','green':'#008000','blue':'#0000ff','yellow':'#ffff00',
    'orange':'#ffa500','purple':'#800080','pink':'#ffc0cb','black':'#000000',
    'white':'#ffffff','gray':'#808080','grey':'#808080','brown':'#a52a2a',
    'cyan':'#00ffff','magenta':'#ff00ff','lime':'#00ff00','maroon':'#800000',
    'navy':'#000080','olive':'#808000','teal':'#008080','silver':'#c0c0c0',
    'gold':'#ffd700','violet':'#ee82ee','indigo':'#4b0082','turquoise':'#40e0d0',
    'coral':'#ff7f50','salmon':'#fa8072','dark red':'#8b0000','dark green':'#006400',
    'dark blue':'#00008b','light blue':'#add8e6','light green':'#90ee90',
}

def _pc(c):
    if c is None: return 'black'
    if isinstance(c,(list,tuple)) and len(c)==3:
        r,g,b=c
        if all(isinstance(v,float) and 0.0<=v<=1.0 for v in (r,g,b)):
            return f'rgb({int(r*255)},{int(g*255)},{int(b*255)})'
        return f'rgb({int(r)},{int(g)},{int(b)})'
    s=str(c).lower().strip()
    return _COLOR_MAP.get(s,s)

def _get_svg():
    w,h=_turtle_sw,_turtle_sh
    parts=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}">',
           f'<rect width="{w}" height="{h}" fill="{_turtle_bg}"/>']
    parts.extend(_turtle_elements)
    parts.append('</svg>')
    return ''.join(parts)

class _SvgScreen:
    def __init__(self): self._bgcolor='white'
    def setup(self,width=None,height=None,startx=None,starty=None):
        global _turtle_sw,_turtle_sh
        if width: _turtle_sw=int(width)
        if height: _turtle_sh=int(height)
    def screensize(self,canvwidth=None,canvheight=None,bg=None):
        global _turtle_sw,_turtle_sh
        if canvwidth: _turtle_sw=int(canvwidth)
        if canvheight: _turtle_sh=int(canvheight)
        if bg: self.bgcolor(bg)
    def bgcolor(self,color=None):
        global _turtle_bg
        if color: _turtle_bg=_pc(color)
        return _turtle_bg
    def title(self,s): pass
    def tracer(self,*a): pass
    def update(self): pass
    def listen(self): pass
    def onkeypress(self,f,k=None): pass
    def onkey(self,f,k=None): pass
    def onkeyrelease(self,f,k=None): pass
    def onclick(self,f,b=1,add=None): pass
    def mainloop(self): pass
    def done(self): pass
    def bye(self): pass
    def exitonclick(self): pass
    def numinput(self,t,p,d=None,mn=None,mx=None):
        try: return float(js_input_prompt(p))
        except: return d
    def textinput(self,t,p): return js_input_prompt(p)
    def window_width(self): return _turtle_sw
    def window_height(self): return _turtle_sh

class _SvgTurtle:
    def __init__(self):
        self._x=0.0;self._y=0.0;self._heading=0.0
        self._pen=True;self._pc2='black';self._fc='black'
        self._pw=1;self._visible=True;self._speed=6
        self._filling=False;self._fp=[]

    def _line(self,nx,ny):
        if self._pen:
            _turtle_elements.append(
                f'<line x1="{_tx(self._x):.1f}" y1="{_ty(self._y):.1f}" '
                f'x2="{_tx(nx):.1f}" y2="{_ty(ny):.1f}" '
                f'stroke="{_safe(self._pc2)}" stroke-width="{self._pw}" stroke-linecap="round"/>')
        if self._filling: self._fp.append((nx,ny))
        self._x=nx;self._y=ny

    def forward(self,d):
        rad=math.radians(self._heading)
        self._line(self._x+d*math.cos(rad),self._y+d*math.sin(rad))
    fd=forward
    def backward(self,d): self.forward(-d)
    bk=backward;back=backward
    def right(self,a): self._heading=(self._heading-a)%360
    rt=right
    def left(self,a): self._heading=(self._heading+a)%360
    lt=left
    def goto(self,x,y=None):
        if y is None and hasattr(x,'__iter__'): x,y=tuple(x)
        self._line(float(x),float(y))
    setpos=goto;setposition=goto
    def setx(self,x): self._line(x,self._y)
    def sety(self,y): self._line(self._x,y)
    def setheading(self,a): self._heading=float(a)%360
    seth=setheading
    def home(self): self._line(0.0,0.0);self._heading=0.0

    def circle(self,radius,extent=None,steps=None):
        if extent is None: extent=360
        if steps is None: steps=max(int(abs(radius)*abs(extent)/60),4)
        sa=extent/steps
        sl=2*math.pi*abs(radius)*abs(extent)/360/steps if steps>0 else 0
        sign=1 if radius>=0 else -1
        for _ in range(steps): self.forward(sl);self.left(sign*sa)

    def dot(self,size=None,color=None):
        if size is None: size=max(self._pw+4,self._pw*2)
        c=_pc(color) if color else self._pc2
        _turtle_elements.append(f'<circle cx="{_tx(self._x):.1f}" cy="{_ty(self._y):.1f}" r="{size/2:.1f}" fill="{_safe(c)}"/>')

    def stamp(self): return id(self)
    def clearstamp(self,s): pass
    def clearstamps(self,n=None): pass
    def penup(self): self._pen=False
    pu=penup;up=penup
    def pendown(self): self._pen=True
    pd=pendown;down=pendown
    def pensize(self,w=None):
        if w is not None: self._pw=max(1,int(w))
        return self._pw
    width=pensize
    def pencolor(self,*a):
        if a: self._pc2=_pc(a[0] if len(a)==1 else list(a))
        return self._pc2
    def fillcolor(self,*a):
        if a: self._fc=_pc(a[0] if len(a)==1 else list(a))
        return self._fc
    def color(self,*a):
        if len(a)==1: self._pc2=self._fc=_pc(a[0])
        elif len(a)==2: self._pc2=_pc(a[0]);self._fc=_pc(a[1])
        return self._pc2,self._fc
    def begin_fill(self): self._filling=True;self._fp=[(self._x,self._y)]
    def end_fill(self):
        if self._filling and len(self._fp)>=3:
            pts=' '.join(f'{_tx(x):.1f},{_ty(y):.1f}' for x,y in self._fp)
            _turtle_elements.append(f'<polygon points="{pts}" fill="{_safe(self._fc)}" stroke="none"/>')
        self._filling=False;self._fp=[]
    def clear(self):
        global _turtle_elements
        _turtle_elements=[]
        self._x=self._y=0.0;self._heading=0.0
    def reset(self):
        self.clear()
        self._pen=True;self._pc2='black';self._fc='black';self._pw=1
    def hideturtle(self): self._visible=False
    ht=hideturtle
    def showturtle(self): self._visible=True
    st=showturtle
    def isvisible(self): return self._visible
    def isdown(self): return self._pen
    def pos(self): return (self._x,self._y)
    position=pos
    def xcor(self): return self._x
    def ycor(self): return self._y
    def heading(self): return self._heading
    def towards(self,x,y=None):
        if y is None and hasattr(x,'__iter__'): x,y=tuple(x)
        return math.degrees(math.atan2(float(y)-self._y,float(x)-self._x))%360
    def distance(self,x,y=None):
        if y is None and hasattr(x,'__iter__'): x,y=tuple(x)
        return math.sqrt((float(x)-self._x)**2+(float(y)-self._y)**2)
    def speed(self,s=None):
        if s is not None: self._speed=s if s==0 else max(1,min(10,int(s)))
        return self._speed
    def shape(self,*a): return 'classic'
    def shapesize(self,*a): pass
    def resizemode(self,*a): pass
    def onclick(self,*a): pass
    def write(self,arg,move=False,align='left',font=('Arial',8,'normal')):
        fname=font[0] if isinstance(font,(list,tuple)) and len(font)>0 else 'Arial'
        fsize=font[1] if isinstance(font,(list,tuple)) and len(font)>1 else 8
        fstyle=font[2] if isinstance(font,(list,tuple)) and len(font)>2 else 'normal'
        fb='bold' if 'bold' in str(fstyle) else 'normal'
        _turtle_elements.append(
            f'<text x="{_tx(self._x):.1f}" y="{_ty(self._y):.1f}" '
            f'font-family="{_safe(fname)}" font-size="{fsize}" font-weight="{fb}" '
            f'fill="{_safe(self._pc2)}">{_safe(str(arg))}</text>')

_svg_screen=_SvgScreen()
_svg_turtle=_SvgTurtle()

_turtle_mod=_types_mod.ModuleType('turtle')
for _fn,_tgt in [
    ('forward',_svg_turtle.forward),('fd',_svg_turtle.fd),
    ('backward',_svg_turtle.backward),('bk',_svg_turtle.bk),
    ('back',_svg_turtle.back),('right',_svg_turtle.right),
    ('rt',_svg_turtle.rt),('left',_svg_turtle.left),
    ('lt',_svg_turtle.lt),('goto',_svg_turtle.goto),
    ('setpos',_svg_turtle.setpos),('setposition',_svg_turtle.setposition),
    ('setx',_svg_turtle.setx),('sety',_svg_turtle.sety),
    ('setheading',_svg_turtle.setheading),('seth',_svg_turtle.seth),
    ('home',_svg_turtle.home),('circle',_svg_turtle.circle),
    ('dot',_svg_turtle.dot),('stamp',_svg_turtle.stamp),
    ('penup',_svg_turtle.penup),('pu',_svg_turtle.pu),
    ('up',_svg_turtle.up),('pendown',_svg_turtle.pendown),
    ('pd',_svg_turtle.pd),('down',_svg_turtle.down),
    ('pensize',_svg_turtle.pensize),('width',_svg_turtle.width),
    ('pencolor',_svg_turtle.pencolor),('fillcolor',_svg_turtle.fillcolor),
    ('color',_svg_turtle.color),('begin_fill',_svg_turtle.begin_fill),
    ('end_fill',_svg_turtle.end_fill),('clear',_svg_turtle.clear),
    ('reset',_svg_turtle.reset),('hideturtle',_svg_turtle.hideturtle),
    ('ht',_svg_turtle.ht),('showturtle',_svg_turtle.showturtle),
    ('st',_svg_turtle.st),('isdown',_svg_turtle.isdown),
    ('isvisible',_svg_turtle.isvisible),('pos',_svg_turtle.pos),
    ('position',_svg_turtle.position),('xcor',_svg_turtle.xcor),
    ('ycor',_svg_turtle.ycor),('heading',_svg_turtle.heading),
    ('towards',_svg_turtle.towards),('distance',_svg_turtle.distance),
    ('speed',_svg_turtle.speed),('write',_svg_turtle.write),
    ('shape',_svg_turtle.shape),('shapesize',_svg_turtle.shapesize),
    ('setup',_svg_screen.setup),('screensize',_svg_screen.screensize),
    ('bgcolor',_svg_screen.bgcolor),('title',_svg_screen.title),
    ('tracer',_svg_screen.tracer),('update',_svg_screen.update),
    ('listen',_svg_screen.listen),('onkeypress',_svg_screen.onkeypress),
    ('onkey',_svg_screen.onkey),('mainloop',_svg_screen.mainloop),
    ('done',_svg_screen.done),('bye',_svg_screen.bye),
    ('exitonclick',_svg_screen.exitonclick),
    ('window_width',_svg_screen.window_width),
    ('window_height',_svg_screen.window_height),
    ('numinput',_svg_screen.numinput),('textinput',_svg_screen.textinput),
]: _turtle_mod.__dict__[_fn]=_tgt
_turtle_mod.__dict__['Turtle']=_SvgTurtle
_turtle_mod.__dict__['Pen']=_SvgTurtle
_turtle_mod.__dict__['Screen']=lambda: _svg_screen
sys.modules['turtle']=_turtle_mod

try:
    __code_obj = compile(__coder_user_code__, 'simulation.py', 'exec')
    exec(__code_obj, {'__name__': '__main__', 'js_input_prompt': js_input_prompt})
except SystemExit:
    pass
except Exception as __e:
    js_append_main_thread_log(f'[ERROR] {__e}')
    raise

js_turtle_update_svg(_get_svg())
`

// ── SVG turtle Python setup for trace worker ──────────────────────────────

export const SVG_TURTLE_WORKER_SETUP = String.raw`
import math as _math, sys as _sys, types as _types_mod

_turtle_sw = 600; _turtle_sh = 600; _turtle_bg = 'white'
_turtle_elements = []
__turtle_svg__ = ''

def _tx(x): return x + _turtle_sw / 2
def _ty(y): return _turtle_sh / 2 - y

def _safe(s):
    return str(s).replace('&','&amp;').replace('<','&lt;').replace('>','&gt;').replace('"','&quot;')

_CMAP = {
    'red':'#ff0000','green':'#008000','blue':'#0000ff','yellow':'#ffff00',
    'orange':'#ffa500','purple':'#800080','pink':'#ffc0cb','black':'#000000',
    'white':'#ffffff','gray':'#808080','grey':'#808080','brown':'#a52a2a',
    'cyan':'#00ffff','magenta':'#ff00ff','lime':'#00ff00','maroon':'#800000',
    'navy':'#000080','olive':'#808000','teal':'#008080','silver':'#c0c0c0',
    'gold':'#ffd700','violet':'#ee82ee','indigo':'#4b0082','turquoise':'#40e0d0',
    'coral':'#ff7f50','salmon':'#fa8072','dark red':'#8b0000','dark green':'#006400',
    'dark blue':'#00008b','light blue':'#add8e6','light green':'#90ee90',
}
def _pc(c):
    if c is None: return 'black'
    if isinstance(c,(list,tuple)) and len(c)==3:
        r,g,b=c
        if all(isinstance(v,float) and 0.0<=v<=1.0 for v in (r,g,b)):
            return f'rgb({int(r*255)},{int(g*255)},{int(b*255)})'
        return f'rgb({int(r)},{int(g)},{int(b)})'
    s=str(c).lower().strip(); return _CMAP.get(s,s)

def _refresh_svg():
    global __turtle_svg__
    w,h=_turtle_sw,_turtle_sh
    parts=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}">',
           f'<rect width="{w}" height="{h}" fill="{_turtle_bg}"/>']
    parts.extend(_turtle_elements); parts.append('</svg>')
    __turtle_svg__=''.join(parts)

class _WScreen:
    def __init__(self): self._bgcolor='white'
    def setup(self,width=None,height=None,startx=None,starty=None):
        global _turtle_sw,_turtle_sh
        if width: _turtle_sw=int(width)
        if height: _turtle_sh=int(height)
    def screensize(self,canvwidth=None,canvheight=None,bg=None):
        global _turtle_sw,_turtle_sh
        if canvwidth: _turtle_sw=int(canvwidth)
        if canvheight: _turtle_sh=int(canvheight)
        if bg: self.bgcolor(bg)
    def bgcolor(self,color=None):
        global _turtle_bg
        if color: _turtle_bg=_pc(color); _refresh_svg()
        return _turtle_bg
    def title(self,s): pass
    def tracer(self,*a): pass
    def update(self): pass
    def listen(self): pass
    def onkeypress(self,f,k=None): pass
    def onkey(self,f,k=None): pass
    def onkeyrelease(self,f,k=None): pass
    def onclick(self,f,b=1,add=None): pass
    def mainloop(self): pass
    def done(self): pass
    def bye(self): pass
    def exitonclick(self): pass
    def numinput(self,t,p,d=None,mn=None,mx=None): return d
    def textinput(self,t,p): return ''
    def window_width(self): return _turtle_sw
    def window_height(self): return _turtle_sh

class _WTurtle:
    def __init__(self):
        self._x=0.0;self._y=0.0;self._heading=0.0
        self._pen=True;self._pc2='black';self._fc='black'
        self._pw=1;self._visible=True;self._speed=6
        self._filling=False;self._fp=[]
    def _line(self,nx,ny):
        if self._pen:
            _turtle_elements.append(
                f'<line x1="{_tx(self._x):.1f}" y1="{_ty(self._y):.1f}" '
                f'x2="{_tx(nx):.1f}" y2="{_ty(ny):.1f}" '
                f'stroke="{_safe(self._pc2)}" stroke-width="{self._pw}" stroke-linecap="round"/>')
        if self._filling: self._fp.append((nx,ny))
        self._x=nx;self._y=ny; _refresh_svg()
    def forward(self,d):
        rad=_math.radians(self._heading)
        self._line(self._x+d*_math.cos(rad),self._y+d*_math.sin(rad))
    fd=forward
    def backward(self,d): self.forward(-d)
    bk=backward;back=backward
    def right(self,a): self._heading=(self._heading-a)%360
    rt=right
    def left(self,a): self._heading=(self._heading+a)%360
    lt=left
    def goto(self,x,y=None):
        if y is None and hasattr(x,'__iter__'): x,y=tuple(x)
        self._line(float(x),float(y))
    setpos=goto;setposition=goto
    def setx(self,x): self._line(x,self._y)
    def sety(self,y): self._line(self._x,y)
    def setheading(self,a): self._heading=float(a)%360
    seth=setheading
    def home(self): self._line(0.0,0.0);self._heading=0.0
    def circle(self,radius,extent=None,steps=None):
        if extent is None: extent=360
        if steps is None: steps=max(int(abs(radius)*abs(extent)/60),4)
        sa=extent/steps
        sl=2*_math.pi*abs(radius)*abs(extent)/360/steps if steps>0 else 0
        sign=1 if radius>=0 else -1
        for _ in range(steps): self.forward(sl);self.left(sign*sa)
    def dot(self,size=None,color=None):
        if size is None: size=max(self._pw+4,self._pw*2)
        c=_pc(color) if color else self._pc2
        _turtle_elements.append(f'<circle cx="{_tx(self._x):.1f}" cy="{_ty(self._y):.1f}" r="{size/2:.1f}" fill="{_safe(c)}"/>')
        _refresh_svg()
    def stamp(self): return id(self)
    def clearstamp(self,s): pass
    def clearstamps(self,n=None): pass
    def penup(self): self._pen=False
    pu=penup;up=penup
    def pendown(self): self._pen=True
    pd=pendown;down=pendown
    def pensize(self,w=None):
        if w is not None: self._pw=max(1,int(w))
        return self._pw
    width=pensize
    def pencolor(self,*a):
        if a: self._pc2=_pc(a[0] if len(a)==1 else list(a))
        return self._pc2
    def fillcolor(self,*a):
        if a: self._fc=_pc(a[0] if len(a)==1 else list(a))
        return self._fc
    def color(self,*a):
        if len(a)==1: self._pc2=self._fc=_pc(a[0])
        elif len(a)==2: self._pc2=_pc(a[0]);self._fc=_pc(a[1])
        return self._pc2,self._fc
    def begin_fill(self): self._filling=True;self._fp=[(self._x,self._y)]
    def end_fill(self):
        if self._filling and len(self._fp)>=3:
            pts=' '.join(f'{_tx(x):.1f},{_ty(y):.1f}' for x,y in self._fp)
            _turtle_elements.append(f'<polygon points="{pts}" fill="{_safe(self._fc)}" stroke="none"/>')
        self._filling=False;self._fp=[]; _refresh_svg()
    def clear(self):
        global _turtle_elements
        _turtle_elements=[]
        self._x=self._y=0.0;self._heading=0.0; _refresh_svg()
    def reset(self):
        self.clear()
        self._pen=True;self._pc2='black';self._fc='black';self._pw=1
    def hideturtle(self): self._visible=False
    ht=hideturtle
    def showturtle(self): self._visible=True
    st=showturtle
    def isvisible(self): return self._visible
    def isdown(self): return self._pen
    def pos(self): return (self._x,self._y)
    position=pos
    def xcor(self): return self._x
    def ycor(self): return self._y
    def heading(self): return self._heading
    def towards(self,x,y=None):
        if y is None and hasattr(x,'__iter__'): x,y=tuple(x)
        return _math.degrees(_math.atan2(float(y)-self._y,float(x)-self._x))%360
    def distance(self,x,y=None):
        if y is None and hasattr(x,'__iter__'): x,y=tuple(x)
        return _math.sqrt((float(x)-self._x)**2+(float(y)-self._y)**2)
    def speed(self,s=None):
        if s is not None: self._speed=s if s==0 else max(1,min(10,int(s)))
        return self._speed
    def shape(self,*a): return 'classic'
    def shapesize(self,*a): pass
    def resizemode(self,*a): pass
    def onclick(self,*a): pass
    def write(self,arg,move=False,align='left',font=('Arial',8,'normal')):
        fname=font[0] if isinstance(font,(list,tuple)) and len(font)>0 else 'Arial'
        fsize=font[1] if isinstance(font,(list,tuple)) and len(font)>1 else 8
        fstyle=font[2] if isinstance(font,(list,tuple)) and len(font)>2 else 'normal'
        fb='bold' if 'bold' in str(fstyle) else 'normal'
        _turtle_elements.append(
            f'<text x="{_tx(self._x):.1f}" y="{_ty(self._y):.1f}" '
            f'font-family="{_safe(fname)}" font-size="{fsize}" font-weight="{fb}" '
            f'fill="{_safe(self._pc2)}">{_safe(str(arg))}</text>')
        _refresh_svg()

_wscreen=_WScreen()
_wturtle=_WTurtle()
_refresh_svg()

_turtle_mod=_types_mod.ModuleType('turtle')
for _fn,_tgt in [
    ('forward',_wturtle.forward),('fd',_wturtle.fd),
    ('backward',_wturtle.backward),('bk',_wturtle.bk),
    ('back',_wturtle.back),('right',_wturtle.right),
    ('rt',_wturtle.rt),('left',_wturtle.left),
    ('lt',_wturtle.lt),('goto',_wturtle.goto),
    ('setpos',_wturtle.setpos),('setposition',_wturtle.setposition),
    ('setx',_wturtle.setx),('sety',_wturtle.sety),
    ('setheading',_wturtle.setheading),('seth',_wturtle.seth),
    ('home',_wturtle.home),('circle',_wturtle.circle),
    ('dot',_wturtle.dot),('stamp',_wturtle.stamp),
    ('penup',_wturtle.penup),('pu',_wturtle.pu),
    ('up',_wturtle.up),('pendown',_wturtle.pendown),
    ('pd',_wturtle.pd),('down',_wturtle.down),
    ('pensize',_wturtle.pensize),('width',_wturtle.width),
    ('pencolor',_wturtle.pencolor),('fillcolor',_wturtle.fillcolor),
    ('color',_wturtle.color),('begin_fill',_wturtle.begin_fill),
    ('end_fill',_wturtle.end_fill),('clear',_wturtle.clear),
    ('reset',_wturtle.reset),('hideturtle',_wturtle.hideturtle),
    ('ht',_wturtle.ht),('showturtle',_wturtle.showturtle),
    ('st',_wturtle.st),('isdown',_wturtle.isdown),
    ('isvisible',_wturtle.isvisible),('pos',_wturtle.pos),
    ('position',_wturtle.position),('xcor',_wturtle.xcor),
    ('ycor',_wturtle.ycor),('heading',_wturtle.heading),
    ('towards',_wturtle.towards),('distance',_wturtle.distance),
    ('speed',_wturtle.speed),('write',_wturtle.write),
    ('shape',_wturtle.shape),('shapesize',_wturtle.shapesize),
    ('setup',_wscreen.setup),('screensize',_wscreen.screensize),
    ('bgcolor',_wscreen.bgcolor),('title',_wscreen.title),
    ('tracer',_wscreen.tracer),('update',_wscreen.update),
    ('listen',_wscreen.listen),('onkeypress',_wscreen.onkeypress),
    ('onkey',_wscreen.onkey),('mainloop',_wscreen.mainloop),
    ('done',_wscreen.done),('bye',_wscreen.bye),
    ('exitonclick',_wscreen.exitonclick),
    ('window_width',_wscreen.window_width),
    ('window_height',_wscreen.window_height),
    ('numinput',_wscreen.numinput),('textinput',_wscreen.textinput),
]: _turtle_mod.__dict__[_fn]=_tgt
_turtle_mod.__dict__['Turtle']=_WTurtle
_turtle_mod.__dict__['Pen']=_WTurtle
_turtle_mod.__dict__['Screen']=lambda: _wscreen
_sys.modules['turtle']=_turtle_mod
_refresh_svg()
`
