"""p5 for Coder: Processing-style sketches in Python, drawn in the browser.

A sketch defines `setup()` (run once) and `draw()` (run every frame), and
calls `run()` — or simply ends, and Coder starts it, as pyp5js does:

    from p5 import *

    def setup():
        size(400, 400)

    def draw():
        background(220)
        circle(mouse_x, mouse_y, 50)

    run()

Both spellings of the API work: Raspberry Pi / p5py's snake_case (`mouse_x`,
`stroke_weight`, `no_fill`) and p5.js's camelCase (`mouseX`, `strokeWeight`,
`noFill`).

How it is drawn: every call is turned into a small drawing operation, a
frame's operations go to the page in one batch, and the page replays them onto
an HTML canvas (src/utils/p5Draw.ts). The canvas is a widget of Coder's own
tkinter, so a sketch runs wherever a tkinter program does — in the trace worker
(Run, Debug and Trace all work), or on the main thread — and its frames are
paced by tkinter's timers, its mouse and keys come through tkinter's events,
and Stop and the window's close button work as they do for any window.

Without a page (the tester worker, or native Python in the test suite) nothing
is drawn: `run()` calls setup() and then draw() a set number of times, and the
operations are kept, so the tester can draw them and compare the picture with
the one the solution draws (`_coder_capture`).
"""

import sys as _sys
import os as _os
import math as _math
import random as _random_module
import time as _time
import json as _json
import base64 as _base64
import builtins as _builtins
import datetime as _datetime

import tkinter as _tk
from tkinter._colors import COLORS as _TK_COLORS

__version__ = '1.0-coder'

_P5_DIR = _os.path.dirname(_os.path.abspath(__file__))

# ── Constants ───────────────────────────────────────────────────────────────

PI = _math.pi
HALF_PI = _math.pi / 2
QUARTER_PI = _math.pi / 4
TWO_PI = _math.pi * 2
TAU = TWO_PI

RGB = 'rgb'
HSB = 'hsb'
HSL = 'hsl'

CORNER = 'corner'
CORNERS = 'corners'
CENTER = 'center'
RADIUS = 'radius'

LEFT = 'left'
RIGHT = 'right'
TOP = 'top'
BOTTOM = 'bottom'
BASELINE = 'alphabetic'

OPEN = 'open'
CHORD = 'chord'
PIE = 'pie'
CLOSE = 'close'

ROUND = 'round'
SQUARE = 'butt'
PROJECT = 'square'
MITER = 'miter'
BEVEL = 'bevel'

DEGREES = 'degrees'
RADIANS = 'radians'

NORMAL = 'normal'
ITALIC = 'italic'
BOLD = 'bold'
BOLDITALIC = 'bold italic'

POINTS = 'points'
LINES = 'lines'
TRIANGLES = 'triangles'
TRIANGLE_FAN = 'triangle_fan'
TRIANGLE_STRIP = 'triangle_strip'
QUADS = 'quads'
QUAD_STRIP = 'quad_strip'

ARROW = 'default'
CROSS = 'crosshair'
HAND = 'pointer'
MOVE = 'move'
TEXT = 'text'
WAIT = 'wait'

BACKSPACE = 8
TAB = 9
ENTER = 13
RETURN = 13
SHIFT = 16
CONTROL = 17
OPTION = 18
ALT = 18
ESCAPE = 27
DELETE = 46
LEFT_ARROW = 37
UP_ARROW = 38
RIGHT_ARROW = 39
DOWN_ARROW = 40

# ── What the sketch can read ────────────────────────────────────────────────
#
# These are variables in p5, not functions, so they are copied into the
# sketch's own namespace before setup(), every draw() and every event (see
# _publish): `from p5 import *` gave the program its own copies.

width = 100
height = 100
frame_count = frameCount = 0
mouse_x = mouseX = 0
mouse_y = mouseY = 0
pmouse_x = pmouseX = 0
pmouse_y = pmouseY = 0
mouse_is_pressed = mouseIsPressed = False
mouse_button = mouseButton = LEFT
key = ''
key_code = keyCode = 0
key_is_pressed = keyIsPressed = False
delta_time = deltaTime = 0
focused = True

_PUBLIC_VARS = (
    ('width', 'width'), ('height', 'height'), ('frame_count', 'frameCount'),
    ('mouse_x', 'mouseX'), ('mouse_y', 'mouseY'), ('pmouse_x', 'pmouseX'), ('pmouse_y', 'pmouseY'),
    ('mouse_is_pressed', 'mouseIsPressed'), ('mouse_button', 'mouseButton'),
    ('key', 'key'), ('key_code', 'keyCode'), ('key_is_pressed', 'keyIsPressed'),
    ('delta_time', 'deltaTime'), ('focused', 'focused'),
)

# The functions a sketch may define, in both spellings.
_CALLBACKS = (
    ('setup', 'setup'), ('draw', 'draw'),
    ('mouse_pressed', 'mousePressed'), ('mouse_released', 'mouseReleased'),
    ('mouse_clicked', 'mouseClicked'), ('double_clicked', 'doubleClicked'),
    ('mouse_moved', 'mouseMoved'), ('mouse_dragged', 'mouseDragged'),
    ('mouse_wheel', 'mouseWheel'),
    ('key_pressed', 'keyPressed'), ('key_released', 'keyReleased'), ('key_typed', 'keyTyped'),
)
_EVENT_CALLBACKS = tuple(name for name, _ in _CALLBACKS if name not in ('setup', 'draw'))


# ── The sketch's state ──────────────────────────────────────────────────────

def _default_style():
    return {
        'fill': (255.0, 255.0, 255.0, 255.0),
        'stroke': (0.0, 0.0, 0.0, 255.0),
        'stroke_set': False,
        'weight': 1.0,
        'cap': ROUND,
        'join': MITER,
        'rect_mode': CORNER,
        'ellipse_mode': CENTER,
        'image_mode': CORNER,
        'color_mode': RGB,
        'maxes': {RGB: [255.0, 255.0, 255.0, 255.0], HSB: [360.0, 100.0, 100.0, 1.0], HSL: [360.0, 100.0, 100.0, 1.0]},
        'text_size': 12.0,
        'text_leading': None,
        'text_font': 'sans-serif',
        'text_style': NORMAL,
        'align_x': LEFT,
        'align_y': BASELINE,
    }


def _copy_style(style):
    out = dict(style)
    out['maxes'] = {k: list(v) for k, v in style['maxes'].items()}
    return out


class _Sketch:
    def __init__(self):
        self.width = 100
        self.height = 100
        self.frame_count = 0
        self.mouse_x = 0
        self.mouse_y = 0
        self.pmouse_x = 0
        self.pmouse_y = 0
        self.frame_mouse = (0, 0)
        self.mouse_is_pressed = False
        self.mouse_button = LEFT
        self.key = ''
        self.key_code = 0
        self.key_is_pressed = False
        self.keys_down = set()
        self.delta_time = 0
        self.focused = True
        self.target_fps = 60.0
        self.measured_fps = 0.0
        self.last_frame_start = None
        self.looping = True
        self.redraw_pending = False
        self.started = False
        self.touched = False
        self.headless = False
        self.ns = None
        self.callbacks = {}
        self.published = {}
        self.root = None
        self.canvas = None
        self.timer = None
        self.bound = False
        self.in_loop = False
        self.error = None
        self.stopped = False
        self.ops = []
        self.sent = {}
        self.capture = []
        self.capture_cut = None
        self.matrix = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
        self.stack = []
        self.style = _default_style()
        self.angle_mode = RADIANS
        self.shape = None
        self.images = {}
        self.images_sent = set()
        self.cursor = None
        self.start_time = _time.monotonic()
        self.rng = _random_module.Random()
        self.noise_rng = _random_module.Random()
        self.perlin = None
        self.noise_octaves = 4
        self.noise_falloff = 0.5
        self.test_frames = 1


_s = _Sketch()
# What `from p5 import *` hands the program: a name still holding this is
# p5's to update (see _publish).
_s.published = {name: globals()[name] for pair in _PUBLIC_VARS for name in pair}


def _ensure_touched():
    _s.touched = True


# ── Numbers ─────────────────────────────────────────────────────────────────

class _NotANumber(Exception):
    pass


def _f(value, what='value'):
    """A number from whatever the program passed (int, float, bool, numpy...)."""
    try:
        return float(value)
    except (TypeError, ValueError):
        raise TypeError('%s must be a number, not %s' % (what, type(value).__name__)) from None


def _n(value):
    """A number as it goes to the page: three decimals, no 12.0 where 12 will do."""
    v = float(value)
    if v != v or v in (float('inf'), float('-inf')):
        raise _NotANumber()
    r = round(v, 3)
    if r == int(r) and abs(r) < 1e15:
        return int(r)
    return r


def _angle(value):
    v = _f(value, 'angle')
    return _math.radians(v) if _s.angle_mode == DEGREES else v


def _from_radians(value):
    return _math.degrees(value) if _s.angle_mode == DEGREES else value


# ── Colour ──────────────────────────────────────────────────────────────────

_EXTRA_COLORS = {'rebeccapurple': '#663399', 'transparent': '#00000000'}


def _hsb_to_rgb(h, s, v):
    h = (h % 360.0) / 60.0
    c = v * s
    x = c * (1 - abs(h % 2 - 1))
    m = v - c
    i = int(h) % 6
    r, g, b = ((c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x))[i]
    return (r + m) * 255.0, (g + m) * 255.0, (b + m) * 255.0


def _hsl_to_rgb(h, s, l):
    c = (1 - abs(2 * l - 1)) * s
    h = (h % 360.0) / 60.0
    x = c * (1 - abs(h % 2 - 1))
    m = l - c / 2
    i = int(h) % 6
    r, g, b = ((c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x))[i]
    return (r + m) * 255.0, (g + m) * 255.0, (b + m) * 255.0


def _rgb_to_hsb(r, g, b):
    r, g, b = r / 255.0, g / 255.0, b / 255.0
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    if d == 0:
        h = 0.0
    elif mx == r:
        h = 60 * (((g - b) / d) % 6)
    elif mx == g:
        h = 60 * ((b - r) / d + 2)
    else:
        h = 60 * ((r - g) / d + 4)
    s = 0.0 if mx == 0 else d / mx
    return h, s, mx


def _rgb_to_hsl(r, g, b):
    r, g, b = r / 255.0, g / 255.0, b / 255.0
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    l = (mx + mn) / 2
    h = _rgb_to_hsb(r * 255, g * 255, b * 255)[0]
    s = 0.0 if d == 0 else d / (1 - abs(2 * l - 1))
    return h, s, l


def _parse_css_color(text):
    raw = str(text).strip()
    s = raw.lower().replace(' ', '')
    if s.startswith('#'):
        digits = s[1:]
        try:
            if len(digits) in (3, 4):
                vals = [int(ch * 2, 16) for ch in digits]
            elif len(digits) in (6, 8):
                vals = [int(digits[i:i + 2], 16) for i in range(0, len(digits), 2)]
            else:
                raise ValueError
        except ValueError:
            raise ValueError('"%s" is not a colour: a hex colour is #rgb, #rrggbb or #rrggbbaa' % raw) from None
        if len(vals) == 3:
            vals.append(255)
        return tuple(float(v) for v in vals)
    for prefix in ('rgba(', 'rgb('):
        if s.startswith(prefix) and s.endswith(')'):
            parts = s[len(prefix):-1].split(',')
            if len(parts) not in (3, 4):
                break
            try:
                rgb = [float(p[:-1]) * 2.55 if p.endswith('%') else float(p) for p in parts[:3]]
                a = 255.0
                if len(parts) == 4:
                    pa = parts[3]
                    a = float(pa[:-1]) * 2.55 if pa.endswith('%') else float(pa) * 255.0
            except ValueError:
                break
            return (rgb[0], rgb[1], rgb[2], a)
    for prefix, conv in (('hsla(', _hsl_to_rgb), ('hsl(', _hsl_to_rgb), ('hsba(', _hsb_to_rgb), ('hsb(', _hsb_to_rgb)):
        if s.startswith(prefix) and s.endswith(')'):
            parts = s[len(prefix):-1].split(',')
            if len(parts) not in (3, 4):
                break
            try:
                h = float(parts[0])
                sat = float(parts[1].rstrip('%')) / 100.0
                lum = float(parts[2].rstrip('%')) / 100.0
                a = float(parts[3]) * 255.0 if len(parts) == 4 else 255.0
            except ValueError:
                break
            r, g, b = conv(h, sat, lum)
            return (r, g, b, a)
    named = _EXTRA_COLORS.get(s) or _TK_COLORS.get(s)
    if named:
        return _parse_css_color(named)
    raise ValueError('"%s" is not a colour name p5 knows' % raw)


class Color:
    """A colour, as color() makes it. Its channels are kept 0-255, as RGBA."""

    def __init__(self, r=0, g=0, b=0, a=255):
        self._rgba = (float(r), float(g), float(b), float(a))

    def __repr__(self):
        r, g, b, a = (round(v, 2) for v in self._rgba)
        return 'Color(%s, %s, %s, %s)' % tuple(int(v) if v == int(v) else v for v in (r, g, b, a))

    def __eq__(self, other):
        return isinstance(other, Color) and all(abs(x - y) < 1e-6 for x, y in zip(self._rgba, other._rgba))

    def __hash__(self):
        return hash(tuple(round(v, 4) for v in self._rgba))

    def __iter__(self):
        return iter(self._rgba)

    def _css(self):
        return _css(self._rgba)

    def __str__(self):
        return self._css()

    @property
    def red(self):
        return self._rgba[0]

    @property
    def green(self):
        return self._rgba[1]

    @property
    def blue(self):
        return self._rgba[2]

    @property
    def alpha(self):
        return self._rgba[3]

    @property
    def hue(self):
        return _rgb_to_hsb(*self._rgba[:3])[0]

    @property
    def saturation(self):
        return _rgb_to_hsb(*self._rgba[:3])[1] * 100.0

    @property
    def brightness(self):
        return _rgb_to_hsb(*self._rgba[:3])[2] * 100.0

    @property
    def lightness(self):
        return _rgb_to_hsl(*self._rgba[:3])[2] * 100.0

    def set_alpha(self, a):
        maxes = _s.style['maxes'][_s.style['color_mode']]
        self._rgba = self._rgba[:3] + (_clamp255(_f(a) / maxes[3] * 255.0),)

    setAlpha = set_alpha

    def set_red(self, v):
        self._rgba = (_clamp255(_f(v)),) + self._rgba[1:]

    def set_green(self, v):
        self._rgba = (self._rgba[0], _clamp255(_f(v))) + self._rgba[2:]

    def set_blue(self, v):
        self._rgba = self._rgba[:2] + (_clamp255(_f(v)), self._rgba[3])

    setRed = set_red
    setGreen = set_green
    setBlue = set_blue


def _clamp255(v):
    return 0.0 if v < 0 else 255.0 if v > 255 else v


def _css(rgba):
    r, g, b, a = rgba
    r, g, b = (int(round(_clamp255(v))) for v in (r, g, b))
    a = _clamp255(a)
    if a >= 255:
        return 'rgb(%d,%d,%d)' % (r, g, b)
    return 'rgba(%d,%d,%d,%s)' % (r, g, b, _n(a / 255.0))


def _to_color(args, what='colour'):
    """Whatever fill(), stroke(), background() or color() were given, as RGBA 0-255."""
    if len(args) == 1 and isinstance(args[0], (list, tuple)) and not isinstance(args[0], Color):
        args = tuple(args[0])
    if not args:
        raise TypeError('%s needs a colour: a grey level, r, g, b, a colour name or a color()' % what)
    style = _s.style
    mode = style['color_mode']
    maxes = style['maxes'][mode]
    first = args[0]
    if isinstance(first, (Color, str)):
        if len(args) > 2:
            raise TypeError('%s was given a colour and %d more values' % (what, len(args) - 1))
        rgba = first._rgba if isinstance(first, Color) else _parse_css_color(first)
        if len(args) == 2:
            rgba = rgba[:3] + (_clamp255(_f(args[1], 'alpha') / maxes[3] * 255.0),)
        return rgba
    vals = [_f(v, 'a colour value') for v in args]
    if len(vals) in (1, 2):
        grey = _clamp255(vals[0] / maxes[2] * 255.0)
        a = _clamp255(vals[1] / maxes[3] * 255.0) if len(vals) == 2 else 255.0
        return (grey, grey, grey, a)
    if len(vals) not in (3, 4):
        raise TypeError('%s takes 1 to 4 numbers, not %d' % (what, len(vals)))
    a = _clamp255(vals[3] / maxes[3] * 255.0) if len(vals) == 4 else 255.0
    c1, c2, c3 = (min(max(v / m, 0.0), 1.0) for v, m in zip(vals[:3], maxes[:3]))
    if mode == RGB:
        return (c1 * 255.0, c2 * 255.0, c3 * 255.0, a)
    if mode == HSB:
        r, g, b = _hsb_to_rgb(c1 * 360.0, c2, c3)
    else:
        r, g, b = _hsl_to_rgb(c1 * 360.0, c2, c3)
    return (r, g, b, a)


def color(*args):
    """A colour to keep in a variable: color(255, 0, 0), color('orange'), color(128)."""
    return Color(*_to_color(args, 'color()'))


def color_mode(mode, *max_values):
    """RGB (the default), HSB or HSL, with optional maximums: color_mode(HSB, 360, 100, 100)."""
    mode = str(mode).lower()
    if mode not in (RGB, HSB, HSL):
        raise ValueError('color_mode() takes RGB, HSB or HSL')
    style = _s.style
    style['color_mode'] = mode
    maxes = style['maxes'][mode]
    if len(max_values) == 1:
        m = _f(max_values[0])
        style['maxes'][mode] = [m, m, m, m]
    elif len(max_values) in (3, 4):
        vals = [_f(v) for v in max_values]
        style['maxes'][mode] = vals + ([maxes[3]] if len(vals) == 3 else [])
    elif max_values:
        raise TypeError('color_mode() takes a mode and 1, 3 or 4 maximums')


def lerp_color(c1, c2, amt):
    a = c1._rgba if isinstance(c1, Color) else _to_color((c1,))
    b = c2._rgba if isinstance(c2, Color) else _to_color((c2,))
    t = min(max(_f(amt), 0.0), 1.0)
    return Color(*(x + (y - x) * t for x, y in zip(a, b)))


def _color_arg(c):
    return c._rgba if isinstance(c, Color) else _to_color((c,))


def red(c):
    return _color_arg(c)[0] / 255.0 * _s.style['maxes'][RGB][0]


def green(c):
    return _color_arg(c)[1] / 255.0 * _s.style['maxes'][RGB][1]


def blue(c):
    return _color_arg(c)[2] / 255.0 * _s.style['maxes'][RGB][2]


def alpha(c):
    return _color_arg(c)[3] / 255.0 * _s.style['maxes'][_s.style['color_mode']][3]


def hue(c):
    rgba = _color_arg(c)
    mode = _s.style['color_mode'] if _s.style['color_mode'] != RGB else HSB
    return _rgb_to_hsb(*rgba[:3])[0] / 360.0 * _s.style['maxes'][mode][0]


def saturation(c):
    rgba = _color_arg(c)
    mode = _s.style['color_mode']
    if mode == HSL:
        return _rgb_to_hsl(*rgba[:3])[1] * _s.style['maxes'][HSL][1]
    return _rgb_to_hsb(*rgba[:3])[1] * _s.style['maxes'][HSB][1]


def brightness(c):
    return _rgb_to_hsb(*_color_arg(c)[:3])[2] * _s.style['maxes'][HSB][2]


def lightness(c):
    return _rgb_to_hsl(*_color_arg(c)[:3])[2] * _s.style['maxes'][HSL][2]


# ── Sending drawing to the page ─────────────────────────────────────────────

def _op(*args):
    _s.ops.append(list(args))


def _sync(key, value, *op):
    if _s.sent.get(key) != value:
        _s.sent[key] = value
        _s.ops.append(list(op) if op else [key, value])


def _sync_transform():
    m = _s.matrix
    tf = (_n(m[0]), _n(m[1]), _n(m[2]), _n(m[3]), _n(m[4]), _n(m[5]))
    _sync('tf', tf, 'tf', *tf)


def _sync_fill():
    fill = _s.style['fill']
    _sync('fs', _css(fill) if fill is not None else 0)


def _sync_stroke():
    style = _s.style
    stroke = style['stroke']
    css = _css(stroke) if stroke is not None else 0
    _sync('ss', css)
    if css:
        _sync('lw', _n(style['weight']))
        _sync('cap', style['cap'])
        _sync('join', style['join'])


def _paint(fill=True, stroke=True):
    """Bring the page's drawing state up to date before a shape: only what changed is sent."""
    _s.touched = True
    _sync_transform()
    if fill:
        _sync_fill()
    if stroke:
        _sync_stroke()


def _visible(fill=True, stroke=True):
    style = _s.style
    return (fill and style['fill'] is not None) or (stroke and style['stroke'] is not None)


def _cut_capture():
    """The canvas has been wiped: what came before it cannot show, so a test capture drops it."""
    if _s.headless:
        _s.capture = []
        _s.capture_cut = len(_s.ops)
        _s.sent = {}


def _end_frame():
    """Send what the frame drew (or keep it, with no page)."""
    ops, _s.ops = _s.ops, []
    if _s.headless:
        cut = _s.capture_cut
        _s.capture_cut = None
        if cut is not None:
            ops = ops[cut:]
        _s.capture.extend(ops)
        return
    canvas = _s.canvas
    if ops and canvas is not None and not canvas._destroyed:
        _tk._app.op('ctx2d', canvas._id, ops)


def _coder_flush_partial():
    """Send the frame drawn so far: the debugger is about to pause mid-draw()."""
    if _s.started and not _s.headless and _s.ops:
        _end_frame()


# ── The canvas and its window ───────────────────────────────────────────────

class _SketchCanvas(_tk.Widget):
    """The sketch's canvas: an HTML <canvas> in a tkinter window (see utils/p5Draw.ts)."""
    _spec = {'cursor': '', 'takefocus': 0}
    _kind = 'canvas2d'
    _class = 'P5Canvas'

    def _props(self):
        return {'width': _s.width, 'height': _s.height, 'cursor': _s.cursor or ''}


def _make_window():
    if _tk._default_root is not None and not _tk._default_root._destroyed:
        root = _tk.Toplevel()
    else:
        root = _tk.Tk()
    root.title('p5 sketch')
    root.resizable(False, False)
    canvas = _SketchCanvas(root)
    canvas.pack()
    _s.root = root
    _s.canvas = canvas


# ── Canvas size ─────────────────────────────────────────────────────────────

def size(w, h=None):
    """Make the canvas w pixels wide and h high (it starts at 100 by 100). This clears it."""
    w = _f(w, 'width')
    h = w if h is None else _f(h, 'height')
    w = int(min(max(round(w), 1), 4000))
    h = int(min(max(round(h), 1), 4000))
    _s.width, _s.height = w, h
    _s.touched = True
    _s.sent = {}
    _op('size', w, h)
    _cut_capture()
    if _s.canvas is not None:
        _s.canvas._changed()
    _publish()


def create_canvas(w, h=None, renderer=None):
    size(w, h)


def resize_canvas(w, h=None):
    size(w, h)


# ── Setting the style ───────────────────────────────────────────────────────

def background(*args):
    """Paint the whole canvas: background(220), background(0, 100, 200), background('skyblue')."""
    if len(args) == 1 and isinstance(args[0], Image):
        image(args[0], 0, 0, _s.width, _s.height)
        return
    rgba = _to_color(args, 'background()')
    _s.touched = True
    if rgba[3] >= 255:
        _cut_capture()
    _op('bg', _css(rgba))


def clear():
    """Make the canvas transparent again."""
    _s.touched = True
    _cut_capture()
    _op('clr')


def fill(*args):
    """The colour shapes are filled with."""
    _s.style['fill'] = _to_color(args, 'fill()')


def no_fill():
    """Draw shapes without filling them in."""
    _s.style['fill'] = None


def stroke(*args):
    """The colour of lines and shape outlines."""
    _s.style['stroke'] = _to_color(args, 'stroke()')
    _s.style['stroke_set'] = True


def no_stroke():
    """Draw shapes without an outline."""
    _s.style['stroke'] = None


def stroke_weight(weight):
    """How thick lines and outlines are, in pixels."""
    _s.style['weight'] = max(0.0, _f(weight, 'stroke_weight()'))


def stroke_cap(cap):
    """ROUND (the default), SQUARE or PROJECT ends on lines."""
    cap = str(cap).lower()
    if cap not in (ROUND, SQUARE, PROJECT):
        raise ValueError('stroke_cap() takes ROUND, SQUARE or PROJECT')
    _s.style['cap'] = cap


def stroke_join(join):
    """MITER (the default), BEVEL or ROUND corners where lines meet."""
    join = str(join).lower()
    if join not in (MITER, BEVEL, ROUND):
        raise ValueError('stroke_join() takes MITER, BEVEL or ROUND')
    _s.style['join'] = join


def rect_mode(mode):
    """How rect() reads its numbers: CORNER (default), CORNERS, CENTER or RADIUS."""
    mode = str(mode).lower()
    if mode not in (CORNER, CORNERS, CENTER, RADIUS):
        raise ValueError('rect_mode() takes CORNER, CORNERS, CENTER or RADIUS')
    _s.style['rect_mode'] = mode


def ellipse_mode(mode):
    """How ellipse() reads its numbers: CENTER (default), CORNER, CORNERS or RADIUS."""
    mode = str(mode).lower()
    if mode not in (CORNER, CORNERS, CENTER, RADIUS):
        raise ValueError('ellipse_mode() takes CENTER, CORNER, CORNERS or RADIUS')
    _s.style['ellipse_mode'] = mode


def angle_mode(mode):
    """RADIANS (the default) or DEGREES, for rotate(), arc() and the trigonometry functions."""
    mode = str(mode).lower()
    if mode not in (RADIANS, DEGREES):
        raise ValueError('angle_mode() takes RADIANS or DEGREES')
    _s.angle_mode = mode


# ── Transformations ─────────────────────────────────────────────────────────

def _mul(n):
    a, b, c, d, e, f = _s.matrix
    na, nb, nc, nd, ne, nf = n
    _s.matrix = [a * na + c * nb, b * na + d * nb, a * nc + c * nd, b * nc + d * nd,
                 a * ne + c * nf + e, b * ne + d * nf + f]


def translate(x, y, z=0):
    """Move the origin (0, 0) to (x, y)."""
    _mul((1, 0, 0, 1, _f(x, 'x'), _f(y, 'y')))


def rotate(angle):
    """Turn everything drawn after this around the origin (clockwise for positive angles)."""
    t = _angle(angle)
    c, s = _math.cos(t), _math.sin(t)
    _mul((c, s, -s, c, 0, 0))


def scale(sx, sy=None, sz=None):
    """Make everything drawn after this bigger or smaller: scale(2), scale(1, -1)."""
    if isinstance(sx, (list, tuple)):
        sx, sy = sx[0], sx[1] if len(sx) > 1 else sx[0]
    sx = _f(sx)
    sy = sx if sy is None else _f(sy)
    _mul((sx, 0, 0, sy, 0, 0))


def shear_x(angle):
    _mul((1, 0, _math.tan(_angle(angle)), 1, 0, 0))


def shear_y(angle):
    _mul((1, _math.tan(_angle(angle)), 0, 1, 0, 0))


def apply_matrix(a, b, c, d, e, f):
    _mul(tuple(_f(v) for v in (a, b, c, d, e, f)))


def reset_matrix():
    _s.matrix = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]


def push():
    """Remember the current style and transformation, until pop()."""
    _s.stack.append((list(_s.matrix), _copy_style(_s.style)))


def pop():
    """Go back to the style and transformation saved by the last push()."""
    if not _s.stack:
        raise RuntimeError('pop() was called more times than push()')
    matrix, style = _s.stack.pop()
    _s.matrix = matrix
    _s.style = style


def push_matrix():
    _s.stack.append((list(_s.matrix), None))


def pop_matrix():
    if not _s.stack:
        raise RuntimeError('pop_matrix() was called more times than push_matrix()')
    matrix, style = _s.stack.pop()
    _s.matrix = matrix
    if style is not None:
        _s.style = style


def push_style():
    _s.stack.append((None, _copy_style(_s.style)))


def pop_style():
    if not _s.stack:
        raise RuntimeError('pop_style() was called more times than push_style()')
    matrix, style = _s.stack.pop()
    if matrix is not None:
        _s.matrix = matrix
    if style is not None:
        _s.style = style


# ── Shapes ──────────────────────────────────────────────────────────────────

def _draw(fill, stroke, op):
    """Send one shape, unless it would not show or a number in it is not a number."""
    if not _visible(fill, stroke):
        _s.touched = True
        return
    try:
        args = [op[0]] + [_n(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else v for v in op[1:]]
    except _NotANumber:
        return
    _paint(fill, stroke)
    _s.ops.append(args)


def point(x, y, z=None):
    """A dot in the stroke colour, as big as the stroke weight."""
    if isinstance(x, Vector):
        x, y = x.x, x.y
    _draw(False, True, ['pt', _f(x, 'x'), _f(y, 'y')])


def line(x1, y1, x2, y2, *rest):
    """A line from (x1, y1) to (x2, y2), in the stroke colour."""
    _draw(False, True, ['l', _f(x1, 'x1'), _f(y1, 'y1'), _f(x2, 'x2'), _f(y2, 'y2')])


def _box(mode, a, b, c, d):
    if mode == CORNER:
        x, y, w, h = a, b, c, d
    elif mode == CORNERS:
        x, y, w, h = a, b, c - a, d - b
    elif mode == CENTER:
        x, y, w, h = a - c / 2.0, b - d / 2.0, c, d
    else:
        x, y, w, h = a - c, b - d, c * 2, d * 2
    if w < 0:
        x, w = x + w, -w
    if h < 0:
        y, h = y + h, -h
    return x, y, w, h


def rect(x, y, w, h=None, tl=None, tr=None, br=None, bl=None):
    """A rectangle; its top-left corner at (x, y) unless rect_mode() says otherwise.

    Extra numbers round the corners: one for all four, or four for each in turn.
    """
    x, y, w = _f(x, 'x'), _f(y, 'y'), _f(w, 'width')
    h = w if h is None else _f(h, 'height')
    x, y, w, h = _box(_s.style['rect_mode'], x, y, w, h)
    op = ['r', x, y, w, h]
    if tl is not None:
        radii = [_f(tl)] * 4 if tr is None else [_f(tl), _f(tr), _f(br if br is not None else 0), _f(bl if bl is not None else 0)]
        limit = min(w, h) / 2.0
        radii = [min(max(r, 0.0), limit) for r in radii]
        if any(radii):
            op.append([_n(r) for r in radii])
    _draw(True, True, op)


def square(x, y, s, tl=None, tr=None, br=None, bl=None):
    """A square of side s."""
    rect(x, y, s, s, tl, tr, br, bl)


def _ellipse_box(a, b, c, d):
    mode = _s.style['ellipse_mode']
    if mode == CENTER:
        return a, b, abs(c) / 2.0, abs(d) / 2.0
    if mode == RADIUS:
        return a, b, abs(c), abs(d)
    if mode == CORNER:
        return a + c / 2.0, b + d / 2.0, abs(c) / 2.0, abs(d) / 2.0
    return (a + c) / 2.0, (b + d) / 2.0, abs(c - a) / 2.0, abs(d - b) / 2.0


def ellipse(x, y, w, h=None):
    """An ellipse centred on (x, y), w wide and h high (h defaults to w)."""
    x, y, w = _f(x, 'x'), _f(y, 'y'), _f(w, 'width')
    h = w if h is None else _f(h, 'height')
    cx, cy, rx, ry = _ellipse_box(x, y, w, h)
    _draw(True, True, ['e', cx, cy, rx, ry])


def circle(x, y, d):
    """A circle centred on (x, y) with diameter d."""
    ellipse(x, y, d, d)


def arc(x, y, w, h, start, stop, mode=None):
    """Part of an ellipse, from angle start to angle stop, clockwise.

    mode is OPEN (an open curve), CHORD (closed by a straight line) or PIE
    (closed through the centre); with none it is filled as a pie and outlined
    as an open curve, as p5 does.
    """
    x, y, w, h = _f(x, 'x'), _f(y, 'y'), _f(w, 'width'), _f(h, 'height')
    cx, cy, rx, ry = _ellipse_box(x, y, w, h)
    a0, a1 = _angle(start), _angle(stop)
    if mode is not None:
        mode = str(mode).lower()
        if mode not in (OPEN, CHORD, PIE):
            raise ValueError('arc() mode is OPEN, CHORD or PIE')
    if abs(a1 - a0) >= TWO_PI - 1e-9:
        _draw(True, True, ['a', cx, cy, rx, ry, 0, _n(TWO_PI), mode or 'default'])
        return
    a0 %= TWO_PI
    a1 %= TWO_PI
    if a0 == a1:
        return

    def visual(t):
        # p5 measures angles where they look to be on a squashed ellipse.
        if rx == ry:
            return t
        return _math.atan2(rx * _math.sin(t), ry * _math.cos(t)) % TWO_PI

    v0, v1 = visual(a0), visual(a1)
    if v1 <= v0:
        v1 += TWO_PI
    _draw(True, True, ['a', cx, cy, rx, ry, v0, v1, mode or 'default'])


def triangle(x1, y1, x2, y2, x3, y3):
    """A triangle with corners at the three points."""
    pts = [_f(v) for v in (x1, y1, x2, y2, x3, y3)]
    _poly(pts, True)


def quad(x1, y1, x2, y2, x3, y3, x4, y4, *rest):
    """A four-sided shape with corners at the four points, in order."""
    pts = [_f(v) for v in (x1, y1, x2, y2, x3, y3, x4, y4)]
    _poly(pts, True)


def _poly(pts, close):
    if not _visible():
        _s.touched = True
        return
    try:
        flat = [_n(v) for v in pts]
    except _NotANumber:
        return
    _paint()
    _s.ops.append(['p', flat, 1 if close else 0])


def bezier(x1, y1, x2, y2, x3, y3, x4, y4):
    """A curve from (x1, y1) to (x4, y4), pulled towards the two control points between."""
    vals = [_f(v) for v in (x1, y1, x2, y2, x3, y3, x4, y4)]
    _path([['M', vals[0], vals[1]], ['C'] + vals[2:]], False)


def curve(x1, y1, x2, y2, x3, y3, x4, y4):
    """A smooth curve from (x2, y2) to (x3, y3); the first and last points steer it."""
    p = [_f(v) for v in (x1, y1, x2, y2, x3, y3, x4, y4)]
    _path([['M', p[2], p[3]], ['C'] + _catmull(p[0:2], p[2:4], p[4:6], p[6:8])], False)


def _catmull(p0, p1, p2, p3):
    return [p1[0] + (p2[0] - p0[0]) / 6.0, p1[1] + (p2[1] - p0[1]) / 6.0,
            p2[0] - (p3[0] - p1[0]) / 6.0, p2[1] - (p3[1] - p1[1]) / 6.0,
            p2[0], p2[1]]


def _path(segments, close, fill=True):
    if not _visible(fill, True):
        _s.touched = True
        return
    try:
        segs = [[seg[0]] + [_n(v) for v in seg[1:]] for seg in segments]
    except _NotANumber:
        return
    _paint(fill, True)
    if not fill:
        _sync('fs', 0)
    _s.ops.append(['sh', segs, 1 if close else 0])


# begin_shape() ... end_shape()

def begin_shape(kind=None):
    """Start a shape made of vertex() points; end_shape() draws it."""
    _s.shape = {'kind': kind, 'verts': [], 'contours': [], 'contour': None}


def _shape_verts():
    if _s.shape is None:
        raise RuntimeError('vertex() was called without begin_shape() first')
    return _s.shape['contour'] if _s.shape['contour'] is not None else _s.shape['verts']


def vertex(x, y, *rest):
    """A corner of the shape being built."""
    _shape_verts().append(('L', _f(x, 'x'), _f(y, 'y')))


def bezier_vertex(x2, y2, x3, y3, x4, y4):
    """A curved edge to (x4, y4), pulled towards two control points."""
    _shape_verts().append(('C', _f(x2), _f(y2), _f(x3), _f(y3), _f(x4), _f(y4)))


def quadratic_vertex(cx, cy, x3, y3):
    """A curved edge to (x3, y3), pulled towards one control point."""
    _shape_verts().append(('Q', _f(cx), _f(cy), _f(x3), _f(y3)))


def curve_vertex(x, y):
    """A point a smooth curve passes through (the first and last only steer it)."""
    _shape_verts().append(('K', _f(x, 'x'), _f(y, 'y')))


def begin_contour():
    """Start a hole cut out of the shape being built (draw it the other way round)."""
    if _s.shape is None:
        raise RuntimeError('begin_contour() needs begin_shape() first')
    _s.shape['contour'] = []


def end_contour():
    if _s.shape is None or _s.shape['contour'] is None:
        raise RuntimeError('end_contour() needs begin_contour() first')
    _s.shape['contours'].append(_s.shape['contour'])
    _s.shape['contour'] = None


def _segments(verts, close):
    """vertex() and friends as path segments; curve_vertex runs become Bézier curves."""
    segs = []
    i = 0
    while i < len(verts):
        v = verts[i]
        if v[0] == 'K':
            run = []
            while i < len(verts) and verts[i][0] == 'K':
                run.append(verts[i][1:])
                i += 1
            if len(run) >= 4:
                start = run[1]
                segs.append(['L' if segs else 'M', start[0], start[1]])
                for j in range(1, len(run) - 2):
                    segs.append(['C'] + _catmull(run[j - 1], run[j], run[j + 1], run[j + 2]))
            continue
        if not segs:
            pt = v[-2:]
            segs.append(['M', pt[0], pt[1]])
        else:
            segs.append(list(v))
        i += 1
    if close and segs:
        segs.append(['Z'])
    return segs


def end_shape(mode=None):
    """Draw the shape begun by begin_shape(); end_shape(CLOSE) joins the last point to the first."""
    shape = _s.shape
    if shape is None:
        raise RuntimeError('end_shape() was called without begin_shape() first')
    _s.shape = None
    close = str(mode).lower() == CLOSE if mode is not None else False
    kind = shape['kind']
    verts = shape['verts']
    pts = [v[-2:] for v in verts]
    if kind == POINTS:
        for x, y in pts:
            point(x, y)
        return
    if kind == LINES:
        for i in range(0, len(pts) - 1, 2):
            line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
        return
    if kind == TRIANGLES:
        for i in range(0, len(pts) - 2, 3):
            _poly([c for p in pts[i:i + 3] for c in p], True)
        return
    if kind == TRIANGLE_STRIP:
        for i in range(len(pts) - 2):
            _poly([c for p in pts[i:i + 3] for c in p], True)
        return
    if kind == TRIANGLE_FAN:
        for i in range(1, len(pts) - 1):
            _poly([c for p in (pts[0], pts[i], pts[i + 1]) for c in p], True)
        return
    if kind == QUADS:
        for i in range(0, len(pts) - 3, 4):
            _poly([c for p in pts[i:i + 4] for c in p], True)
        return
    if kind == QUAD_STRIP:
        for i in range(0, len(pts) - 3, 2):
            a, b, c, d = pts[i], pts[i + 1], pts[i + 3], pts[i + 2]
            _poly([v for p in (a, b, c, d) for v in p], True)
        return
    if kind is not None and str(kind).lower() not in ('polygon', 'tess', 'tesselate'):
        raise ValueError('begin_shape() takes POINTS, LINES, TRIANGLES, TRIANGLE_FAN, TRIANGLE_STRIP, QUADS or QUAD_STRIP')
    if all(v[0] == 'L' for v in verts) and not shape['contours']:
        _poly([c for p in pts for c in p], close)
        return
    segs = _segments(verts, close)
    for contour in shape['contours']:
        segs.extend(_segments(contour, True))
    if segs:
        _path(segs, False)


# ── Text ────────────────────────────────────────────────────────────────────

def text_size(s=None):
    """How big text is, in pixels (12 to start with). With no number, says how big it is."""
    if s is None:
        return _s.style['text_size']
    _s.style['text_size'] = max(0.0, _f(s, 'text_size()'))


def text_leading(leading=None):
    """The distance between lines of text."""
    if leading is None:
        return _leading()
    _s.style['text_leading'] = _f(leading)


def _leading():
    lead = _s.style['text_leading']
    return lead if lead is not None else _s.style['text_size'] * 1.25


def text_font(font, size=None):
    """The typeface: text_font('Georgia'), text_font('monospace'), text_font('Arial', 20)."""
    _s.style['text_font'] = str(getattr(font, 'family', font))
    if size is not None:
        text_size(size)


def text_style(style=None):
    """NORMAL, ITALIC, BOLD or BOLDITALIC."""
    if style is None:
        return _s.style['text_style']
    style = str(style).lower()
    if style not in (NORMAL, ITALIC, BOLD, BOLDITALIC):
        raise ValueError('text_style() takes NORMAL, ITALIC, BOLD or BOLDITALIC')
    _s.style['text_style'] = style


def text_align(align_x, align_y=None):
    """Where text sits against its point: LEFT, CENTER or RIGHT, then TOP, CENTER, BOTTOM or BASELINE."""
    ax = str(align_x).lower()
    if ax not in (LEFT, CENTER, RIGHT):
        raise ValueError('text_align() takes LEFT, CENTER or RIGHT first')
    _s.style['align_x'] = ax
    if align_y is not None:
        ay = str(align_y).lower()
        if ay not in (TOP, CENTER, BOTTOM, BASELINE):
            raise ValueError('text_align() takes TOP, CENTER, BOTTOM or BASELINE second')
        _s.style['align_y'] = ay


def _font_css():
    style = _s.style
    family = style['text_font']
    generic = family.lower() in ('serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui')
    fam = family if generic else '"%s"' % family.replace('"', '')
    weight = style['text_style']
    prefix = '' if weight == NORMAL else weight + ' '
    return '%s%spx %s' % (prefix, _n(style['text_size']), fam)


def text_width(s):
    """How wide a piece of text would be, in pixels, at the current text size."""
    s = str(s)
    lines = s.split('\n')
    if not _s.headless and _tk._host is not None:
        _tk._app.flush()
        widths = []
        for ln in lines:
            w = _tk._app.query(q='measure', font=_font_css(), text=ln)
            if w is None:
                widths = None
                break
            widths.append(float(w))
        if widths is not None:
            return max(widths) if widths else 0.0
    return max(len(ln) for ln in lines) * _s.style['text_size'] * 0.55


def text_ascent():
    if not _s.headless and _tk._host is not None:
        m = _tk._app.query(q='metrics', font=_font_css())
        if m:
            return float(m.get('ascent', 0))
    return _s.style['text_size'] * 0.8


def text_descent():
    if not _s.headless and _tk._host is not None:
        m = _tk._app.query(q='metrics', font=_font_css())
        if m:
            return float(m.get('descent', 0))
    return _s.style['text_size'] * 0.2


_BASELINES = {TOP: 'top', CENTER: 'middle', BOTTOM: 'bottom', BASELINE: 'alphabetic'}


def _wrap(s, box_w):
    out = []
    for para in s.split('\n'):
        words = para.split(' ')
        current = ''
        for word in words:
            trial = word if not current else current + ' ' + word
            if current and text_width(trial) > box_w:
                out.append(current)
                current = word
            else:
                current = trial
        out.append(current)
    return out


def text(s, x, y, box_w=None, box_h=None):
    """Write s with its baseline at (x, y), in the fill colour."""
    style = _s.style
    s = str(s)
    x, y = _f(x, 'x'), _f(y, 'y')
    fill_on = style['fill'] is not None
    stroke_on = style['stroke'] is not None and style['stroke_set']
    if not (fill_on or stroke_on) or s == '':
        _s.touched = True
        return
    lead = _leading()
    ax, ay = style['align_x'], style['align_y']
    if box_w is not None:
        box_w = _f(box_w)
        lines = _wrap(s, box_w)
        if ax == CENTER:
            x += box_w / 2.0
        elif ax == RIGHT:
            x += box_w
        baseline = 'top'
        total = lead * len(lines)
        if box_h is not None and ay in (CENTER, BOTTOM):
            box_h = _f(box_h)
            y += (box_h - total) / 2.0 if ay == CENTER else box_h - total
        ys = [y + i * lead for i in range(len(lines))]
    else:
        lines = s.split('\n')
        baseline = _BASELINES[ay]
        n = len(lines)
        shift = 0.0
        if ay == CENTER:
            shift = (n - 1) * lead / 2.0
        elif ay == BOTTOM:
            shift = (n - 1) * lead
        ys = [y - shift + i * lead for i in range(n)]
    try:
        coords = [(_n(x), _n(yy)) for yy in ys]
    except _NotANumber:
        return
    _paint(fill_on, stroke_on)
    if not fill_on:
        _sync('fs', 0)
    _sync('font', _font_css())
    _sync('ta', (ax, baseline), 'ta', ax, baseline)
    for ln, (tx, ty) in zip(lines, coords):
        if ln:
            _s.ops.append(['t', ln, tx, ty, 1 if stroke_on else 0])


# ── Images ──────────────────────────────────────────────────────────────────

def _image_info(data):
    """(mime, width, height) from an image file's first bytes."""
    if data[:8] == b'\x89PNG\r\n\x1a\n' and len(data) >= 24:
        return 'image/png', int.from_bytes(data[16:20], 'big'), int.from_bytes(data[20:24], 'big')
    if data[:6] in (b'GIF87a', b'GIF89a'):
        return 'image/gif', int.from_bytes(data[6:8], 'little'), int.from_bytes(data[8:10], 'little')
    if data[:2] == b'BM' and len(data) >= 26:
        return 'image/bmp', int.from_bytes(data[18:22], 'little'), abs(int.from_bytes(data[22:26], 'little', signed=True))
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        chunk = data[12:16]
        if chunk == b'VP8X':
            return 'image/webp', 1 + int.from_bytes(data[24:27], 'little'), 1 + int.from_bytes(data[27:30], 'little')
        if chunk == b'VP8L':
            bits = int.from_bytes(data[21:25], 'little')
            return 'image/webp', (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
        if chunk == b'VP8 ':
            return 'image/webp', int.from_bytes(data[26:28], 'little') & 0x3FFF, int.from_bytes(data[28:30], 'little') & 0x3FFF
    if data[:2] == b'\xff\xd8':
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                i += 2
                continue
            seg = int.from_bytes(data[i + 2:i + 4], 'big')
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                return 'image/jpeg', int.from_bytes(data[i + 7:i + 9], 'big'), int.from_bytes(data[i + 5:i + 7], 'big')
            i += 2 + seg
    return None


class Image:
    """A picture loaded with load_image(): draw it with image(). Knows its width and height."""

    _seq = 0

    def __init__(self, path, data):
        info = _image_info(data)
        if info is None:
            raise ValueError('%s is not an image p5 can read (PNG, JPEG, GIF, BMP or WebP)' % path)
        Image._seq += 1
        self._id = 'img%d' % Image._seq
        self._mime, self.width, self.height = info
        self.path = path
        _s.images[self._id] = (self._mime, _base64.b64encode(data).decode('ascii'))

    def __repr__(self):
        return '<Image %s %dx%d>' % (self.path, self.width, self.height)


PImage = Image


def load_image(path):
    """Load a picture from a file next to your program: img = load_image('cat.png')."""
    p = str(path)
    try:
        with open(p, 'rb') as fh:
            data = fh.read()
    except FileNotFoundError:
        raise FileNotFoundError('load_image() could not find "%s" — is the file in your filesystem?' % p) from None
    return Image(p, data)


def image_mode(mode):
    """How image() reads its numbers: CORNER (default), CORNERS or CENTER."""
    mode = str(mode).lower()
    if mode not in (CORNER, CORNERS, CENTER):
        raise ValueError('image_mode() takes CORNER, CORNERS or CENTER')
    _s.style['image_mode'] = mode


def image(img, x, y, w=None, h=None):
    """Draw a picture from load_image() at (x, y), at its own size or w by h."""
    if not isinstance(img, Image):
        raise TypeError('image() draws a picture made by load_image(), not %s' % type(img).__name__)
    x, y = _f(x, 'x'), _f(y, 'y')
    w = float(img.width) if w is None else _f(w, 'width')
    h = float(img.height) if h is None else _f(h, 'height')
    mode = _s.style['image_mode']
    if mode == CENTER:
        x, y = x - w / 2.0, y - h / 2.0
    elif mode == CORNERS:
        w, h = w - x, h - y
    try:
        vals = [_n(v) for v in (x, y, w, h)]
    except _NotANumber:
        return
    _s.touched = True
    if img._id not in _s.images_sent:
        _s.images_sent.add(img._id)
        mime, b64 = _s.images[img._id]
        if not _s.headless:
            _s.ops.append(['imgdef', img._id, mime, b64])
    _sync_transform()
    _s.ops.append(['img', img._id] + vals)


# ── The mouse cursor ────────────────────────────────────────────────────────

def cursor(kind=ARROW):
    """The mouse pointer over the canvas: ARROW, CROSS, HAND, MOVE, TEXT or WAIT."""
    _s.cursor = str(kind)
    _op('cur', _s.cursor)


def no_cursor():
    """Hide the mouse pointer over the canvas."""
    _s.cursor = 'none'
    _op('cur', 'none')


# ── Maths ───────────────────────────────────────────────────────────────────

def constrain(n, low, high):
    """n, kept between low and high."""
    return max(min(n, high), low)


def lerp(start, stop, amt):
    """The number amt of the way from start to stop (amt 0.5 is halfway)."""
    return start + (stop - start) * amt


def dist(*args):
    """The distance between two points: dist(x1, y1, x2, y2)."""
    if len(args) == 4:
        x1, y1, x2, y2 = args
        return _math.hypot(x2 - x1, y2 - y1)
    if len(args) == 6:
        x1, y1, z1, x2, y2, z2 = args
        return _math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2)
    if len(args) == 2 and all(isinstance(a, Vector) for a in args):
        return args[0].dist(args[1])
    raise TypeError('dist() takes x1, y1, x2, y2')


def mag(*args):
    return _math.sqrt(sum(float(a) * float(a) for a in args))


def remap(value, start1, stop1, start2, stop2, within_bounds=False):
    """value moved from the range start1..stop1 to the same place in start2..stop2."""
    out = start2 + (stop2 - start2) * ((value - start1) / float(stop1 - start1))
    if within_bounds:
        lo, hi = min(start2, stop2), max(start2, stop2)
        out = max(lo, min(hi, out))
    return out


def map(value, *args):
    """p5's map(value, start1, stop1, start2, stop2) — and still Python's map(function, list)."""
    if callable(value):
        return _builtins.map(value, *args)
    return remap(value, *args)


def norm(value, start, stop):
    return remap(value, start, stop, 0.0, 1.0)


def sq(n):
    return n * n


def fract(n):
    return n - _math.floor(n)


def floor(n):
    return _math.floor(n)


def ceil(n):
    return _math.ceil(n)


sqrt = _math.sqrt
exp = _math.exp
log = _math.log


def sin(angle):
    return _math.sin(_angle(angle))


def cos(angle):
    return _math.cos(_angle(angle))


def tan(angle):
    return _math.tan(_angle(angle))


def asin(x):
    return _from_radians(_math.asin(x))


def acos(x):
    return _from_radians(_math.acos(x))


def atan(x):
    return _from_radians(_math.atan(x))


def atan2(y, x):
    return _from_radians(_math.atan2(y, x))


def degrees(rad):
    return _math.degrees(rad)


def radians(deg):
    return _math.radians(deg)


class _Random:
    """random(): p5's function, which also still works as Python's random module.

    `from p5 import *` after `import random` would otherwise replace the
    module, and random.randint() would stop working.
    """

    def __call__(self, *args):
        rng = _s.rng
        if not args:
            return rng.random()
        if len(args) == 1:
            a = args[0]
            if isinstance(a, (list, tuple, str)):
                return rng.choice(a) if len(a) else None
            return rng.random() * a
        low, high = args[0], args[1]
        return low + rng.random() * (high - low)

    def __getattr__(self, name):
        return getattr(_random_module, name)

    def __repr__(self):
        return '<p5 random()>'


random = _Random()


def random_seed(seed):
    """Make random() give the same numbers every time the sketch runs."""
    _s.rng.seed(seed)


def random_gaussian(mean=0.0, sd=1.0):
    return _s.rng.gauss(mean, sd)


# Perlin noise, as p5.js makes it.
_PERLIN_YWRAPB = 4
_PERLIN_YWRAP = 1 << _PERLIN_YWRAPB
_PERLIN_ZWRAPB = 8
_PERLIN_ZWRAP = 1 << _PERLIN_ZWRAPB
_PERLIN_SIZE = 4095


def _scaled_cosine(i):
    return 0.5 * (1.0 - _math.cos(i * _math.pi))


def noise(x, y=0.0, z=0.0):
    """Smooth random values between 0 and 1: nearby inputs give nearby outputs."""
    if _s.perlin is None:
        _s.perlin = [_s.noise_rng.random() for _ in range(_PERLIN_SIZE + 1)]
    perlin = _s.perlin
    x, y, z = abs(float(x)), abs(float(y)), abs(float(z))
    xi, yi, zi = int(x), int(y), int(z)
    xf, yf, zf = x - xi, y - yi, z - zi
    r = 0.0
    ampl = 0.5
    for _ in range(_s.noise_octaves):
        of = xi + (yi << _PERLIN_YWRAPB) + (zi << _PERLIN_ZWRAPB)
        rxf = _scaled_cosine(xf)
        ryf = _scaled_cosine(yf)
        n1 = perlin[of & _PERLIN_SIZE]
        n1 += rxf * (perlin[(of + 1) & _PERLIN_SIZE] - n1)
        n2 = perlin[(of + _PERLIN_YWRAP) & _PERLIN_SIZE]
        n2 += rxf * (perlin[(of + _PERLIN_YWRAP + 1) & _PERLIN_SIZE] - n2)
        n1 += ryf * (n2 - n1)
        of += _PERLIN_ZWRAP
        n2 = perlin[of & _PERLIN_SIZE]
        n2 += rxf * (perlin[(of + 1) & _PERLIN_SIZE] - n2)
        n3 = perlin[(of + _PERLIN_YWRAP) & _PERLIN_SIZE]
        n3 += rxf * (perlin[(of + _PERLIN_YWRAP + 1) & _PERLIN_SIZE] - n3)
        n2 += ryf * (n3 - n2)
        n1 += _scaled_cosine(zf) * (n2 - n1)
        r += n1 * ampl
        ampl *= _s.noise_falloff
        xi <<= 1
        xf *= 2
        yi <<= 1
        yf *= 2
        zi <<= 1
        zf *= 2
        if xf >= 1.0:
            xi += 1
            xf -= 1
        if yf >= 1.0:
            yi += 1
            yf -= 1
        if zf >= 1.0:
            zi += 1
            zf -= 1
    return r


def noise_seed(seed):
    """Make noise() give the same values every time the sketch runs."""
    _s.noise_rng.seed(seed)
    _s.perlin = None


def noise_detail(octaves, falloff=0.5):
    _s.noise_octaves = max(1, int(octaves))
    _s.noise_falloff = float(falloff)


# ── Vectors ─────────────────────────────────────────────────────────────────

class Vector:
    """A 2D (or 3D) vector: a position, a velocity, a force. create_vector(x, y) makes one.

    add(), sub(), mult() and div() change the vector itself, as in p5;
    +, -, * and / make a new one.
    """

    def __init__(self, x=0.0, y=0.0, z=0.0):
        self.x = float(x)
        self.y = float(y)
        self.z = float(z)

    def __repr__(self):
        def fmt(v):
            return str(int(v)) if v == int(v) else '%g' % v
        if self.z:
            return 'Vector(%s, %s, %s)' % (fmt(self.x), fmt(self.y), fmt(self.z))
        return 'Vector(%s, %s)' % (fmt(self.x), fmt(self.y))

    def __iter__(self):
        return iter((self.x, self.y, self.z))

    def __eq__(self, other):
        return isinstance(other, Vector) and (self.x, self.y, self.z) == (other.x, other.y, other.z)

    def __hash__(self):
        return hash((self.x, self.y, self.z))

    @staticmethod
    def _xyz(args):
        if len(args) == 1:
            a = args[0]
            if isinstance(a, Vector):
                return a.x, a.y, a.z
            if isinstance(a, (list, tuple)):
                vals = list(a) + [0, 0, 0]
                return float(vals[0]), float(vals[1]), float(vals[2])
            v = float(a)
            return v, v, v
        vals = list(args) + [0, 0, 0]
        return float(vals[0]), float(vals[1]), float(vals[2])

    def copy(self):
        return Vector(self.x, self.y, self.z)

    def set(self, *args):
        self.x, self.y, self.z = self._xyz(args) if args else (0.0, 0.0, 0.0)
        return self

    def add(self, *args):
        x, y, z = self._xyz(args)
        self.x += x
        self.y += y
        self.z += z
        return self

    def sub(self, *args):
        x, y, z = self._xyz(args)
        self.x -= x
        self.y -= y
        self.z -= z
        return self

    def mult(self, n):
        if isinstance(n, Vector):
            self.x, self.y, self.z = self.x * n.x, self.y * n.y, self.z * n.z
        else:
            n = float(n)
            self.x *= n
            self.y *= n
            self.z *= n
        return self

    def div(self, n):
        if isinstance(n, Vector):
            self.x, self.y, self.z = self.x / n.x, self.y / n.y, (self.z / n.z if n.z else self.z)
        else:
            n = float(n)
            self.x /= n
            self.y /= n
            self.z /= n
        return self

    def __add__(self, other):
        return self.copy().add(other)

    def __sub__(self, other):
        return self.copy().sub(other)

    def __mul__(self, n):
        return self.copy().mult(n)

    __rmul__ = __mul__

    def __truediv__(self, n):
        return self.copy().div(n)

    def __neg__(self):
        return Vector(-self.x, -self.y, -self.z)

    def mag(self):
        return _math.sqrt(self.x * self.x + self.y * self.y + self.z * self.z)

    def mag_sq(self):
        return self.x * self.x + self.y * self.y + self.z * self.z

    def normalize(self):
        m = self.mag()
        if m:
            self.div(m)
        return self

    def set_mag(self, n):
        return self.normalize().mult(n)

    def limit(self, maximum):
        m2 = self.mag_sq()
        if m2 > maximum * maximum:
            self.div(_math.sqrt(m2)).mult(maximum)
        return self

    def heading(self):
        return _from_radians(_math.atan2(self.y, self.x))

    def set_heading(self, angle):
        m = self.mag()
        t = _angle(angle)
        self.x, self.y = m * _math.cos(t), m * _math.sin(t)
        return self

    def rotate(self, angle):
        t = _angle(angle)
        c, s = _math.cos(t), _math.sin(t)
        self.x, self.y = self.x * c - self.y * s, self.x * s + self.y * c
        return self

    def dist(self, other):
        return (self - other).mag()

    def dot(self, *args):
        x, y, z = self._xyz(args)
        return self.x * x + self.y * y + self.z * z

    def cross(self, other):
        return Vector(self.y * other.z - self.z * other.y,
                      self.z * other.x - self.x * other.z,
                      self.x * other.y - self.y * other.x)

    def angle_between(self, other):
        d = self.mag() * other.mag()
        if not d:
            return 0.0
        return _from_radians(_math.acos(max(-1.0, min(1.0, self.dot(other) / d))))

    def lerp(self, *args):
        *target, amt = args
        x, y, z = self._xyz(target)
        amt = float(amt)
        self.x += (x - self.x) * amt
        self.y += (y - self.y) * amt
        self.z += (z - self.z) * amt
        return self

    def array(self):
        return [self.x, self.y, self.z]

    @staticmethod
    def from_angle(angle, length=1.0):
        t = _angle(angle)
        return Vector(length * _math.cos(t), length * _math.sin(t))

    @staticmethod
    def random2d():
        t = _s.rng.random() * TWO_PI
        return Vector(_math.cos(t), _math.sin(t))

    magSq = mag_sq
    setMag = set_mag
    setHeading = set_heading
    angleBetween = angle_between
    fromAngle = from_angle
    random2D = random2d


PVector = Vector


def create_vector(x=0.0, y=0.0, z=0.0):
    """A vector: create_vector(3, 4)."""
    return Vector(x, y, z)


# ── Time ────────────────────────────────────────────────────────────────────

def millis():
    """Milliseconds since the sketch started."""
    return int((_time.monotonic() - _s.start_time) * 1000)


def second():
    return _datetime.datetime.now().second


def minute():
    return _datetime.datetime.now().minute


def hour():
    return _datetime.datetime.now().hour


def day():
    return _datetime.datetime.now().day


def month():
    return _datetime.datetime.now().month


def year():
    return _datetime.datetime.now().year


# ── Keyboard ────────────────────────────────────────────────────────────────

def key_is_down(code):
    """Is this key held down right now? key_is_down(LEFT_ARROW), key_is_down('a')."""
    if isinstance(code, str):
        if len(code) != 1:
            raise ValueError('key_is_down() takes a key code or a single character')
        code = ord(code.upper())
    return int(code) in _s.keys_down


# ── The frame loop ──────────────────────────────────────────────────────────

def frame_rate(fps=None):
    """frame_rate(30) asks for 30 frames a second; frame_rate() says how many it is managing."""
    if fps is None:
        return _s.measured_fps or _s.target_fps
    fps = _f(fps, 'frame_rate()')
    if fps <= 0:
        raise ValueError('frame_rate() needs a positive number')
    _s.target_fps = min(fps, 120.0)


def no_loop():
    """Stop calling draw() — the sketch keeps its last frame."""
    _s.looping = False
    if _s.timer is not None and _s.root is not None:
        _s.root.after_cancel(_s.timer)
        _s.timer = None
    _sync_bindings()


def loop():
    """Start calling draw() again after no_loop()."""
    if _s.looping:
        return
    _s.looping = True
    if _s.started and not _s.headless:
        _schedule(0.0)
    _sync_bindings()


def is_looping():
    return _s.looping


def redraw(n=1):
    """Call draw() once more, after no_loop()."""
    if _s.started and not _s.headless:
        _s.redraw_pending = True
        _schedule(0.0)


def _publish():
    """Copy p5's variables into the module and into the sketch's own namespace."""
    g = globals()
    ns = _s.ns
    last = _s.published
    for attr, camel in _PUBLIC_VARS:
        value = getattr(_s, attr)
        names = (attr,) if camel == attr else (attr, camel)
        for name in names:
            g[name] = value
            if ns is not None and ns is not g and name in ns:
                # A variable of the program's own with the same name is left alone.
                current = ns[name]
                if name not in last or (type(current) is type(last[name]) and current == last[name]):
                    ns[name] = value
            last[name] = value


def _find_callbacks(ns, setup_fn=None, draw_fn=None):
    found = {}
    for snake, camel in _CALLBACKS:
        fn = None
        for name in (snake, camel):
            cand = ns.get(name) if ns is not None else None
            if callable(cand) and getattr(cand, '__module__', None) != __name__:
                fn = cand
                break
        if fn is not None:
            found[snake] = fn
    if setup_fn is not None:
        found['setup'] = setup_fn
    if draw_fn is not None:
        found['draw'] = draw_fn
    return found


def _wants_input():
    return any(name in _s.callbacks for name in _EVENT_CALLBACKS)


def _call(name, event=None):
    fn = _s.callbacks.get(name)
    if fn is None:
        return
    takes = 0
    code = getattr(fn, '__code__', None)
    if code is not None:
        takes = code.co_argcount - (1 if hasattr(fn, '__self__') else 0)
    if takes >= 1:
        fn(event)
    else:
        fn()


def _user_traceback(tb):
    """The traceback from the student's own first frame on: how p5 called draw() is not their mistake."""
    while tb is not None and _os.path.dirname(_os.path.abspath(tb.tb_frame.f_code.co_filename)) == _P5_DIR:
        tb = tb.tb_next
    return tb


def _fail(exc):
    """draw() or an event function raised: the sketch stops, and the error is the program's."""
    _s.error = exc
    _s.looping = False
    _s.stopped = True
    if _s.timer is not None and _s.root is not None and not _s.root._destroyed:
        _s.root.after_cancel(_s.timer)
    _s.timer = None
    if not _s.in_loop:
        # No loop of ours to return through (mainloop could not wait, and
        # Coder keeps the window alive after the program instead): say it here.
        import traceback
        traceback.print_exception(type(exc), exc, _user_traceback(exc.__traceback__), file=_sys.stderr)
    if _s.root is not None:
        _s.root.quit()
    _sync_bindings()


def _guarded(name, event=None, before=None):
    if _s.stopped:
        return
    try:
        _s.matrix = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
        if before is not None:
            before()
        _publish()
        _call(name, event)
    except Exception as exc:
        _end_frame()
        _fail(exc)
        return
    _end_frame()


def _draw_frame():
    now = _time.monotonic()
    if _s.last_frame_start is not None:
        dt = now - _s.last_frame_start
        _s.delta_time = dt * 1000.0
        if dt > 0:
            fps = 1.0 / dt
            _s.measured_fps = fps if not _s.measured_fps else _s.measured_fps * 0.9 + fps * 0.1
    _s.last_frame_start = now
    _s.frame_count += 1
    _s.pmouse_x, _s.pmouse_y = _s.frame_mouse
    _s.matrix = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
    _publish()
    _call('draw')
    _s.frame_mouse = (_s.mouse_x, _s.mouse_y)


def _schedule(delay=None):
    if _s.timer is not None or _s.root is None or _s.root._destroyed or _s.stopped:
        return
    if delay is None:
        last = _s.last_frame_start if _s.last_frame_start is not None else _time.monotonic()
        delay = max(0.0, last + 1.0 / _s.target_fps - _time.monotonic())
    _s.timer = _s.root.after(int(delay * 1000), _tick)


def _tick():
    _s.timer = None
    if _s.stopped or _s.root is None or _s.root._destroyed:
        return
    if not (_s.looping or _s.redraw_pending or _s.frame_count == 0):
        return
    _s.redraw_pending = False
    try:
        _draw_frame()
    except Exception as exc:
        _end_frame()
        _fail(exc)
        return
    _end_frame()
    if _s.looping:
        _schedule()
    else:
        _sync_bindings()


# ── Events from the page ────────────────────────────────────────────────────

_BUTTONS = {1: LEFT, 2: CENTER, 3: RIGHT}
_KEYSYM_TO_KEY = {
    'Return': 'Enter', 'Escape': 'Escape', 'BackSpace': 'Backspace', 'Tab': 'Tab', 'space': ' ',
    'Left': 'ArrowLeft', 'Right': 'ArrowRight', 'Up': 'ArrowUp', 'Down': 'ArrowDown',
    'Delete': 'Delete', 'Insert': 'Insert', 'Home': 'Home', 'End': 'End', 'Prior': 'PageUp',
    'Next': 'PageDown', 'Caps_Lock': 'CapsLock', 'Shift_L': 'Shift', 'Shift_R': 'Shift',
    'Control_L': 'Control', 'Control_R': 'Control', 'Alt_L': 'Alt', 'Alt_R': 'Alt',
    'Meta_L': 'Meta', 'Meta_R': 'Meta',
}


class MouseEvent:
    """What mouse_wheel(event) is given: event.delta is positive scrolling down."""

    def __init__(self, x=0, y=0, button=LEFT, delta=0):
        self.x = x
        self.y = y
        self.button = button
        self.delta = delta

    def __repr__(self):
        return '<MouseEvent x=%s y=%s delta=%s>' % (self.x, self.y, self.delta)


class KeyEvent:
    def __init__(self, key, key_code):
        self.key = key
        self.key_code = key_code
        self.keyCode = key_code

    def __repr__(self):
        return '<KeyEvent key=%r key_code=%s>' % (self.key, self.key_code)


def _set_mouse(e):
    _s.mouse_x = int(e.x)
    _s.mouse_y = int(e.y)


def _on_motion(e):
    _set_mouse(e)
    held = bool(int(getattr(e, 'state', 0) or 0) & 0x700)
    if _s.mouse_is_pressed and not held:
        _s.mouse_is_pressed = False
    if held and _s.mouse_is_pressed:
        _guarded('mouse_dragged', MouseEvent(e.x, e.y, _s.mouse_button))
    else:
        _guarded('mouse_moved', MouseEvent(e.x, e.y, _s.mouse_button))


def _press(e):
    _set_mouse(e)
    _s.mouse_is_pressed = True
    _s.mouse_button = _BUTTONS.get(int(getattr(e, 'num', 1) or 1), LEFT)
    _guarded('mouse_pressed', MouseEvent(e.x, e.y, _s.mouse_button))


def _on_press(e):
    _press(e)


def _on_double(e):
    _press(e)
    _guarded('double_clicked', MouseEvent(e.x, e.y, _s.mouse_button))


def _on_release(e):
    _set_mouse(e)
    was = _s.mouse_is_pressed
    _s.mouse_is_pressed = False
    _guarded('mouse_released', MouseEvent(e.x, e.y, _s.mouse_button))
    if was:
        _guarded('mouse_clicked', MouseEvent(e.x, e.y, _s.mouse_button))


def _on_wheel(e):
    delta = -int(getattr(e, 'delta', 0) or 0) * 100 // 120
    _guarded('mouse_wheel', MouseEvent(e.x, e.y, _s.mouse_button, delta))


def _on_key_press(e):
    keysym = str(getattr(e, 'keysym', '') or '')
    char = str(getattr(e, 'char', '') or '')
    code = int(getattr(e, 'keycode', 0) or 0)
    name = _KEYSYM_TO_KEY.get(keysym)
    if name is None:
        name = char if len(char) == 1 and char.isprintable() else keysym
    if not code and len(name) == 1:
        code = ord(name.upper())
    if code in _s.keys_down:
        # The browser repeats a held key; p5 reports the press once.
        return
    _s.keys_down.add(code)
    _s.key = name
    _s.key_code = code
    _s.key_is_pressed = True
    _guarded('key_pressed', KeyEvent(name, code))
    if len(name) == 1 or name == 'Enter':
        _guarded('key_typed', KeyEvent(name, code))


def _on_key_release(e):
    code = int(getattr(e, 'keycode', 0) or 0)
    keysym = str(getattr(e, 'keysym', '') or '')
    char = str(getattr(e, 'char', '') or '')
    name = _KEYSYM_TO_KEY.get(keysym) or (char if len(char) == 1 else keysym)
    if not code and len(name) == 1:
        code = ord(name.upper())
    _s.keys_down.discard(code)
    _s.key_is_pressed = bool(_s.keys_down)
    _guarded('key_released', KeyEvent(name, code))


_CANVAS_BINDINGS = (
    ('<Motion>', _on_motion), ('<ButtonPress>', _on_press), ('<Double-ButtonPress-1>', _on_double),
    ('<ButtonRelease>', _on_release), ('<MouseWheel>', _on_wheel),
)
_ROOT_BINDINGS = (('<KeyPress>', _on_key_press), ('<KeyRelease>', _on_key_release))


def _sync_bindings():
    """Listen to the mouse and keys only while something could use them.

    A sketch that has stopped looping and defines no event functions can do
    nothing more, and with nothing bound the window's loop ends (tkinter's
    idle_exit), so the run finishes — and a book example ticks — instead of
    waiting for Stop.
    """
    canvas, root = _s.canvas, _s.root
    if canvas is None or root is None or canvas._destroyed or root._destroyed:
        return
    want = not _s.stopped and (_s.looping or _wants_input())
    if want == _s.bound:
        return
    _s.bound = want
    for seq, fn in _CANVAS_BINDINGS:
        if want:
            canvas.bind(seq, fn)
        else:
            canvas.unbind(seq)
    for seq, fn in _ROOT_BINDINGS:
        if want:
            root.bind(seq, fn)
        else:
            root.unbind(seq)


# ── Starting the sketch ─────────────────────────────────────────────────────

def run(sketch_setup=None, sketch_draw=None, frame_rate=None, **_options):
    """Start the sketch: setup() once, then draw() over and over."""
    if _s.started:
        return
    _start(_sys._getframe(1).f_globals, sketch_setup, sketch_draw, frame_rate)


def _start(ns, setup_fn=None, draw_fn=None, fps=None):
    _s.started = True
    _s.ns = ns
    _s.callbacks = _find_callbacks(ns, setup_fn, draw_fn)
    if fps:
        _s.target_fps = min(max(_f(fps, 'frame_rate'), 1.0), 120.0)
    _s.headless = _tk._host is None
    _s.start_time = _time.monotonic()
    if not _s.headless:
        _make_window()
        # The window's loop (and Coder's, after the program) ends once the
        # sketch can do nothing more: see _sync_bindings.
        _tk._app.idle_exit = True
    if 'draw' not in _s.callbacks:
        _s.looping = False
    _publish()
    _s.matrix = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
    _call('setup')
    _end_frame()
    if _s.headless:
        _run_headless()
        return
    if 'draw' in _s.callbacks:
        _s.root.after(0, _tick)
    _sync_bindings()
    if 'draw' not in _s.callbacks and not _wants_input():
        _tk._app.flush()
        return
    _s.in_loop = _tk._can_block()
    try:
        _s.root.mainloop()
    finally:
        _s.in_loop = False
    if _s.error is not None:
        exc, _s.error = _s.error, None
        raise exc.with_traceback(_user_traceback(exc.__traceback__))


def _run_headless():
    if 'draw' not in _s.callbacks:
        return
    for i in range(max(1, _s.test_frames)):
        if i > 0 and not (_s.looping or _s.redraw_pending):
            break
        _s.redraw_pending = False
        try:
            _draw_frame()
        finally:
            _end_frame()


def _coder_autorun(ns):
    """After the program's last line: start a sketch that defined setup()/draw() but never called run()."""
    if _s.started:
        return
    callbacks = _find_callbacks(ns)
    if 'setup' not in callbacks and 'draw' not in callbacks and not _s.touched:
        return
    _start(ns)


# ── For the tester (utils/tkinterHeadless.ts) ───────────────────────────────

def _coder_test_config(frames=1, mouse=None, pressed=False, seed=0):
    """How a marked run goes: how many frames, where the mouse is, and the same random numbers."""
    _s.test_frames = max(1, min(int(frames or 1), 600))
    if mouse is not None:
        mx, my = mouse
        _s.mouse_x, _s.mouse_y = int(mx), int(my)
        _s.frame_mouse = (_s.mouse_x, _s.mouse_y)
    _s.mouse_is_pressed = bool(pressed)
    _s.rng.seed(seed)
    _s.noise_rng.seed(seed)
    _s.perlin = None
    _random_module.seed(seed)


def _coder_capture():
    """Everything the sketch's canvas shows, as the operations that draw it (JSON)."""
    return _json.dumps({
        'w': _s.width, 'h': _s.height, 'ops': _s.capture,
        'images': {k: list(v) for k, v in _s.images.items()},
        'started': _s.started,
    })


# ── p5.js's spellings ───────────────────────────────────────────────────────

createCanvas = create_canvas
resizeCanvas = resize_canvas
noFill = no_fill
noStroke = no_stroke
strokeWeight = stroke_weight
strokeCap = stroke_cap
strokeJoin = stroke_join
rectMode = rect_mode
ellipseMode = ellipse_mode
angleMode = angle_mode
colorMode = color_mode
lerpColor = lerp_color
pushMatrix = push_matrix
popMatrix = pop_matrix
pushStyle = push_style
popStyle = pop_style
resetMatrix = reset_matrix
applyMatrix = apply_matrix
shearX = shear_x
shearY = shear_y
beginShape = begin_shape
endShape = end_shape
bezierVertex = bezier_vertex
quadraticVertex = quadratic_vertex
curveVertex = curve_vertex
beginContour = begin_contour
endContour = end_contour
textSize = text_size
textLeading = text_leading
textFont = text_font
textStyle = text_style
textAlign = text_align
textWidth = text_width
textAscent = text_ascent
textDescent = text_descent
loadImage = load_image
imageMode = image_mode
noCursor = no_cursor
randomSeed = random_seed
randomGaussian = random_gaussian
noiseSeed = noise_seed
noiseDetail = noise_detail
createVector = create_vector
keyIsDown = key_is_down
frameRate = frame_rate
noLoop = no_loop
isLooping = is_looping
