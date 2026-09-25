"""tkinter for Coder: the standard tkinter API, drawn in the browser.

Pyodide has no Tcl/Tk, so this package stands in for the real one. Widgets,
variables, bindings and the geometry managers are ordinary Python objects that
keep their own state; what the student sees is drawn by a small renderer in the
page (src/utils/tkinterRenderer.ts), which this module talks to through four
calls on `_coder_tk_host`:

    flush(ops_json)        apply a batch of drawing operations
    query(json) -> json    ask the page something it alone knows (a size, a caret)
    poll() -> json         collect the clicks and key presses since last time
    dialog(json) -> promise / dialog_sync(json) -> json   a message box or prompt

Operations are queued and sent in batches, so building a window of fifty
widgets is one trip to the page, not fifty.

mainloop() is a real loop. When the browser supports JSPI it pauses Python for a
few milliseconds at a time (`run_sync` on a timer promise), which lets the page
paint and deliver events without the program noticing; when it does not,
mainloop() returns straight away and the Coder bootstrap keeps the window alive
from an async loop instead.

Without `_coder_tk_host` (native Python in the test suite, or the headless
tester worker) the same code runs with nothing drawn: every operation is
dropped, queries answer with sensible defaults, and mainloop() returns at once.
"""

import sys as _sys
import os as _os
import re as _re
import json as _json
import time as _time
import math as _math
import base64 as _base64
import heapq as _heapq
import traceback as _traceback
import enum as _enum
import zlib as _zlib
import struct as _struct

from tkinter.constants import *

TkVersion = 8.6
TclVersion = 8.6
READABLE = 2
WRITABLE = 4
EXCEPTION = 8
wantobjects = 1

_support_default_root = True
_default_root = None

_SHIM_DIR = _os.path.dirname(_os.path.abspath(__file__))


class TclError(Exception):
    pass


# ── The page ────────────────────────────────────────────────────────────────

try:
    import _coder_tk_host as _host
except ImportError:
    _host = None

try:
    from pyodide.ffi import can_run_sync as _can_run_sync, run_sync as _run_sync
except ImportError:
    _can_run_sync = None
    _run_sync = None

_real_sleep = getattr(_time, '_coder_real_sleep', _time.sleep)


def _can_block():
    """Whether Python can pause here and let the page run (JSPI)."""
    return _host is not None and _can_run_sync is not None and bool(_can_run_sync())


def _check_stop():
    if _host is not None and _host.should_stop():
        raise SystemExit()


def _pause(seconds):
    """Give the page its thread back for `seconds`, so it can paint and queue events."""
    _app.flush()
    if _can_block():
        _run_sync(_host.sleep(max(0, int(seconds * 1000))))
    elif seconds > 0:
        _real_sleep(seconds)
    _check_stop()


def _coder_patched_sleep(seconds):
    # time.sleep() in a tkinter program would otherwise freeze the tab: the
    # page shares Python's thread. Pausing through JSPI keeps it painting.
    try:
        seconds = float(seconds)
    except (TypeError, ValueError):
        raise TypeError("'%s' object cannot be interpreted as a number" % type(seconds).__name__)
    if seconds < 0:
        raise ValueError('sleep length must be non-negative')
    _pause(seconds)


def _coder_patch_sleep():
    if not _can_block():
        return
    if not hasattr(_time, '_coder_real_sleep'):
        _time._coder_real_sleep = _time.sleep
    _time.sleep = _coder_patched_sleep


# ── Small conversions ───────────────────────────────────────────────────────

def _getboolean(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    s = str(value).strip().lower()
    if s in ('1', 'true', 'yes', 'on', 't', 'tr', 'tru', 'y', 'ye'):
        return True
    if s in ('0', 'false', 'no', 'off', 'f', 'fa', 'fal', 'fals', 'n', 'of'):
        return False
    try:
        return float(s) != 0
    except ValueError:
        raise TclError('expected boolean value but got "%s"' % value)


def getboolean(s):
    return _getboolean(s)


def getint(s):
    try:
        return int(s)
    except (TypeError, ValueError):
        raise TclError('expected integer but got "%s"' % s)


def getdouble(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        raise TclError('expected floating-point number but got "%s"' % s)


_DISTANCE = _re.compile(r'\s*(-?\d+(?:\.\d*)?|-?\.\d+)\s*([cimp]?)\s*$')
_UNITS = {'': 1.0, 'c': 37.795, 'i': 96.0, 'm': 3.7795, 'p': 96.0 / 72.0}


def _fpx(value, default=0.0):
    """A Tk screen distance ("10", "2c", "1i", 12) in pixels, as a float."""
    if value is None or value == '':
        return float(default)
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    m = _DISTANCE.match(str(value))
    if not m:
        raise TclError('bad screen distance "%s"' % value)
    return float(m.group(1)) * _UNITS[m.group(2)]


def _px(value, default=0):
    return int(round(_fpx(value, default)))


def _pad(value):
    """padx/pady: one number for both sides, or a pair."""
    if value is None or value == '':
        return [0, 0]
    if isinstance(value, (tuple, list)):
        if len(value) == 1:
            n = _px(value[0])
            return [n, n]
        return [_px(value[0]), _px(value[1])]
    if isinstance(value, str) and len(value.split()) == 2:
        a, b = value.split()
        return [_px(a), _px(b)]
    n = _px(value)
    return [n, n]


def _splitlist(value):
    """Split a Tcl list: words separated by spaces, braces grouping."""
    if isinstance(value, (tuple, list)):
        return tuple(value)
    s = str(value)
    items = []
    i, n = 0, len(s)
    while i < n:
        while i < n and s[i].isspace():
            i += 1
        if i >= n:
            break
        if s[i] == '{':
            depth, j = 1, i + 1
            while j < n and depth:
                if s[j] == '{':
                    depth += 1
                elif s[j] == '}':
                    depth -= 1
                j += 1
            items.append(s[i + 1:j - 1])
            i = j
        elif s[i] == '"':
            j = s.find('"', i + 1)
            j = n if j < 0 else j
            items.append(s[i + 1:j])
            i = j + 1
        else:
            j = i
            while j < n and not s[j].isspace():
                j += 1
            items.append(s[i:j])
            i = j
    return tuple(items)


def _cnfmerge(cnf, kw=None):
    out = {}
    if isinstance(cnf, dict):
        out.update(cnf)
    elif isinstance(cnf, (tuple, list)):
        for c in cnf:
            if isinstance(c, dict):
                out.update(c)
    if kw:
        out.update(kw)
    return out


_ALIASES = {'bg': 'background', 'fg': 'foreground', 'bd': 'borderwidth',
            'invcmd': 'invalidcommand', 'vcmd': 'validatecommand'}


def _optname(key):
    key = str(key)
    if key.startswith('-'):
        key = key[1:]
    if key.endswith('_'):
        key = key[:-1]
    return _ALIASES.get(key, key)


# ── Colours ─────────────────────────────────────────────────────────────────

_SYSTEM_COLORS = {
    'systembuttonface': '#f0f0f0', 'systembuttontext': '#000000',
    'systemwindow': '#ffffff', 'systemwindowtext': '#000000',
    'systemwindowframe': '#646464', 'systemhighlight': '#0078d7',
    'systemhighlighttext': '#ffffff', 'systemdisabledtext': '#6d6d6d',
    'systembuttonshadow': '#a0a0a0', 'systembuttonhighlight': '#ffffff',
    'system3dface': '#f0f0f0', 'system3dlight': '#e3e3e3',
    'system3ddarkshadow': '#696969', 'systemmenu': '#f0f0f0',
    'systemmenutext': '#000000', 'systeminfobackground': '#ffffe1',
    'systeminfotext': '#000000', 'systemscrollbar': '#c8c8c8',
    'systemactivecaption': '#99b4d1', 'systeminactivecaption': '#bfcddb',
    'systemappworkspace': '#ababab', 'systembackground': '#000000',
    'systemgraytext': '#6d6d6d', 'systemtransparent': 'transparent',
}
# X11 names Tk knows that CSS does not (or spells differently).
_X11_COLORS = {
    'lightgoldenrod': '#eedd82', 'lightslateblue': '#8470ff', 'violetred': '#d02090',
    'navyblue': '#000080', 'darkgrey': '#a9a9a9', 'lightgrey': '#d3d3d3',
    'mediumforestgreen': '#6b8e23', 'x11gray': '#bebebe',
}
_SHADE = {'1': 100, '2': 93, '3': 80, '4': 55}


def _color(value):
    """A Tk colour as CSS. '' stays '' (transparent / no colour)."""
    if value is None:
        return None
    s = str(value).strip()
    if s == '':
        return ''
    if s.startswith('#'):
        h = s[1:]
        if len(h) == 9:
            return '#' + h[0:2] + h[3:5] + h[6:8]
        if len(h) == 12:
            return '#' + h[0:2] + h[4:6] + h[8:10]
        return s
    k = s.lower().replace(' ', '')
    if k in _SYSTEM_COLORS:
        return _SYSTEM_COLORS[k]
    m = _re.fullmatch(r'gr[ae]y(\d{1,3})', k)
    if m:
        level = max(0, min(100, int(m.group(1))))
        v = int(round(level * 255 / 100))
        return '#%02x%02x%02x' % (v, v, v)
    m = _re.fullmatch(r'([a-z]+)([1-4])', k)
    if m:
        base = _X11_COLORS.get(m.group(1), m.group(1))
        pct = _SHADE[m.group(2)]
        return base if pct == 100 else 'color-mix(in srgb, %s %d%%, black)' % (base, pct)
    return _X11_COLORS.get(k, k)


# ── Fonts ───────────────────────────────────────────────────────────────────

def _base_font(**over):
    spec = {'family': 'Segoe UI', 'size': 9, 'weight': 'normal', 'slant': 'roman',
            'underline': 0, 'overstrike': 0}
    spec.update(over)
    return spec


_named_fonts = {
    'TkDefaultFont': _base_font(),
    'TkTextFont': _base_font(),
    'TkMenuFont': _base_font(),
    'TkIconFont': _base_font(),
    'TkCaptionFont': _base_font(size=9, weight='bold'),
    'TkSmallCaptionFont': _base_font(size=8),
    'TkTooltipFont': _base_font(size=8),
    'TkHeadingFont': _base_font(weight='bold'),
    'TkFixedFont': _base_font(family='Courier New', size=10),
}

_FAMILIES = {
    'helvetica': 'Helvetica, Arial, sans-serif',
    'arial': 'Arial, Helvetica, sans-serif',
    'arial black': '"Arial Black", Arial, sans-serif',
    'times': '"Times New Roman", Times, serif',
    'times new roman': '"Times New Roman", Times, serif',
    'courier': '"Courier New", Courier, monospace',
    'courier new': '"Courier New", Courier, monospace',
    'consolas': 'Consolas, "Courier New", monospace',
    'monaco': 'Monaco, Consolas, monospace',
    'segoe ui': '"Segoe UI", system-ui, sans-serif',
    'comic sans ms': '"Comic Sans MS", "Comic Sans", cursive',
    'verdana': 'Verdana, sans-serif',
    'tahoma': 'Tahoma, Verdana, sans-serif',
    'georgia': 'Georgia, serif',
    'impact': 'Impact, sans-serif',
    'calibri': 'Calibri, Carlito, sans-serif',
    'cambria': 'Cambria, Georgia, serif',
    'trebuchet ms': '"Trebuchet MS", sans-serif',
    'system': 'system-ui, sans-serif',
    'fixed': 'monospace',
    'terminal': 'monospace',
    'ms sans serif': 'system-ui, sans-serif',
}


def _font_spec(font):
    if font is None or font == '':
        return None
    spec_fn = getattr(font, '_coder_spec', None)
    if spec_fn is not None:
        return spec_fn()
    if isinstance(font, str):
        if font in _named_fonts:
            return dict(_named_fonts[font])
        parts = list(_splitlist(font))
    elif isinstance(font, (tuple, list)):
        parts = list(font)
    else:
        parts = [str(font)]
    if not parts:
        return None
    spec = _base_font()
    spec['family'] = str(parts[0]) if str(parts[0]) else 'Segoe UI'
    rest = parts[1:]
    if rest:
        try:
            spec['size'] = int(round(float(rest[0])))
            rest = rest[1:]
        except (TypeError, ValueError):
            pass
    words = []
    for r in rest:
        words.extend(str(r).split())
    for w in words:
        w = w.lower()
        if w == 'bold':
            spec['weight'] = 'bold'
        elif w == 'italic':
            spec['slant'] = 'italic'
        elif w == 'underline':
            spec['underline'] = 1
        elif w == 'overstrike':
            spec['overstrike'] = 1
        elif w == 'roman':
            spec['slant'] = 'roman'
        elif w == 'normal':
            spec['weight'] = 'normal'
    return spec


def _family_css(family):
    key = str(family).strip().lower()
    if key in _FAMILIES:
        return _FAMILIES[key]
    return '"%s", sans-serif' % str(family).replace('"', '')


def _font_css(font, fallback='TkDefaultFont'):
    spec = _font_spec(font) or dict(_named_fonts.get(fallback, _named_fonts['TkDefaultFont']))
    size = spec.get('size', 9) or 9
    size_css = '%spt' % size if size > 0 else '%spx' % (-size)
    css = '%s%s%s %s' % ('italic ' if spec.get('slant') == 'italic' else '',
                         'bold ' if spec.get('weight') == 'bold' else '',
                         size_css, _family_css(spec.get('family', 'Segoe UI')))
    deco = ' '.join(d for d, on in (('underline', spec.get('underline')),
                                    ('line-through', spec.get('overstrike'))) if on)
    return [css, deco]


_CURSORS = {
    'arrow': 'default', 'left_ptr': 'default', 'top_left_arrow': 'default',
    'hand1': 'pointer', 'hand2': 'pointer', 'xterm': 'text', 'ibeam': 'text',
    'watch': 'wait', 'clock': 'wait', 'crosshair': 'crosshair', 'cross': 'crosshair',
    'tcross': 'crosshair', 'plus': 'cell', 'fleur': 'move', 'size': 'move',
    'question_arrow': 'help', 'no': 'not-allowed', 'circle': 'not-allowed',
    'x_cursor': 'not-allowed', 'pirate': 'not-allowed',
    'sb_h_double_arrow': 'ew-resize', 'sb_v_double_arrow': 'ns-resize',
    'size_we': 'ew-resize', 'size_ns': 'ns-resize', 'dotbox': 'cell', 'target': 'crosshair',
}


def _cursor_css(value):
    if not value:
        return ''
    return _CURSORS.get(str(value).lower(), 'default')


def _image_name(value):
    if value is None or value == '':
        return None
    name = getattr(value, 'name', None)
    if name is not None:
        return name
    return str(value)


_ANCHORS = ('n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw', 'center')


def _anchor(value, default='center'):
    s = str(value or default).lower()
    if s == 'c':
        s = 'center'
    if s not in _ANCHORS:
        raise TclError('bad anchor "%s": must be n, ne, e, se, s, sw, w, nw, or center' % value)
    return s


def _state_str(value):
    return str(value or 'normal')


# ── Variables ───────────────────────────────────────────────────────────────

class Variable:
    """A Tcl variable: a value that widgets and traces watch."""
    _default = ''

    def __init__(self, master=None, value=None, name=None):
        if name is not None and not isinstance(name, str):
            raise TypeError('name must be a string')
        if name is None:
            _app.var_seq += 1
            name = 'PY_VAR%d' % (_app.var_seq - 1)
        self._name = name
        self._root = master
        self._tk = master.tk if master is not None and hasattr(master, 'tk') else None
        self._traces = []
        self._watchers = []
        existing = _app.vars.get(name)
        if existing is not None and value is None:
            self._value = existing._value
        else:
            self._value = self._default if value is None else value
        _app.vars[name] = self

    def __str__(self):
        return self._name

    def __repr__(self):
        return '<%s %r>' % (type(self).__name__, self._name)

    def __eq__(self, other):
        return isinstance(other, Variable) and type(self) is type(other) and self._name == other._name

    def __hash__(self):
        return hash(self._name)

    def set(self, value):
        self._store(value)

    initialize = set

    def _store(self, value, source=None):
        self._value = value
        for other in list(_app.vars_by_name(self._name)):
            if other is not self:
                other._value = value
        for widget in list(self._watchers):
            if widget is not source and not widget._destroyed:
                widget._var_changed(self)
        self._fire('write')

    def get(self):
        self._fire('read')
        return self._value

    def _fire(self, op):
        for modes, callback, cbname, legacy in list(self._traces):
            if op in modes:
                mode = {'write': 'w', 'read': 'r', 'unset': 'u'}[op] if legacy else op
                _app.deliver(callback, self._name, '', mode)

    def _watch(self, widget):
        if widget not in self._watchers:
            self._watchers.append(widget)

    def _unwatch(self, widget):
        if widget in self._watchers:
            self._watchers.remove(widget)

    def trace_add(self, mode, callback):
        modes = (mode,) if isinstance(mode, str) else tuple(mode)
        for m in modes:
            if m not in ('array', 'read', 'write', 'unset'):
                raise TclError('bad operation "%s": must be array, read, unset, or write' % m)
        cbname = _app.register(callback)
        self._traces.append((modes, callback, cbname, False))
        return cbname

    def trace_remove(self, mode, cbname):
        self._traces = [t for t in self._traces if t[2] != cbname]

    def trace_info(self):
        return [(t[0], t[2]) for t in self._traces if not t[3]]

    def trace_variable(self, mode, callback):
        letters = {'w': 'write', 'r': 'read', 'u': 'unset'}
        modes = tuple(letters[c] for c in str(mode) if c in letters)
        cbname = _app.register(callback)
        self._traces.append((modes, callback, cbname, True))
        return cbname

    trace = trace_variable

    def trace_vdelete(self, mode, cbname):
        self._traces = [t for t in self._traces if t[2] != cbname]

    def trace_vinfo(self):
        return [(''.join(m[0] for m in t[0]), t[2]) for t in self._traces if t[3]]


class StringVar(Variable):
    _default = ''

    def get(self):
        value = Variable.get(self)
        return value if isinstance(value, str) else str(value)


class IntVar(Variable):
    _default = 0

    def get(self):
        value = Variable.get(self)
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, int):
            return value
        try:
            return int(str(value).strip())
        except (TypeError, ValueError):
            pass
        try:
            return int(float(str(value).strip()))
        except (TypeError, ValueError):
            raise TclError('expected floating-point number but got "%s"' % value)


class DoubleVar(Variable):
    _default = 0.0

    def get(self):
        value = Variable.get(self)
        try:
            return float(value)
        except (TypeError, ValueError):
            raise TclError('expected floating-point number but got "%s"' % value)


class BooleanVar(Variable):
    _default = False

    def set(self, value):
        self._store(_getboolean(value))

    initialize = set

    def get(self):
        return _getboolean(Variable.get(self))


def _var_value(var):
    """The raw value of a variable option, which may be a Variable or its name."""
    if isinstance(var, Variable):
        return var._value
    v = _app.vars.get(str(var)) if var else None
    return v._value if v is not None else ''


def _as_variable(value, factory=StringVar):
    if value is None or value == '':
        return None
    if isinstance(value, Variable):
        return value
    existing = _app.vars.get(str(value))
    if existing is not None:
        return existing
    return factory(name=str(value))


# ── Events ──────────────────────────────────────────────────────────────────

class EventType(str, _enum.Enum):
    KeyPress = '2'
    Key = KeyPress
    KeyRelease = '3'
    ButtonPress = '4'
    Button = ButtonPress
    ButtonRelease = '5'
    Motion = '6'
    Enter = '7'
    Leave = '8'
    FocusIn = '9'
    FocusOut = '10'
    Keymap = '11'
    Expose = '12'
    GraphicsExpose = '13'
    NoExpose = '14'
    Visibility = '15'
    Create = '16'
    Destroy = '17'
    Unmap = '18'
    Map = '19'
    MapRequest = '20'
    Reparent = '21'
    Configure = '22'
    ConfigureRequest = '23'
    Gravity = '24'
    ResizeRequest = '25'
    Circulate = '26'
    CirculateRequest = '27'
    Property = '28'
    SelectionClear = '29'
    SelectionRequest = '30'
    Selection = '31'
    Colormap = '32'
    ClientMessage = '33'
    Mapping = '34'
    VirtualEvent = '35'
    Activate = '36'
    Deactivate = '37'
    MouseWheel = '38'

    def __str__(self):
        return self.name


class Event:
    """The object a binding is called with, as in tkinter."""

    def __init__(self):
        self.serial = 0
        self.num = '??'
        self.focus = False
        self.height = '??'
        self.width = '??'
        self.keycode = '??'
        self.state = 0
        self.time = int(_time.monotonic() * 1000) & 0x7fffffff
        self.x = '??'
        self.y = '??'
        self.x_root = '??'
        self.y_root = '??'
        self.char = '??'
        self.send_event = False
        self.keysym = '??'
        self.keysym_num = '??'
        self.type = EventType.VirtualEvent
        self.widget = None
        self.delta = 0

    def __repr__(self):
        attrs = {k: v for k, v in self.__dict__.items() if v != '??'}
        parts = []
        if self.char and self.char != '??':
            parts.append('char=%r' % self.char)
        if self.keysym != '??':
            parts.append('keysym=%s' % self.keysym)
        if self.num != '??':
            parts.append('num=%s' % self.num)
        if self.delta:
            parts.append('delta=%s' % self.delta)
        for k in ('x', 'y', 'width', 'height'):
            if k in attrs and attrs[k] != '??':
                parts.append('%s=%s' % (k, attrs[k]))
        return '<%s event %s>' % (getattr(self.type, 'name', self.type), ' '.join(parts))


_EVENT_TYPES = {
    'ButtonPress': 'ButtonPress', 'Button': 'ButtonPress', 'ButtonRelease': 'ButtonRelease',
    'KeyPress': 'KeyPress', 'Key': 'KeyPress', 'KeyRelease': 'KeyRelease',
    'Motion': 'Motion', 'Enter': 'Enter', 'Leave': 'Leave', 'FocusIn': 'FocusIn',
    'FocusOut': 'FocusOut', 'MouseWheel': 'MouseWheel', 'Configure': 'Configure',
    'Destroy': 'Destroy', 'Map': 'Map', 'Unmap': 'Unmap', 'Visibility': 'Visibility',
    'Expose': 'Expose', 'Activate': 'Activate', 'Deactivate': 'Deactivate',
    'Property': 'Property', 'Circulate': 'Circulate', 'Colormap': 'Colormap',
    'Gravity': 'Gravity', 'Reparent': 'Reparent', 'Create': 'Create',
}
_MODIFIERS = {
    'Control': 'Control', 'Shift': 'Shift', 'Lock': 'Lock', 'Alt': 'Alt', 'Option': 'Alt',
    'Meta': 'Meta', 'M': 'Meta', 'Command': 'Meta', 'Mod1': 'Alt', 'M1': 'Alt',
    'Mod2': 'Mod2', 'M2': 'Mod2', 'Mod3': 'Mod3', 'Mod4': 'Mod4', 'Mod5': 'Mod5',
    'Double': 'Double', 'Triple': 'Triple', 'Quadruple': 'Quadruple', 'Any': 'Any',
    'Extended': 'Extended',
    'B1': 'B1', 'Button1': 'B1', 'B2': 'B2', 'Button2': 'B2', 'B3': 'B3', 'Button3': 'B3',
    'B4': 'B4', 'Button4': 'B4', 'B5': 'B5', 'Button5': 'B5',
}
_KEY_NAMES = {
    'Enter': 'Return', 'Escape': 'Escape', 'Backspace': 'BackSpace', 'Tab': 'Tab',
    ' ': 'space', 'ArrowLeft': 'Left', 'ArrowRight': 'Right', 'ArrowUp': 'Up',
    'ArrowDown': 'Down', 'Delete': 'Delete', 'Insert': 'Insert', 'Home': 'Home',
    'End': 'End', 'PageUp': 'Prior', 'PageDown': 'Next', 'CapsLock': 'Caps_Lock',
    'NumLock': 'Num_Lock', 'ScrollLock': 'Scroll_Lock', 'Pause': 'Pause',
    'PrintScreen': 'Print', 'ContextMenu': 'App', 'Clear': 'Clear', 'Help': 'Help',
    'AltGraph': 'ISO_Level3_Shift', 'Cancel': 'Cancel',
}
_PUNCTUATION = {
    '!': 'exclam', '"': 'quotedbl', '#': 'numbersign', '$': 'dollar', '%': 'percent',
    '&': 'ampersand', "'": 'apostrophe', '(': 'parenleft', ')': 'parenright',
    '*': 'asterisk', '+': 'plus', ',': 'comma', '-': 'minus', '.': 'period',
    '/': 'slash', ':': 'colon', ';': 'semicolon', '<': 'less', '=': 'equal',
    '>': 'greater', '?': 'question', '@': 'at', '[': 'bracketleft', '\\': 'backslash',
    ']': 'bracketright', '^': 'asciicircum', '_': 'underscore', '`': 'grave',
    '{': 'braceleft', '|': 'bar', '}': 'braceright', '~': 'asciitilde', '£': 'sterling',
    '€': 'EuroSign', '¬': 'notsign',
}
_KEYSYMS = set(_KEY_NAMES.values()) | set(_PUNCTUATION.values()) | {
    'Shift_L', 'Shift_R', 'Control_L', 'Control_R', 'Alt_L', 'Alt_R', 'Meta_L', 'Meta_R',
    'Super_L', 'Super_R', 'Win_L', 'Win_R', 'Menu', 'Linefeed', 'Break', 'Page_Up',
    'Page_Down', 'KP_Enter', 'KP_Add', 'KP_Subtract', 'KP_Multiply', 'KP_Divide',
    'KP_Decimal', 'KP_Equal', 'ISO_Left_Tab', 'Select', 'Execute', 'Undo', 'Redo',
} | {'F%d' % i for i in range(1, 36)} | {'KP_%d' % i for i in range(10)}
_KEYSYM_ALIASES = {'Page_Up': 'Prior', 'Page_Down': 'Next'}
_CHAR_FOR_KEYSYM = {'Return': '\r', 'BackSpace': '\x08', 'Tab': '\t', 'Escape': '\x1b',
                    'space': ' ', 'Delete': '\x7f'}


def _keysym_for(key, code=''):
    if key in ('Shift', 'Control', 'Alt', 'Meta'):
        return key + ('_R' if str(code).endswith('Right') else '_L')
    if key in _KEY_NAMES:
        return _KEY_NAMES[key]
    if len(key) == 1:
        return _PUNCTUATION.get(key, key)
    return key


def _valid_keysym(detail):
    return len(detail) == 1 or detail in _KEYSYMS


def _parse_sequence(sequence):
    """'<Control-Button-1>' -> ('ButtonPress', '1', frozenset({'Control'}), 1)."""
    if not isinstance(sequence, str) or sequence == '':
        raise TclError('no events specified in binding')
    if sequence.startswith('<<'):
        if not sequence.endswith('>>') or len(sequence) <= 4:
            raise TclError('bad event pattern "%s"' % sequence)
        return ('Virtual', sequence[2:-2], frozenset(), 1)
    if not sequence.startswith('<'):
        ch = sequence[-1]
        return ('KeyPress', _PUNCTUATION.get(ch, 'space' if ch == ' ' else ch), frozenset(), 1)
    groups = _re.findall(r'<([^<>]+)>', sequence)
    if not groups:
        raise TclError('missing ">" in binding "%s"' % sequence)
    body = groups[-1]
    tokens = body.split('-')
    if body.endswith('-') and len(tokens) > 1:
        tokens = tokens[:-2] + ['minus']
    mods = set()
    count = 1
    etype = None
    detail = None
    for i, tok in enumerate(tokens):
        last = i == len(tokens) - 1
        if etype is None and detail is None and not last and tok in _MODIFIERS:
            m = _MODIFIERS[tok]
            if m == 'Double':
                count = 2
            elif m == 'Triple':
                count = 3
            elif m == 'Quadruple':
                count = 4
            else:
                mods.add(m)
            continue
        if etype is None and detail is None and tok in _EVENT_TYPES:
            etype = _EVENT_TYPES[tok]
            continue
        if detail is None:
            detail = tok
            continue
        # Two words neither a modifier nor an event type: Tk names the first.
        raise TclError('bad event type or keysym "%s"' % detail)
    if etype is None:
        if detail is None:
            raise TclError('no event type or button # or keysym')
        if detail in ('1', '2', '3', '4', '5'):
            etype = 'ButtonPress'
        else:
            if not _valid_keysym(detail):
                raise TclError('bad event type or keysym "%s"' % detail)
            etype = 'KeyPress'
    elif detail is not None:
        if etype in ('ButtonPress', 'ButtonRelease'):
            if detail not in ('1', '2', '3', '4', '5'):
                raise TclError('bad button number "%s"' % detail)
        elif etype in ('KeyPress', 'KeyRelease'):
            if not _valid_keysym(detail):
                raise TclError('bad event type or keysym "%s"' % detail)
        else:
            raise TclError('specified keysym "%s" for non-key event' % detail)
    detail = _KEYSYM_ALIASES.get(detail, detail)
    return (etype, detail, frozenset(mods), count)


def _match_score(pattern, etype, detail, mods, count):
    petype, pdetail, pmods, pcount = pattern
    if petype != etype:
        return -1
    if pdetail is not None and pdetail != detail:
        return -1
    if pcount > count:
        return -1
    for m in pmods:
        if m != 'Any' and m not in mods:
            return -1
    return (100 if pdetail is not None else 0) + pcount * 10 + len(pmods)


_WANT_FOR_TYPE = {
    'ButtonPress': 'press', 'ButtonRelease': 'release', 'Motion': 'motion',
    'Enter': 'cross', 'Leave': 'cross', 'KeyPress': 'key', 'KeyRelease': 'keyup',
    'FocusIn': 'focus', 'FocusOut': 'focus', 'MouseWheel': 'wheel', 'Configure': 'configure',
}


class _BindingTable:
    """Bindings for one tag: pattern -> [(funcid, func)], in the order they were bound."""

    def __init__(self):
        self.entries = {}
        self.sequences = {}

    def bind(self, sequence, func, add, funcid):
        pattern = _parse_sequence(sequence)
        if not add or pattern not in self.entries:
            self.entries[pattern] = []
        self.entries[pattern].append((funcid, func))
        self.sequences[pattern] = sequence
        return pattern

    def unbind(self, sequence, funcid=None):
        pattern = _parse_sequence(sequence)
        if pattern not in self.entries:
            return
        if funcid is None:
            del self.entries[pattern]
            self.sequences.pop(pattern, None)
        else:
            self.entries[pattern] = [e for e in self.entries[pattern] if e[0] != funcid]
            if not self.entries[pattern]:
                del self.entries[pattern]
                self.sequences.pop(pattern, None)

    def best(self, etype, detail, mods, count):
        best_score, best_funcs = -1, None
        for pattern, funcs in self.entries.items():
            score = _match_score(pattern, etype, detail, mods, count)
            if score > best_score:
                best_score, best_funcs = score, funcs
        return best_funcs

    def wants(self):
        out = set()
        for (etype, detail, mods, count) in self.entries:
            kind = _WANT_FOR_TYPE.get(etype)
            if kind:
                out.add(kind)
            if etype == 'ButtonPress' and detail in (None, '3'):
                out.add('press3')
        return out


def _mods_from_state(state):
    mods = set()
    if state & 0x1:
        mods.add('Shift')
    if state & 0x2:
        mods.add('Lock')
    if state & 0x4:
        mods.add('Control')
    if state & 0x8:
        mods.add('Alt')
    if state & 0x10:
        mods.add('Meta')
    if state & 0x100:
        mods.add('B1')
    if state & 0x200:
        mods.add('B2')
    if state & 0x400:
        mods.add('B3')
    return mods


# ── The application: every widget, every timer, every queued operation ─────

class _App:
    def __init__(self):
        self.widgets = {}
        self.next_id = 1
        self.ops = []
        self.dirty = {}
        self.timers = []
        self.timer_seq = 0
        self.timer_funcs = {}
        self.idle = []
        self.bindings = {}
        self.commands = {}
        self.vars = {}
        self.roots = []
        self.quit_flag = False
        self.loop_depth = 0
        self.mainloop_called = False
        self.mainloop_deferred = False
        self.want_sent = None
        self.pointer = (0, 0)
        self.clipboard = None
        self.var_seq = 0
        self.after_seq = 0
        self.cmd_seq = 0
        self.image_seq = 0
        self.images = {}
        self.focus = None
        self.dirty_images = {}
        self.option_db = []
        self.ttk_styles = {}
        self.ttk_maps = {}
        self.ttk_theme = 'vista'
        self.notices = set()

    # ids and registries
    def new_id(self):
        n = self.next_id
        self.next_id += 1
        return n

    def vars_by_name(self, name):
        v = self.vars.get(name)
        return [v] if v is not None else []

    def register(self, func):
        self.cmd_seq += 1
        name = '%d%s' % (self.cmd_seq, getattr(func, '__name__', 'lambda'))
        self.commands[name] = func
        return name

    # talking to the page
    def op(self, *args):
        self.ops.append(list(args))

    def mark(self, widget):
        if not widget._destroyed:
            self.dirty[widget._id] = widget

    def flush(self):
        if self.dirty_images:
            images, self.dirty_images = self.dirty_images, {}
            for img in images.values():
                img._encode_now()
        guard = 0
        while self.dirty and guard < 10:
            guard += 1
            dirty, self.dirty = self.dirty, {}
            for widget in dirty.values():
                if not widget._destroyed:
                    widget._sync()
        self._sync_want()
        if not self.ops:
            return
        ops, self.ops = self.ops, []
        if _host is not None:
            _host.flush(_json.dumps(ops))

    def query(self, **q):
        self.flush()
        if _host is None:
            return None
        raw = _host.query(_json.dumps(q))
        if raw is None:
            return None
        raw = str(raw)
        return _json.loads(raw) if raw else None

    def _sync_want(self):
        want = set()
        for table in self.bindings.values():
            want |= table.wants()
        for widget in self.widgets.values():
            extra = getattr(widget, '_extra_wants', None)
            if extra is not None:
                want |= extra()
        want = sorted(want)
        if want != self.want_sent:
            self.want_sent = want
            self.ops.append(['want', want])

    # errors inside callbacks are reported and the loop carries on, as in Tk
    def deliver(self, func, *args):
        try:
            return func(*args)
        except SystemExit:
            raise
        except Exception:
            exc, val, tb = _sys.exc_info()
            root = _default_root or (self.roots[0] if self.roots else None)
            if root is not None:
                try:
                    root.report_callback_exception(exc, val, tb)
                    return None
                except Exception:
                    pass
            _report_exception(exc, val, tb)
            return None

    # timers
    def after(self, ms, func, args):
        self.after_seq += 1
        aid = 'after#%d' % self.after_seq
        try:
            delay = max(0.0, float(ms)) / 1000.0
        except (TypeError, ValueError):
            raise TclError('bad argument "%s": must be cancel, idle, info, or an integer' % ms)
        self.timer_seq += 1
        _heapq.heappush(self.timers, (_time.monotonic() + delay, self.timer_seq, aid))
        self.timer_funcs[aid] = (func, args)
        return aid

    def after_idle(self, func, args):
        self.after_seq += 1
        aid = 'after#%d' % self.after_seq
        self.timer_funcs[aid] = (func, args)
        self.idle.append(aid)
        return aid

    def run_timers(self):
        now = _time.monotonic()
        due = []
        while self.timers and self.timers[0][0] <= now:
            _, _, aid = _heapq.heappop(self.timers)
            if aid in self.timer_funcs:
                due.append(aid)
        for aid in due:
            entry = self.timer_funcs.pop(aid, None)
            if entry is not None:
                self.deliver(entry[0], *entry[1])
        self.run_idle()

    def run_idle(self):
        idle, self.idle = self.idle, []
        for aid in idle:
            entry = self.timer_funcs.pop(aid, None)
            if entry is not None:
                self.deliver(entry[0], *entry[1])

    def next_delay(self):
        if self.idle:
            return 0.0
        if self.timers:
            return max(0.0, min(0.05, self.timers[0][0] - _time.monotonic()))
        return 0.05

    # the event loop
    def pump(self):
        _check_stop()
        raw = _host.poll() if _host is not None else None
        events = _json.loads(str(raw)) if raw else []
        for ev in events:
            self.deliver(self.handle, ev)
        self.run_timers()
        self.flush()

    def mainloop(self):
        self.mainloop_called = True
        if not self.roots:
            return
        if not _can_block():
            # The page cannot run while Python waits here, so this returns and
            # the bootstrap keeps the window alive once the program has ended.
            self.mainloop_deferred = True
            self.flush()
            return
        self.quit_flag = False
        self.autofocus()
        self.loop_depth += 1
        try:
            while self.roots and not self.quit_flag:
                self.pump()
                if not self.roots or self.quit_flag:
                    break
                _pause(self.next_delay())
        finally:
            self.loop_depth -= 1
            # quit() ends the innermost mainloop only.
            if self.loop_depth > 0:
                self.quit_flag = False
        self.flush()

    def wait_until(self, done):
        """Run the loop until done() — wait_window and wait_variable."""
        if not _can_block():
            self.flush()
            return
        while not done() and self.roots:
            self.pump()
            if done():
                break
            _pause(self.next_delay())

    def autofocus(self):
        for root in self.roots:
            self.op('autofocus', root._id)
            break

    def has_visible_window(self):
        for widget in self.widgets.values():
            if isinstance(widget, (Tk, Toplevel)) and widget._wm_state not in ('withdrawn', 'iconic'):
                if widget.children:
                    return True
        return False

    # raw events from the page
    def handle(self, ev):
        kind = ev.get('t')
        widget = self.widgets.get(ev.get('w'))
        if kind == 'menu':
            menu = self.widgets.get(ev.get('m'))
            if isinstance(menu, Menu):
                menu.invoke(ev.get('i'))
            return
        if widget is None or widget._destroyed:
            return
        if kind in ('mouse', 'key', 'focus', 'configure'):
            self.generic(widget, ev)
            return
        handler = getattr(widget, '_on_' + str(kind), None)
        if handler is not None:
            handler(ev)

    def generic(self, widget, ev):
        kind = ev.get('t')
        k = ev.get('k')
        state = int(ev.get('m') or 0)
        mods = _mods_from_state(state)
        e = Event()
        e.widget = widget
        e.state = state
        e.serial = self.next_serial()
        count = 1
        detail = None
        item = ev.get('i')
        if kind == 'mouse':
            e.x = int(ev.get('x', 0))
            e.y = int(ev.get('y', 0))
            e.x_root = int(ev.get('X', 0))
            e.y_root = int(ev.get('Y', 0))
            self.pointer = (e.x_root, e.y_root)
            if k in ('press', 'release'):
                e.num = int(ev.get('b', 1))
                detail = str(e.num)
                count = int(ev.get('n', 1) or 1) if k == 'press' else 1
                etype = 'ButtonPress' if k == 'press' else 'ButtonRelease'
                e.type = EventType.ButtonPress if k == 'press' else EventType.ButtonRelease
            elif k == 'motion':
                etype = 'Motion'
                e.type = EventType.Motion
            elif k in ('enter', 'leave'):
                etype = 'Enter' if k == 'enter' else 'Leave'
                e.type = EventType.Enter if k == 'enter' else EventType.Leave
            elif k == 'wheel':
                etype = 'MouseWheel'
                e.type = EventType.MouseWheel
                e.delta = int(ev.get('d', 0))
            else:
                return
        elif kind == 'key':
            key = str(ev.get('key', ''))
            e.keysym = _keysym_for(key, ev.get('code', ''))
            e.char = key if len(key) == 1 else _CHAR_FOR_KEYSYM.get(e.keysym, '')
            if 'Control' in mods and len(key) == 1 and key.isalpha():
                e.char = chr(ord(key.lower()) - 96)
            e.keycode = int(ev.get('kc', 0) or 0)
            e.keysym_num = ord(key) if len(key) == 1 else 0
            e.x, e.y = 0, 0
            e.x_root, e.y_root = self.pointer
            detail = e.keysym
            etype = 'KeyPress' if k == 'press' else 'KeyRelease'
            e.type = EventType.KeyPress if k == 'press' else EventType.KeyRelease
        elif kind == 'focus':
            etype = 'FocusIn' if k == 'in' else 'FocusOut'
            e.type = EventType.FocusIn if k == 'in' else EventType.FocusOut
            if k == 'in':
                self.focus = widget
            elif self.focus is widget:
                self.focus = None
            widget._on_focus_change(k == 'in')
        elif kind == 'configure':
            etype = 'Configure'
            e.type = EventType.Configure
            e.width = int(ev.get('width', 0))
            e.height = int(ev.get('height', 0))
            e.x, e.y = 0, 0
        else:
            return
        # Canvas items and Treeview rows have bindings of their own, run first.
        hook = getattr(widget, '_item_event', None)
        if hook is not None and kind == 'mouse':
            if hook(item, k, etype, detail, mods, count, e) == 'break':
                return
        self.dispatch(widget, etype, detail, mods, count, e)

    def next_serial(self):
        self.cmd_seq += 1
        return self.cmd_seq

    def dispatch(self, widget, etype, detail, mods, count, event):
        for tag in widget.bindtags():
            table = self.bindings.get(tag)
            if table is None:
                continue
            funcs = table.best(etype, detail, mods, count)
            if not funcs:
                continue
            for _funcid, func in list(funcs):
                result = func(event)
                if result == 'break':
                    return 'break'
        return None

    def fire_virtual(self, widget, name, **attrs):
        e = Event()
        e.widget = widget
        e.type = EventType.VirtualEvent
        e.serial = self.next_serial()
        for k, v in attrs.items():
            setattr(e, k, v)
        self.deliver(self.dispatch, widget, 'Virtual', name, set(), 1, e)


def _report_exception(exc, val, tb):
    # Frames inside this package are how the callback was reached, not where
    # the student's mistake is, so they are left out of the traceback.
    while tb is not None and _os.path.dirname(_os.path.abspath(tb.tb_frame.f_code.co_filename)) == _SHIM_DIR:
        tb = tb.tb_next
    print('Exception in Tkinter callback', file=_sys.stderr)
    _traceback.print_exception(exc, val, tb, file=_sys.stderr)


_app = _App()


def _get_default_root(what=None):
    if not _support_default_root:
        raise RuntimeError('No master specified and tkinter is configured to not support default root')
    if _default_root is None:
        if what:
            raise RuntimeError('Too early to %s: no default root window' % what)
        return Tk()
    return _default_root


def NoDefaultRoot():
    global _support_default_root, _default_root
    _support_default_root = False
    _default_root = None


def mainloop(n=0):
    _app.mainloop()


def image_names():
    return tuple(_app.images)


def image_types():
    return ('photo', 'bitmap')


def _option_default(widget, name):
    """The option database (option_add) — '*Font', '*Button.background', '*tearOff'."""
    for pattern, value in reversed(_app.option_db):
        parts = [p for p in _re.split(r'[.*]', pattern) if p]
        if not parts or parts[-1].lower() != name:
            continue
        scope = parts[:-1]
        if not scope:
            return value
        target = scope[-1]
        if target == widget.winfo_class() or target == getattr(widget, '_name', None):
            return value
    return None


# ── The Tcl interpreter, as far as programs reach for it ────────────────────

class _TkApp:
    """What `widget.tk` is: enough of the Tcl interpreter for common calls."""

    def __init__(self, root):
        self._root = root

    def call(self, *args):
        flat = []
        for a in args:
            if isinstance(a, (tuple, list)):
                flat.extend(a)
            else:
                flat.append(a)
        if not flat:
            return ''
        cmd = str(flat[0])
        if cmd == 'tk' and len(flat) > 1 and str(flat[1]) == 'scaling':
            return 1.3333333333333333
        if cmd == 'info' and len(flat) > 1 and str(flat[1]) == 'patchlevel':
            return '8.6.13'
        if cmd == 'package':
            return '8.6'
        if cmd == 'winfo':
            return 0
        if cmd == 'set' and len(flat) > 1:
            name = str(flat[1])
            if len(flat) > 2:
                self.globalsetvar(name, flat[2])
            return self.globalgetvar(name)
        return ''

    def eval(self, script):
        return ''

    def getint(self, value):
        return getint(value)

    def getdouble(self, value):
        return getdouble(value)

    def getboolean(self, value):
        return _getboolean(value)

    def splitlist(self, value):
        return _splitlist(value)

    split = splitlist

    def createcommand(self, name, func):
        _app.commands[name] = func

    def deletecommand(self, name):
        _app.commands.pop(name, None)

    def globalsetvar(self, name, value):
        var = _app.vars.get(str(name))
        if var is None:
            var = Variable(name=str(name))
        var._store(value)

    setvar = globalsetvar

    def globalgetvar(self, name):
        var = _app.vars.get(str(name))
        if var is None:
            raise TclError('can\'t read "%s": no such variable' % name)
        return var._value

    getvar = globalgetvar

    def globalunsetvar(self, name):
        _app.vars.pop(str(name), None)

    unsetvar = globalunsetvar

    def wantobjects(self, *args):
        return 1

    def mainloop(self, n=0):
        _app.mainloop()

    def quit(self):
        _app.quit_flag = True

    def dooneevent(self, flags=0):
        _app.pump()
        return 1

    def interpaddr(self):
        return 0

    def willdispatch(self):
        pass

    def adderrorinfo(self, msg):
        pass

    def exprstring(self, s):
        return str(s)

    def exprboolean(self, s):
        return _getboolean(s)

    def record(self, script):
        return ''


class Tcl:
    """tkinter.Tcl(): an interpreter with no window. Only the variables work."""

    def __init__(self, *args, **kwargs):
        self.tk = _TkApp(None)

    def __getattr__(self, name):
        return getattr(self.tk, name)


# ── Misc: what every widget (and the root window) can do ────────────────────

class Misc:
    _spec = {}
    _kind = None
    _class = 'Misc'
    _w = None
    _destroyed = False
    _last_child_ids = None

    # identity
    def __str__(self):
        return self._w

    def __repr__(self):
        return '<%s.%s object %s>' % (self.__class__.__module__, self.__class__.__qualname__, self._w)

    def _check(self):
        if self._destroyed:
            raise TclError('invalid command name "%s"' % self._w)

    def _root(self):
        w = self
        while w.master is not None:
            w = w.master
        return w

    def _toplevel(self):
        w = self
        while w is not None and not isinstance(w, (Tk, Toplevel)):
            w = w.master
        return w

    def _changed(self):
        _app.mark(self)

    def _o(self, name):
        if name in self._opts:
            return self._opts[name]
        return self._spec.get(name, '')

    def _auto_name(self, master):
        # Named after the Python class, as tkinter does: a subclass App(Frame) is '!app'.
        base = '!' + self.__class__.__name__.lower()
        counts = master.__dict__.setdefault('_name_counts', {})
        counts[base] = counts.get(base, 0) + 1
        n = counts[base]
        name = base if n == 1 else '%s%d' % (base, n)
        while name in master.children:
            counts[base] += 1
            name = '%s%d' % (base, counts[base])
        return name

    # options
    def configure(self, cnf=None, **kw):
        self._check()
        if cnf is None and not kw:
            return {name: (name, name, name.capitalize(), self._spec.get(name, ''), self._o(name))
                    for name in self._spec}
        if isinstance(cnf, str):
            name = _optname(cnf)
            if name not in self._spec:
                raise TclError('unknown option "-%s"' % name)
            return (name, name, name.capitalize(), self._spec.get(name, ''), self._o(name))
        self._configure(_cnfmerge(cnf, kw))

    config = configure

    def _configure(self, kw, initial=False):
        for key, value in kw.items():
            name = _optname(key)
            if name not in self._spec:
                # Named as the program wrote it, as Tk does: unknown option "-bg".
                raise TclError('unknown option "-%s"' % str(key).lstrip('-').rstrip('_'))
            self._set_option(name, value, initial)
        if not initial:
            self._changed()

    def _set_option(self, name, value, initial=False):
        self._opts[name] = value

    def cget(self, key):
        self._check()
        name = _optname(key)
        if name not in self._spec:
            raise TclError('unknown option "-%s"' % name)
        return self._o(name)

    __getitem__ = cget

    def __setitem__(self, key, value):
        self.configure({key: value})

    def keys(self):
        return sorted(self._spec)

    # destruction
    def destroy(self):
        if self._destroyed:
            return
        widgets = []
        self._collect(widgets)
        for w in widgets:
            e = Event()
            e.widget = w
            e.type = EventType.Destroy
            _app.deliver(_app.dispatch, w, 'Destroy', None, set(), 1, e)
        for w in widgets:
            w._teardown()
        if self.master is not None and not self.master._destroyed:
            self.master._forget_slave(self)
            if self.master.children.get(self._name) is self:
                del self.master.children[self._name]
        _app.op('destroy', self._id)
        if _app.focus in widgets:
            _app.focus = None

    def _collect(self, out):
        for child in list(self.children.values()):
            child._collect(out)
        out.append(self)

    def _teardown(self):
        self._destroyed = True
        _app.widgets.pop(self._id, None)
        _app.dirty.pop(self._id, None)
        for var in self._watched_vars():
            var._unwatch(self)
        for tag in (self._w,):
            if not any(w._w == tag for w in _app.widgets.values()):
                _app.bindings.pop(tag, None)

    def _watched_vars(self):
        return []

    def _forget_slave(self, slave):
        if slave in self._slaves:
            self._slaves.remove(slave)

    # timers
    def after(self, ms, func=None, *args):
        if func is None:
            _coder_sleep_ms(ms)
            return None
        return _app.after(ms, func, args)

    def after_idle(self, func, *args):
        return _app.after_idle(func, args)

    def after_cancel(self, id):
        if not id:
            raise ValueError('id must be a valid identifier returned from after or after_idle')
        _app.timer_funcs.pop(id, None)

    def after_info(self, id=None):
        if id is None:
            return tuple(_app.timer_funcs)
        if id not in _app.timer_funcs:
            raise TclError('event "%s" doesn\'t exist' % id)
        return (str(_app.timer_funcs[id][0]), 'timer')

    # the loop
    def mainloop(self, n=0):
        _app.mainloop()

    def quit(self):
        _app.quit_flag = True

    def update(self):
        _pause(0)
        _app.pump()

    def update_idletasks(self):
        _app.run_idle()
        _pause(0)

    def wait_window(self, window=None):
        window = self if window is None else window
        _app.wait_until(lambda: window._destroyed)

    def wait_variable(self, name='PY_VAR'):
        var = name if isinstance(name, Variable) else _app.vars.get(str(name))
        if var is None:
            return
        state = {'hit': False}

        def hit(*args):
            state['hit'] = True
        cb = var.trace_add('write', hit)
        try:
            _app.wait_until(lambda: state['hit'])
        finally:
            var.trace_remove('write', cb)

    waitvar = wait_variable

    def wait_visibility(self, window=None):
        _app.flush()

    # bindings
    def bind(self, sequence=None, func=None, add=None):
        return self._bind_tag(self._w, sequence, func, add)

    def _bind_tag(self, tag, sequence, func, add):
        table = _app.bindings.get(tag)
        if sequence is None:
            return tuple(table.sequences.values()) if table else ()
        if func is None:
            if table is None:
                return ''
            pattern = _parse_sequence(sequence)
            funcs = table.entries.get(pattern)
            return '\n'.join(fid for fid, _ in funcs) if funcs else ''
        if isinstance(func, str):
            return ''
        if table is None:
            table = _app.bindings[tag] = _BindingTable()
        funcid = _app.register(func)
        table.bind(sequence, func, bool(add), funcid)
        return funcid

    def unbind(self, sequence, funcid=None):
        table = _app.bindings.get(self._w)
        if table is not None:
            table.unbind(sequence, funcid)

    def bind_all(self, sequence=None, func=None, add=None):
        return self._bind_tag('all', sequence, func, add)

    def unbind_all(self, sequence):
        table = _app.bindings.get('all')
        if table is not None:
            table.unbind(sequence)

    def bind_class(self, className, sequence=None, func=None, add=None):
        return self._bind_tag(className, sequence, func, add)

    def unbind_class(self, className, sequence):
        table = _app.bindings.get(className)
        if table is not None:
            table.unbind(sequence)

    def bindtags(self, tagList=None):
        if tagList is not None:
            self._bindtags = tuple(str(t) for t in tagList)
            return None
        if getattr(self, '_bindtags', None):
            return self._bindtags
        top = self._toplevel()
        if top is self or top is None:
            return (self._w, self.winfo_class(), 'all')
        return (self._w, self.winfo_class(), top._w, 'all')

    def event_generate(self, sequence, **kw):
        pattern = _parse_sequence(sequence)
        etype, detail, mods, count = pattern
        e = Event()
        e.widget = self
        e.serial = _app.next_serial()
        for k, v in kw.items():
            setattr(e, k, v)
        if etype in ('KeyPress', 'KeyRelease'):
            e.keysym = kw.get('keysym', detail or '')
            e.char = kw.get('char', e.keysym if len(e.keysym) == 1 else '')
            detail = e.keysym
        elif etype in ('ButtonPress', 'ButtonRelease'):
            e.num = int(detail or kw.get('button', 1))
            detail = str(e.num)
        if etype == 'Virtual':
            e.type = EventType.VirtualEvent
        else:
            e.type = getattr(EventType, etype, EventType.VirtualEvent)
        when = kw.get('when')
        if when in ('tail', 'head', 'mark'):
            _app.after_idle(_app.dispatch, (self, etype, detail, set(mods), count, e))
        else:
            _app.deliver(_app.dispatch, self, etype, detail, set(mods), count, e)

    def event_add(self, virtual, *sequences):
        pass

    def event_delete(self, virtual, *sequences):
        pass

    def event_info(self, virtual=None):
        return ()

    # focus and grabs
    def focus_set(self):
        self._check()
        _app.focus = self
        _app.op('focus', self._id)

    focus = focus_set
    focus_force = focus_set

    def focus_get(self):
        q = _app.query(q='focus')
        if q is None:
            return _app.focus
        return _app.widgets.get(q)

    focus_displayof = focus_get

    def focus_lastfor(self):
        return _app.focus or self

    def tk_focusNext(self):
        return None

    def tk_focusPrev(self):
        return None

    def tk_focusFollowsMouse(self):
        pass

    def grab_set(self):
        _app.op('grab', self._toplevel()._id)

    grab_set_global = grab_set

    def grab_release(self):
        _app.op('grab', None)

    def grab_current(self):
        return None

    def grab_status(self):
        return None

    # geometry masters
    def _grid_configure(self, which, index, cnf, kw):
        opts = _cnfmerge(cnf, kw)
        if isinstance(index, (tuple, list)):
            indices = list(index)
        elif index == 'all':
            used = set()
            for s in self._slaves:
                if s._manager == 'grid':
                    start = s._mopts['row' if which == 'row' else 'column']
                    span = s._mopts['rowspan' if which == 'row' else 'columnspan']
                    used.update(range(start, start + span))
            indices = sorted(used)
        else:
            indices = [index]
        conf = self._grid_conf[which]
        if not opts:
            if len(indices) != 1:
                return None
            c = conf.get(int(indices[0]), {})
            return {'minsize': c.get('minsize', 0), 'pad': c.get('pad', 0),
                    'uniform': c.get('uniform'), 'weight': c.get('weight', 0)}
        for i in indices:
            if isinstance(i, Misc):
                s = i
                i = s._mopts['row' if which == 'row' else 'column'] if s._manager == 'grid' else 0
            i = int(i)
            c = conf.setdefault(i, {})
            for k, v in opts.items():
                name = _optname(k)
                if name == 'weight':
                    c['weight'] = int(float(v))
                elif name == 'minsize':
                    c['minsize'] = _px(v)
                elif name == 'pad':
                    c['pad'] = _px(v)
                elif name == 'uniform':
                    c['uniform'] = v
                else:
                    raise TclError('bad option "-%s": must be -minsize, -pad, -uniform, or -weight' % name)
            _app.op('gridconf', self._id, which, i, {'weight': c.get('weight', 0),
                                                    'minsize': c.get('minsize', 0),
                                                    'pad': c.get('pad', 0)})
        return None

    def grid_columnconfigure(self, index, cnf={}, **kw):
        return self._grid_configure('column', index, cnf, kw)

    columnconfigure = grid_columnconfigure

    def grid_rowconfigure(self, index, cnf={}, **kw):
        return self._grid_configure('row', index, cnf, kw)

    rowconfigure = grid_rowconfigure

    def grid_propagate(self, flag=None):
        if flag is None:
            return self._propagate['grid']
        self._propagate['grid'] = _getboolean(flag)
        _app.op('propagate', self._id, 'grid', self._propagate['grid'])

    def pack_propagate(self, flag=None):
        if flag is None:
            return self._propagate['pack']
        self._propagate['pack'] = _getboolean(flag)
        _app.op('propagate', self._id, 'pack', self._propagate['pack'])

    propagate = pack_propagate

    def grid_size(self):
        cols = rows = 0
        for s in self._slaves:
            if s._manager == 'grid':
                cols = max(cols, s._mopts['column'] + s._mopts['columnspan'])
                rows = max(rows, s._mopts['row'] + s._mopts['rowspan'])
        return (cols, rows)

    size = grid_size

    def grid_slaves(self, row=None, column=None):
        out = []
        for s in self._slaves:
            if s._manager != 'grid':
                continue
            if row is not None and s._mopts['row'] != int(row):
                continue
            if column is not None and s._mopts['column'] != int(column):
                continue
            out.append(s)
        return list(reversed(out))

    def pack_slaves(self):
        return [s for s in self._slaves if s._manager == 'pack']

    slaves = pack_slaves

    def place_slaves(self):
        return [s for s in self._slaves if s._manager == 'place']

    def grid_bbox(self, column=None, row=None, col2=None, row2=None):
        return (0, 0, self.winfo_width(), self.winfo_height())

    bbox = grid_bbox

    def grid_location(self, x, y):
        return (0, 0)

    def grid_anchor(self, anchor=None):
        if anchor is None:
            return getattr(self, '_grid_anchor', 'nw')
        self._grid_anchor = _anchor(anchor)
        _app.op('gridanchor', self._id, self._grid_anchor)

    anchor = grid_anchor

    # window information
    def _geom(self):
        q = _app.query(q='geom', w=self._id)
        if not q:
            return {'w': 1, 'h': 1, 'x': 0, 'y': 0, 'rx': 0, 'ry': 0, 'm': 0, 'rw': 1, 'rh': 1}
        return q

    def winfo_width(self):
        return max(1, int(self._geom()['w']))

    def winfo_height(self):
        return max(1, int(self._geom()['h']))

    def winfo_reqwidth(self):
        g = self._geom()
        return max(1, int(g.get('rw', g['w'])))

    def winfo_reqheight(self):
        g = self._geom()
        return max(1, int(g.get('rh', g['h'])))

    def winfo_x(self):
        return int(self._geom()['x'])

    def winfo_y(self):
        return int(self._geom()['y'])

    def winfo_rootx(self):
        return int(self._geom()['rx'])

    def winfo_rooty(self):
        return int(self._geom()['ry'])

    def winfo_geometry(self):
        g = self._geom()
        return '%dx%d+%d+%d' % (max(1, g['w']), max(1, g['h']), g['x'], g['y'])

    def winfo_ismapped(self):
        return 1 if self._geom().get('m') else 0

    def winfo_viewable(self):
        return self.winfo_ismapped()

    def winfo_exists(self):
        return 0 if self._destroyed else 1

    def winfo_children(self):
        return [c for c in self.children.values() if not c._destroyed]

    def winfo_class(self):
        return getattr(self, '_class_name', None) or self._class

    def winfo_name(self):
        return self._name

    def winfo_parent(self):
        return self.master._w if self.master is not None else ''

    def winfo_toplevel(self):
        return self._toplevel()

    def winfo_id(self):
        return self._id

    def winfo_pathname(self, id, displayof=0):
        w = _app.widgets.get(int(id))
        return w._w if w else ''

    def winfo_manager(self):
        if isinstance(self, (Tk, Toplevel)):
            return 'wm'
        return self._manager or ''

    def _screen(self):
        q = _app.query(q='screen')
        return q or {'w': 1366, 'h': 768}

    def winfo_screenwidth(self):
        return int(self._screen()['w'])

    def winfo_screenheight(self):
        return int(self._screen()['h'])

    def winfo_screenmmwidth(self):
        return int(self.winfo_screenwidth() / 3.7795)

    def winfo_screenmmheight(self):
        return int(self.winfo_screenheight() / 3.7795)

    def winfo_vrootwidth(self):
        return self.winfo_screenwidth()

    def winfo_vrootheight(self):
        return self.winfo_screenheight()

    def winfo_pointerx(self):
        return _app.pointer[0]

    def winfo_pointery(self):
        return _app.pointer[1]

    def winfo_pointerxy(self):
        return _app.pointer

    def winfo_rgb(self, color):
        q = _app.query(q='rgb', c=_color(color))
        if q is None:
            return (0, 0, 0)
        if q == 'bad':
            raise TclError('unknown color name "%s"' % color)
        return tuple(int(v) * 257 for v in q)

    def winfo_fpixels(self, number):
        return _fpx(number)

    def winfo_pixels(self, number):
        return _px(number)

    def winfo_depth(self):
        return 24

    def winfo_cells(self):
        return 256

    def winfo_visual(self):
        return 'truecolor'

    def winfo_server(self):
        return 'Coder browser'

    def winfo_containing(self, rootX, rootY, displayof=0):
        return None

    def winfo_interps(self, displayof=0):
        return ('tk',)

    def winfo_atom(self, name, displayof=0):
        return 0

    def winfo_colormapfull(self):
        return 0

    # the rest of Misc
    def bell(self, displayof=0):
        _app.op('bell')

    def clipboard_clear(self, **kw):
        _app.clipboard = ''

    def clipboard_append(self, string, **kw):
        _app.clipboard = (_app.clipboard or '') + str(string)
        _app.op('clipboard', _app.clipboard)

    def clipboard_get(self, **kw):
        if not _app.clipboard:
            raise TclError('CLIPBOARD selection doesn\'t exist or form "STRING" not defined')
        return _app.clipboard

    def selection_get(self, **kw):
        raise TclError('PRIMARY selection doesn\'t exist or form "STRING" not defined')

    def selection_clear(self, **kw):
        pass

    def register(self, func, subst=None, needcleanup=1):
        return _app.register(func)

    _register = register

    def deletecommand(self, name):
        _app.commands.pop(name, None)

    def nametowidget(self, name):
        if isinstance(name, Misc):
            return name
        name = str(name)
        w = self._root()
        if not name or name == '.':
            return w
        if name.startswith('.'):
            name = name[1:]
        for part in name.split('.'):
            if not part:
                continue
            w = w.children[part]
        return w

    _nametowidget = nametowidget

    def getvar(self, name='PY_VAR'):
        return self.tk.globalgetvar(name)

    def setvar(self, name='PY_VAR', value='1'):
        self.tk.globalsetvar(name, value)

    def getint(self, s):
        return getint(s)

    def getdouble(self, s):
        return getdouble(s)

    def getboolean(self, s):
        return _getboolean(s)

    def option_add(self, pattern, value, priority=None):
        _app.option_db.append((str(pattern), value))

    def option_clear(self):
        _app.option_db = []

    def option_get(self, name, className):
        for pattern, value in reversed(_app.option_db):
            if pattern.lower().endswith(str(name).lower()):
                return value
        return ''

    def option_readfile(self, fileName, priority=None):
        pass

    def image_names(self):
        return image_names()

    def image_types(self):
        return image_types()

    def tk_setPalette(self, *args, **kw):
        pass

    def tk_strictMotif(self, boolean=None):
        return 0

    def tk_bisque(self):
        pass

    def lift(self, aboveThis=None):
        _app.op('raise', self._id)

    tkraise = lift

    def lower(self, belowThis=None):
        _app.op('lower', self._id)

    def _on_focus_change(self, focused):
        pass


def _coder_sleep_ms(ms):
    try:
        seconds = max(0.0, float(ms)) / 1000.0
    except (TypeError, ValueError):
        raise TclError('bad argument "%s": must be cancel, idle, info, or an integer' % ms)
    if _can_block():
        _pause(seconds)
    else:
        _app.flush()
        _real_sleep(seconds)


# ── Window manager commands ─────────────────────────────────────────────────

_GEOMETRY = _re.compile(r'^\s*(?:=?(\d+)x(\d+))?\s*(?:([+-])\s*(-?\d+)\s*([+-])\s*(-?\d+))?\s*$')


class Wm:
    """Title, size and the other things a window manager looks after."""

    def wm_title(self, string=None):
        if string is None:
            return self._wm['title']
        self._wm['title'] = str(string)
        self._changed()

    title = wm_title

    def wm_geometry(self, newGeometry=None):
        if newGeometry is None:
            g = self._geom()
            return '%dx%d+%d+%d' % (max(1, g['w']), max(1, g['h']), self._wm['pos'][0], self._wm['pos'][1])
        m = _GEOMETRY.match(str(newGeometry))
        if not m:
            raise TclError('bad geometry specifier "%s"' % newGeometry)
        if m.group(1):
            self._wm['size'] = [int(m.group(1)), int(m.group(2))]
        if m.group(3):
            self._wm['pos'] = [int(m.group(4)), int(m.group(6))]
        if str(newGeometry).strip() == '':
            self._wm['size'] = None
        self._changed()
        return ''

    geometry = wm_geometry

    def wm_resizable(self, width=None, height=None):
        if width is None and height is None:
            return tuple(self._wm['resizable'])
        self._wm['resizable'] = [_getboolean(width), _getboolean(height if height is not None else width)]
        return None

    resizable = wm_resizable

    def wm_minsize(self, width=None, height=None):
        if width is None and height is None:
            return tuple(self._wm['minsize'])
        self._wm['minsize'] = [_px(width), _px(height if height is not None else width)]
        self._changed()

    minsize = wm_minsize

    def wm_maxsize(self, width=None, height=None):
        if width is None and height is None:
            return tuple(self._wm['maxsize'])
        self._wm['maxsize'] = [_px(width), _px(height if height is not None else width)]
        self._changed()

    maxsize = wm_maxsize

    def wm_withdraw(self):
        self._wm_state = 'withdrawn'
        self._changed()

    withdraw = wm_withdraw

    def wm_deiconify(self):
        self._wm_state = 'normal'
        self._changed()

    deiconify = wm_deiconify

    def wm_iconify(self):
        self._wm_state = 'iconic'
        self._changed()

    iconify = wm_iconify

    def wm_state(self, newstate=None):
        if newstate is None:
            return self._wm_state
        if newstate not in ('normal', 'iconic', 'withdrawn', 'zoomed', 'icon'):
            raise TclError('bad argument "%s": must be normal, iconic, withdrawn, or zoomed' % newstate)
        self._wm_state = newstate
        self._changed()

    state = wm_state

    def wm_attributes(self, *args, **kw):
        attrs = self._wm['attributes']
        if len(args) == 1 and not kw:
            return attrs.get(str(args[0]).lstrip('-'), 0)
        if not args and not kw:
            return tuple(x for k, v in attrs.items() for x in ('-' + k, v))
        pairs = list(zip(args[::2], args[1::2])) + list(kw.items())
        for k, v in pairs:
            attrs[str(k).lstrip('-')] = v
        self._changed()
        return ''

    attributes = wm_attributes

    def wm_protocol(self, name=None, func=None):
        if name is None:
            return tuple(self._wm['protocols'])
        if func is None:
            return self._wm['protocols'].get(name, '')
        self._wm['protocols'][name] = func
        return ''

    protocol = wm_protocol

    def wm_overrideredirect(self, boolean=None):
        if boolean is None:
            return self._wm['override']
        self._wm['override'] = _getboolean(boolean)
        self._changed()

    overrideredirect = wm_overrideredirect

    def wm_transient(self, master=None):
        return ''

    transient = wm_transient

    def _wm_noop(self, *args, **kw):
        return ''

    wm_iconbitmap = iconbitmap = _wm_noop
    wm_iconphoto = iconphoto = _wm_noop
    wm_iconname = iconname = _wm_noop
    wm_iconmask = iconmask = _wm_noop
    wm_iconwindow = iconwindow = _wm_noop
    wm_iconposition = iconposition = _wm_noop
    wm_group = group = _wm_noop
    wm_focusmodel = focusmodel = _wm_noop
    wm_positionfrom = positionfrom = _wm_noop
    wm_sizefrom = sizefrom = _wm_noop
    wm_aspect = aspect = _wm_noop
    wm_client = client = _wm_noop
    wm_command = command = _wm_noop
    wm_colormapwindows = colormapwindows = _wm_noop
    wm_frame = frame = _wm_noop
    wm_manage = manage = _wm_noop
    wm_forget = forget = _wm_noop

    def _init_wm(self, title):
        self._wm = {'title': title, 'size': None, 'pos': [0, 0], 'resizable': [True, True],
                    'minsize': [1, 1], 'maxsize': [1920, 1080], 'attributes': {},
                    'protocols': {}, 'override': False}
        self._wm_state = 'normal'

    def _wm_props(self, p):
        p['title'] = self._wm['title']
        p['geom'] = self._wm['size']
        p['wstate'] = self._wm_state
        p['override'] = self._wm['override']
        p['minsize'] = self._wm['minsize']
        alpha = self._wm['attributes'].get('alpha')
        p['alpha'] = float(alpha) if alpha not in (None, '') else 1.0
        menu = self._o('menu')
        p['menu'] = menu._model() if isinstance(menu, Menu) else None

    def _on_close(self, ev):
        handler = self._wm['protocols'].get('WM_DELETE_WINDOW')
        if handler:
            handler()
        else:
            self.destroy()


# ── Geometry managers ───────────────────────────────────────────────────────

class _Geometry:
    def _master_for(self, kw):
        master = kw.pop('in_', None)
        if master is None:
            master = kw.pop('in', None)
        return master

    def _claim(self, master, manager):
        if master is self:
            raise TclError("can't put %s inside itself" % self._w)
        for s in master._slaves:
            if s is self or s._manager not in ('pack', 'grid'):
                continue
            if manager in ('pack', 'grid') and s._manager != manager:
                raise TclError('cannot use geometry manager %s inside %s which already has slaves managed by %s'
                               % (manager, master._w, s._manager))
        if self._manager and self._geo_master is not master:
            self._geo_master._forget_slave(self)
        self._geo_master = master
        if self not in master._slaves:
            master._slaves.append(self)
        self._manager = manager

    def _unmanage(self):
        if self._manager and self._geo_master is not None:
            self._geo_master._forget_slave(self)
            _app.op('unmanage', self._id)
            self._send_order(self._geo_master)
        self._manager = None
        self._mopts = None

    def _send_order(self, master):
        _app.op('order', master._id, [s._id for s in master._slaves if s._manager == 'pack'])

    # pack
    def pack_configure(self, cnf={}, **kw):
        self._check()
        kw = _cnfmerge(cnf, kw)
        master = self._master_for(kw) or (self._geo_master if self._manager == 'pack' else self.master)
        if self._manager == 'pack' and master is self._geo_master:
            opts = dict(self._mopts)
        else:
            opts = {'side': 'top', 'fill': 'none', 'expand': False, 'anchor': 'center',
                    'padx': [0, 0], 'pady': [0, 0], 'ipadx': 0, 'ipady': 0}
        before = after = None
        for key, value in kw.items():
            name = _optname(key)
            if name == 'side':
                if value not in ('top', 'bottom', 'left', 'right'):
                    raise TclError('bad side "%s": must be top, bottom, left, or right' % value)
                opts['side'] = value
            elif name == 'fill':
                if value not in ('none', 'x', 'y', 'both'):
                    raise TclError('bad fill style "%s": must be none, x, y, or both' % value)
                opts['fill'] = value
            elif name == 'expand':
                opts['expand'] = _getboolean(value)
            elif name == 'anchor':
                opts['anchor'] = _anchor(value)
            elif name in ('padx', 'pady'):
                opts[name] = _pad(value)
            elif name in ('ipadx', 'ipady'):
                opts[name] = _px(value)
            elif name == 'before':
                before = value
            elif name == 'after':
                after = value
            else:
                raise TclError('bad option "-%s": must be -after, -anchor, -before, -expand, -fill, '
                               '-in, -ipadx, -ipady, -padx, -pady, or -side' % name)
        was_packed = self._manager == 'pack' and self._geo_master is master
        self._claim(master, 'pack')
        self._mopts = opts
        if before is not None or after is not None:
            ref = before if before is not None else after
            if ref._geo_master is not master or ref._manager != 'pack':
                raise TclError("window \"%s\" isn't packed" % ref._w)
            master._slaves.remove(self)
            idx = master._slaves.index(ref)
            master._slaves.insert(idx if before is not None else idx + 1, self)
        elif not was_packed:
            master._slaves.remove(self)
            master._slaves.append(self)
        _app.op('manage', self._id, 'pack', master._id, opts)
        self._send_order(master)

    pack = configure_pack = pack_configure

    def pack_forget(self):
        if self._manager == 'pack':
            self._unmanage()

    forget = pack_forget

    def pack_info(self):
        if self._manager != 'pack':
            raise TclError('window "%s" isn\'t packed' % self._w)
        o = self._mopts
        return {'in': self._geo_master, 'anchor': o['anchor'], 'expand': int(o['expand']),
                'fill': o['fill'], 'ipadx': o['ipadx'], 'ipady': o['ipady'],
                'padx': o['padx'][0] if o['padx'][0] == o['padx'][1] else tuple(o['padx']),
                'pady': o['pady'][0] if o['pady'][0] == o['pady'][1] else tuple(o['pady']),
                'side': o['side']}

    info = pack_info

    # grid
    def grid_configure(self, cnf={}, **kw):
        self._check()
        kw = _cnfmerge(cnf, kw)
        master = self._master_for(kw)
        if master is None:
            if self._manager == 'grid':
                master = self._geo_master
            elif getattr(self, '_grid_saved', None) and not kw:
                master, saved = self._grid_saved
                kw = dict(saved)
            else:
                master = self.master
        if self._manager == 'grid' and master is self._geo_master:
            opts = dict(self._mopts)
        else:
            next_row = 0
            for s in master._slaves:
                if s._manager == 'grid' and s is not self:
                    next_row = max(next_row, s._mopts['row'] + s._mopts['rowspan'])
            opts = {'row': next_row, 'column': 0, 'rowspan': 1, 'columnspan': 1, 'sticky': '',
                    'padx': [0, 0], 'pady': [0, 0], 'ipadx': 0, 'ipady': 0}
        for key, value in kw.items():
            name = _optname(key)
            if name in ('row', 'column'):
                try:
                    n = int(value)
                except (TypeError, ValueError):
                    raise TclError('expected integer but got "%s"' % value)
                if n < 0:
                    raise TclError('bad %s value "%s": must be a non-negative integer' % (name, value))
                opts[name] = n
            elif name in ('rowspan', 'columnspan'):
                n = int(value)
                if n < 1:
                    raise TclError('bad %s value "%s": must be a positive integer' % (name, value))
                opts[name] = n
            elif name == 'sticky':
                if isinstance(value, (tuple, list)):
                    value = ''.join(str(v) for v in value)
                s = str(value).lower()
                bad = [c for c in s if c not in 'nsew ,']
                if bad:
                    raise TclError('bad stickyness value "%s": must be a string containing n, e, s, and/or w' % value)
                opts['sticky'] = ''.join(c for c in 'nsew' if c in s)
            elif name in ('padx', 'pady'):
                opts[name] = _pad(value)
            elif name in ('ipadx', 'ipady'):
                opts[name] = _px(value)
            else:
                raise TclError('bad option "-%s": must be -column, -columnspan, -in, -ipadx, -ipady, '
                               '-padx, -pady, -row, -rowspan, or -sticky' % name)
        self._claim(master, 'grid')
        self._mopts = opts
        self._grid_saved = None
        _app.op('manage', self._id, 'grid', master._id, opts)

    grid = grid_configure

    def grid_forget(self):
        if self._manager == 'grid':
            self._grid_saved = None
            self._unmanage()

    def grid_remove(self):
        if self._manager == 'grid':
            master, opts = self._geo_master, dict(self._mopts)
            self._unmanage()
            self._grid_saved = (master, {'row': opts['row'], 'column': opts['column'],
                                         'rowspan': opts['rowspan'], 'columnspan': opts['columnspan'],
                                         'sticky': opts['sticky'], 'padx': opts['padx'],
                                         'pady': opts['pady'], 'ipadx': opts['ipadx'],
                                         'ipady': opts['ipady']})

    def grid_info(self):
        if self._manager != 'grid':
            return {}
        o = self._mopts
        return {'in': self._geo_master, 'column': o['column'], 'row': o['row'],
                'columnspan': o['columnspan'], 'rowspan': o['rowspan'], 'ipadx': o['ipadx'],
                'ipady': o['ipady'], 'padx': o['padx'][0] if o['padx'][0] == o['padx'][1] else tuple(o['padx']),
                'pady': o['pady'][0] if o['pady'][0] == o['pady'][1] else tuple(o['pady']),
                'sticky': o['sticky']}

    # place
    def place_configure(self, cnf={}, **kw):
        self._check()
        kw = _cnfmerge(cnf, kw)
        master = self._master_for(kw) or (self._geo_master if self._manager == 'place' else self.master)
        if self._manager == 'place' and master is self._geo_master:
            opts = dict(self._mopts)
        else:
            opts = {'x': 0, 'y': 0, 'relx': 0.0, 'rely': 0.0, 'anchor': 'nw', 'width': None,
                    'height': None, 'relwidth': None, 'relheight': None}
        for key, value in kw.items():
            name = _optname(key)
            if name in ('x', 'y'):
                opts[name] = _px(value)
            elif name in ('relx', 'rely'):
                opts[name] = float(value)
            elif name in ('width', 'height'):
                opts[name] = None if value in ('', None) else _px(value)
            elif name in ('relwidth', 'relheight'):
                opts[name] = None if value in ('', None) else float(value)
            elif name == 'anchor':
                opts['anchor'] = _anchor(value)
            elif name == 'bordermode':
                pass
            else:
                raise TclError('bad option "-%s": must be -anchor, -bordermode, -height, -in, -relheight, '
                               '-relwidth, -relx, -rely, -width, -x, or -y' % name)
        self._claim(master, 'place')
        self._mopts = opts
        _app.op('manage', self._id, 'place', master._id, opts)

    place = place_configure

    def place_forget(self):
        if self._manager == 'place':
            self._unmanage()

    def place_info(self):
        if self._manager != 'place':
            return {}
        info = dict(self._mopts)
        info['in'] = self._geo_master
        return info


# ── Widgets ─────────────────────────────────────────────────────────────────

class BaseWidget(Misc):
    """Something with a place in the widget tree and something on the page."""

    def __init__(self, master=None, cnf={}, **kw):
        kw = _cnfmerge(cnf, kw)
        if master is None:
            master = _get_default_root()
        if isinstance(master, str):
            master = _default_root.nametowidget(master)
        if master._destroyed:
            raise TclError('can\'t invoke "%s" command: application has been destroyed' % self._class.lower())
        name = kw.pop('name', None)
        class_name = kw.pop('class_', None) or kw.pop('class', None)
        self.master = master
        self.tk = master.tk
        self.widgetName = self._class.lower()
        self.children = {}
        self._id = _app.new_id()
        self._name = str(name) if name else self._auto_name(master)
        self._w = ('.' if master._w == '.' else master._w + '.') + self._name
        master.children[self._name] = self
        self._opts = {}
        self._manager = None
        self._mopts = None
        self._geo_master = None
        self._slaves = []
        self._grid_conf = {'row': {}, 'column': {}}
        self._propagate = {'pack': True, 'grid': True}
        self._destroyed = False
        self._bindtags = None
        self._class_name = class_name
        _app.widgets[self._id] = self
        self._init_state()
        for name_ in self._spec:
            default = _option_default(self, name_)
            if default is not None:
                self._opts[name_] = default
        self._configure(kw, initial=True)
        self._create()
        self._post_create()

    def _init_state(self):
        pass

    def _create(self):
        _app.op('create', self._id, self._kind, self.master._id, self._props())

    def _post_create(self):
        pass

    def _props(self):
        return {}

    def _sync(self):
        _app.op('config', self._id, self._props())

    def _var_changed(self, var):
        self._changed()

    def _on_focus_change(self, focused):
        pass


class Widget(BaseWidget, _Geometry):
    pass


# tkinter's own names for the geometry manager mix-ins.
Pack = Place = Grid = _Geometry


_FRAME_SPEC = {
    'background': 'SystemButtonFace', 'borderwidth': 0, 'class': 'Frame', 'colormap': '',
    'container': 0, 'cursor': '', 'height': 0, 'highlightbackground': 'SystemButtonFace',
    'highlightcolor': 'SystemWindowFrame', 'highlightthickness': 0, 'padx': 0, 'pady': 0,
    'relief': 'flat', 'takefocus': 0, 'visual': '', 'width': 0,
}


def _box_props(w, p):
    """Background, border, relief, padding and highlight — shared by most widgets."""
    p['bg'] = _color(w._o('background')) if 'background' in w._spec else None
    p['bd'] = _px(w._o('borderwidth')) if 'borderwidth' in w._spec else 0
    p['relief'] = w._o('relief') if 'relief' in w._spec else 'flat'
    p['cursor'] = _cursor_css(w._o('cursor')) if 'cursor' in w._spec else ''
    hl = _px(w._o('highlightthickness')) if 'highlightthickness' in w._spec else 0
    p['hl'] = hl
    if hl:
        p['hlbg'] = _color(w._o('highlightbackground'))
        p['hlc'] = _color(w._o('highlightcolor'))
    return p


class _Container:
    """Frames, labelled frames and windows: something other widgets are put inside."""

    def _container_props(self, p):
        _box_props(self, p)
        p['width'] = _px(self._o('width')) if 'width' in self._spec else 0
        p['height'] = _px(self._o('height')) if 'height' in self._spec else 0
        p['padx'] = _px(self._o('padx')) if 'padx' in self._spec else 0
        p['pady'] = _px(self._o('pady')) if 'pady' in self._spec else 0
        return p


class Frame(Widget, _Container):
    _spec = dict(_FRAME_SPEC)
    _kind = 'frame'
    _class = 'Frame'

    def _props(self):
        return self._container_props({})


class LabelFrame(Widget, _Container):
    _spec = dict(_FRAME_SPEC, borderwidth=2, relief='groove', font='TkDefaultFont',
                 foreground='SystemButtonText', labelanchor='nw', labelwidget='', text='')
    _spec['class'] = 'Labelframe'
    _kind = 'labelframe'
    _class = 'Labelframe'

    def _props(self):
        p = self._container_props({})
        p['text'] = str(self._o('text'))
        p['font'] = _font_css(self._o('font'))
        p['fg'] = _color(self._o('foreground'))
        p['labelanchor'] = str(self._o('labelanchor'))
        return p


Labelframe = LabelFrame


class Toplevel(BaseWidget, Wm, _Container):
    _spec = dict(_FRAME_SPEC, menu='', screen='', use='')
    _spec['class'] = 'Toplevel'
    _kind = 'toplevel'
    _class = 'Toplevel'

    def _init_state(self):
        self._init_wm(_default_root.title() if _default_root is not None else 'tk')
        self._name_counts = {}

    def _create(self):
        _app.op('create', self._id, 'toplevel', None, self._props())

    def _props(self):
        p = self._container_props({})
        self._wm_props(p)
        return p

    def _set_option(self, name, value, initial=False):
        self._opts[name] = value
        if name == 'menu' and isinstance(value, Menu):
            value._attach(self)

    def destroy(self):
        Misc.destroy(self)


class Tk(Misc, Wm, _Container):
    """The main window. Its path is "."."""
    _spec = dict(_FRAME_SPEC, menu='', screen='', use='')
    _spec['class'] = 'Tk'
    _kind = 'toplevel'
    _class = 'Tk'

    def __init__(self, screenName=None, baseName=None, className='Tk', useTk=True, sync=False, use=None):
        global _default_root
        self.master = None
        self.children = {}
        self._name = ''
        self._w = '.'
        self._id = _app.new_id()
        self.tk = _TkApp(self)
        self._opts = {}
        self._manager = None
        self._mopts = None
        self._geo_master = None
        self._slaves = []
        self._grid_conf = {'row': {}, 'column': {}}
        self._propagate = {'pack': True, 'grid': True}
        self._destroyed = False
        self._bindtags = None
        self._class_name = className
        self._name_counts = {}
        cls = str(className or 'Tk')
        self._init_wm(cls[:1].lower() + cls[1:])
        _app.widgets[self._id] = self
        _app.roots.append(self)
        if _support_default_root and _default_root is None:
            _default_root = self
        for name_ in self._spec:
            default = _option_default(self, name_)
            if default is not None:
                self._opts[name_] = default
        _app.op('create', self._id, 'toplevel', None, self._props())

    def _props(self):
        p = self._container_props({})
        self._wm_props(p)
        return p

    def _sync(self):
        _app.op('config', self._id, self._props())

    def _set_option(self, name, value, initial=False):
        self._opts[name] = value
        if name == 'menu' and isinstance(value, Menu):
            value._attach(self)

    def _var_changed(self, var):
        self._changed()

    def destroy(self):
        global _default_root
        if self._destroyed:
            return
        Misc.destroy(self)
        if self in _app.roots:
            _app.roots.remove(self)
        if _default_root is self:
            _default_root = None
        _app.flush()

    def _forget_slave(self, slave):
        if slave in self._slaves:
            self._slaves.remove(slave)

    def report_callback_exception(self, exc, val, tb):
        _report_exception(exc, val, tb)

    def readprofile(self, baseName, className):
        pass

    def loadtk(self):
        pass

    def __getattr__(self, name):
        tk = self.__dict__.get('tk')
        if name.startswith('_') or tk is None:
            raise AttributeError(name)
        return getattr(tk, name)


# Label-like widgets: Label, Button, Checkbutton, Radiobutton, Menubutton

_LABEL_SPEC = {
    'activebackground': 'SystemButtonFace', 'activeforeground': 'SystemButtonText',
    'anchor': 'center', 'background': 'SystemButtonFace', 'bitmap': '', 'borderwidth': 2,
    'compound': 'none', 'cursor': '', 'disabledforeground': 'SystemDisabledText',
    'font': 'TkDefaultFont', 'foreground': 'SystemButtonText', 'height': 0,
    'highlightbackground': 'SystemButtonFace', 'highlightcolor': 'SystemWindowFrame',
    'highlightthickness': 0, 'image': '', 'justify': 'center', 'padx': 1, 'pady': 1,
    'relief': 'flat', 'state': 'normal', 'takefocus': '', 'text': '', 'textvariable': '',
    'underline': -1, 'width': 0, 'wraplength': 0,
}


class _TextOptions:
    """text / textvariable, and everything that decides how a label draws."""

    def _text(self):
        var = self._opts.get('textvariable')
        if var not in (None, ''):
            value = _var_value(var)
            return '' if value is None else str(value)
        text = self._o('text')
        return '' if text is None else str(text)

    def _bind_textvariable(self, value):
        old = self._opts.get('_textvar_obj')
        if old is not None:
            old._unwatch(self)
        var = _as_variable(value)
        self._opts['_textvar_obj'] = var
        if var is not None:
            var._watch(self)

    def _watched_vars(self):
        out = []
        for key in ('_textvar_obj', '_var_obj'):
            v = self._opts.get(key)
            if v is not None:
                out.append(v)
        return out

    def _label_props(self, p):
        _box_props(self, p)
        p['text'] = self._text()
        image = _image_name(self._o('image')) if 'image' in self._spec else None
        p['image'] = image
        compound = str(self._o('compound') or 'none') if 'compound' in self._spec else 'none'
        p['compound'] = compound
        p['anchor'] = _anchor(self._o('anchor')) if 'anchor' in self._spec else 'center'
        p['justify'] = str(self._o('justify') or 'left') if 'justify' in self._spec else 'left'
        p['wrap'] = _px(self._o('wraplength')) if 'wraplength' in self._spec else 0
        underline = self._o('underline') if 'underline' in self._spec else -1
        p['underline'] = int(underline) if underline not in ('', None) else -1
        width = self._o('width') if 'width' in self._spec else 0
        height = self._o('height') if 'height' in self._spec else 0
        in_pixels = bool(image) and compound in ('none', '')
        try:
            w = float(width or 0)
        except (TypeError, ValueError):
            w = _fpx(width)
        try:
            h = float(height or 0)
        except (TypeError, ValueError):
            h = _fpx(height)
        p['width'] = [w, 'px' if in_pixels else 'ch'] if w else None
        p['height'] = [h, 'px' if in_pixels else 'lines'] if h else None
        p['padx'] = _px(self._o('padx')) if 'padx' in self._spec else 0
        p['pady'] = _px(self._o('pady')) if 'pady' in self._spec else 0
        p['fg'] = _color(self._o('foreground')) if 'foreground' in self._spec else None
        p['font'] = _font_css(self._o('font')) if 'font' in self._spec else _font_css(None)
        p['activebg'] = _color(self._o('activebackground')) if 'activebackground' in self._spec else None
        p['activefg'] = _color(self._o('activeforeground')) if 'activeforeground' in self._spec else None
        p['disabledfg'] = _color(self._o('disabledforeground')) if 'disabledforeground' in self._spec else None
        p['state'] = _state_str(self._o('state')) if 'state' in self._spec else 'normal'
        return p

    def _set_option(self, name, value, initial=False):
        if name == 'textvariable':
            self._bind_textvariable(value)
        elif name == 'image' and value not in (None, ''):
            if _image_name(value) not in _app.images:
                raise TclError('image "%s" doesn\'t exist' % value)
            self._opts['_image_ref'] = value
        self._opts[name] = value


class Label(_TextOptions, Widget):
    _spec = dict(_LABEL_SPEC)
    _kind = 'label'
    _class = 'Label'

    def _props(self):
        return self._label_props({})


class Message(_TextOptions, Widget):
    _spec = {
        'anchor': 'center', 'aspect': 150, 'background': 'SystemButtonFace', 'borderwidth': 1,
        'cursor': '', 'font': 'TkDefaultFont', 'foreground': 'SystemButtonText',
        'highlightbackground': 'SystemButtonFace', 'highlightcolor': 'SystemWindowFrame',
        'highlightthickness': 0, 'justify': 'left', 'padx': -1, 'pady': -1, 'relief': 'flat',
        'takefocus': '', 'text': '', 'textvariable': '', 'width': 0,
    }
    _kind = 'label'
    _class = 'Message'

    def _props(self):
        p = self._label_props({})
        p['padx'] = max(0, p['padx'])
        p['pady'] = max(0, p['pady'])
        width = _px(self._o('width'))
        if width > 0:
            p['wrap'] = width
        else:
            # Tk wraps a message to roughly `aspect` percent wider than tall.
            chars = max(1, len(p['text']))
            aspect = max(10, int(self._o('aspect') or 150))
            p['wrap'] = int(_math.sqrt(chars * 7 * 16 * aspect / 100.0)) + 10
        p['width'] = None
        return p


class Button(_TextOptions, Widget):
    _spec = dict(_LABEL_SPEC, command='', default='disabled', overrelief='', relief='raised',
                 repeatdelay=0, repeatinterval=0, highlightthickness=1)
    _kind = 'button'
    _class = 'Button'

    def _props(self):
        p = self._label_props({})
        p['overrelief'] = str(self._o('overrelief') or '')
        return p

    def invoke(self):
        if self._o('state') == 'disabled':
            return ''
        command = self._o('command')
        if callable(command):
            return command()
        return ''

    def flash(self):
        pass

    def _on_cmd(self, ev):
        self.invoke()


class Checkbutton(_TextOptions, Widget):
    _spec = dict(_LABEL_SPEC, command='', indicatoron=1, offrelief='raised', offvalue=0, onvalue=1,
                 selectcolor='SystemWindow', selectimage='', tristateimage='', tristatevalue='',
                 variable='', highlightthickness=1)
    _kind = 'checkbutton'
    _class = 'Checkbutton'

    def _init_state(self):
        self._opts['_var_obj'] = None

    def _post_create(self):
        if self._opts.get('_var_obj') is None:
            var = IntVar(value=0) if self._o('offvalue') == 0 and self._o('onvalue') == 1 \
                else Variable(value=self._o('offvalue'))
            self._opts['variable'] = var
            self._opts['_var_obj'] = var
            var._watch(self)

    def _set_option(self, name, value, initial=False):
        if name == 'variable':
            old = self._opts.get('_var_obj')
            if old is not None:
                old._unwatch(self)
            var = _as_variable(value, IntVar)
            self._opts['_var_obj'] = var
            if var is not None:
                var._watch(self)
        _TextOptions._set_option(self, name, value, initial)

    def _checked(self):
        var = self._opts.get('_var_obj')
        if var is None:
            return False
        return str(var._value) == str(self._o('onvalue'))

    def _props(self):
        p = self._label_props({})
        p['checked'] = self._checked()
        p['indicator'] = _getboolean(self._o('indicatoron'))
        p['selectcolor'] = _color(self._o('selectcolor'))
        return p

    def select(self):
        self._opts['_var_obj']._store(self._o('onvalue'))

    def deselect(self):
        self._opts['_var_obj']._store(self._o('offvalue'))

    def toggle(self):
        if self._checked():
            self.deselect()
        else:
            self.select()

    def invoke(self):
        if self._o('state') == 'disabled':
            return ''
        self.toggle()
        command = self._o('command')
        return command() if callable(command) else ''

    def flash(self):
        pass

    def _on_check(self, ev):
        if self._o('state') == 'disabled':
            self._changed()
            return
        value = self._o('onvalue') if ev.get('v') else self._o('offvalue')
        self._opts['_var_obj']._store(value)
        self._changed()
        command = self._o('command')
        if callable(command):
            command()


class Radiobutton(_TextOptions, Widget):
    _spec = dict(_LABEL_SPEC, command='', indicatoron=1, offrelief='raised', selectcolor='SystemWindow',
                 selectimage='', tristateimage='', tristatevalue='', value='', variable='selectedButton',
                 highlightthickness=1)
    _kind = 'radiobutton'
    _class = 'Radiobutton'

    def _init_state(self):
        self._opts['_var_obj'] = None

    def _post_create(self):
        if self._opts.get('_var_obj') is None:
            var = _app.vars.get('selectedButton') or Variable(name='selectedButton', value=None)
            self._opts['_var_obj'] = var
            var._watch(self)

    def _set_option(self, name, value, initial=False):
        if name == 'variable':
            old = self._opts.get('_var_obj')
            if old is not None:
                old._unwatch(self)
            var = _as_variable(value)
            self._opts['_var_obj'] = var
            if var is not None:
                var._watch(self)
        _TextOptions._set_option(self, name, value, initial)

    def _checked(self):
        var = self._opts.get('_var_obj')
        if var is None or var._value is None:
            return False
        return str(var._value) == str(self._o('value'))

    def _props(self):
        p = self._label_props({})
        p['checked'] = self._checked()
        p['indicator'] = _getboolean(self._o('indicatoron'))
        p['selectcolor'] = _color(self._o('selectcolor'))
        return p

    def select(self):
        self._opts['_var_obj']._store(self._o('value'))

    def deselect(self):
        if self._checked():
            self._opts['_var_obj']._store('')

    def invoke(self):
        if self._o('state') == 'disabled':
            return ''
        self.select()
        command = self._o('command')
        return command() if callable(command) else ''

    def flash(self):
        pass

    def _on_radio(self, ev):
        self.invoke()
        self._changed()


# Entry

_ENTRY_SPEC = {
    'background': 'SystemWindow', 'borderwidth': 1, 'cursor': 'xterm',
    'disabledbackground': 'SystemButtonFace', 'disabledforeground': 'SystemDisabledText',
    'exportselection': 1, 'font': 'TkTextFont', 'foreground': 'SystemWindowText',
    'highlightbackground': 'SystemButtonFace', 'highlightcolor': 'SystemWindowFrame',
    'highlightthickness': 0, 'insertbackground': 'SystemWindowText', 'insertborderwidth': 0,
    'insertofftime': 300, 'insertontime': 600, 'insertwidth': 2, 'invalidcommand': '',
    'justify': 'left', 'readonlybackground': 'SystemButtonFace', 'relief': 'sunken',
    'selectbackground': 'SystemHighlight', 'selectborderwidth': 0,
    'selectforeground': 'SystemHighlightText', 'show': '', 'state': 'normal', 'takefocus': '',
    'textvariable': '', 'validate': 'none', 'validatecommand': '', 'width': 20,
    'xscrollcommand': '',
}


class Entry(Widget):
    _spec = dict(_ENTRY_SPEC)
    _kind = 'entry'
    _class = 'Entry'

    def _init_state(self):
        self._value = ''
        self._opts['_textvar_obj'] = None

    def _post_create(self):
        var = self._opts.get('_textvar_obj')
        if var is not None:
            self._value = str(var._value) if var._value is not None else ''
            if self._value:
                _app.op('value', self._id, self._value)

    def _watched_vars(self):
        v = self._opts.get('_textvar_obj')
        return [v] if v is not None else []

    def _set_option(self, name, value, initial=False):
        if name == 'textvariable':
            old = self._opts.get('_textvar_obj')
            if old is not None:
                old._unwatch(self)
            var = _as_variable(value)
            self._opts['_textvar_obj'] = var
            if var is not None:
                var._watch(self)
                if not initial:
                    self._set_value(str(var._value) if var._value is not None else '', from_var=True)
        self._opts[name] = value

    def _entry_props(self, p):
        _box_props(self, p)
        p['fg'] = _color(self._o('foreground'))
        p['font'] = _font_css(self._o('font'), 'TkTextFont')
        w = self._o('width')
        p['width'] = [float(w), 'ch'] if w not in ('', None, 0, '0') else None
        p['justify'] = str(self._o('justify'))
        p['show'] = str(self._o('show') or '')
        p['state'] = _state_str(self._o('state'))
        p['disabledbg'] = _color(self._o('disabledbackground'))
        p['disabledfg'] = _color(self._o('disabledforeground'))
        p['readonlybg'] = _color(self._o('readonlybackground'))
        p['caret'] = _color(self._o('insertbackground'))
        p['selectbg'] = _color(self._o('selectbackground'))
        p['selectfg'] = _color(self._o('selectforeground'))
        return p

    def _props(self):
        return self._entry_props({})

    def _var_changed(self, var):
        self._set_value(str(var._value) if var._value is not None else '', from_var=True)

    def _set_value(self, value, from_var=False):
        self._value = value
        _app.op('value', self._id, value)
        if not from_var:
            var = self._opts.get('_textvar_obj')
            if var is not None:
                var._store(value, source=self)

    def _editable(self):
        return self._o('state') not in ('disabled', 'readonly')

    def _index(self, index):
        n = len(self._value)
        if isinstance(index, int):
            return max(0, min(n, index))
        s = str(index)
        if s == 'end':
            return n
        if s in ('insert', 'anchor'):
            q = _app.query(q='caret', w=self._id)
            return max(0, min(n, int(q))) if q is not None else n
        if s in ('sel.first', 'sel.last'):
            q = _app.query(q='selection', w=self._id)
            if not q or q[0] == q[1]:
                raise TclError('selection isn\'t in widget %s' % self._w)
            return q[0] if s == 'sel.first' else q[1]
        if s.startswith('@'):
            return n
        try:
            return max(0, min(n, int(s)))
        except ValueError:
            raise TclError('bad entry index "%s"' % index)

    def get(self):
        return self._value

    def insert(self, index, string):
        self._check()
        if not self._editable():
            return
        i = self._index(index)
        self._set_value(self._value[:i] + str(string) + self._value[i:])

    def delete(self, first, last=None):
        self._check()
        if not self._editable():
            return
        a = self._index(first)
        b = a + 1 if last is None else self._index(last)
        if b > a:
            self._set_value(self._value[:a] + self._value[b:])

    def index(self, index):
        return self._index(index)

    def icursor(self, index):
        _app.op('caret', self._id, self._index(index))

    def selection_range(self, start, end):
        _app.op('select', self._id, self._index(start), self._index(end))

    select_range = selection_range

    def selection_clear(self):
        _app.op('select', self._id, 0, 0)

    select_clear = selection_clear

    def selection_present(self):
        q = _app.query(q='selection', w=self._id)
        return bool(q and q[0] != q[1])

    select_present = selection_present

    def selection_from(self, index):
        pass

    def selection_to(self, index):
        pass

    def selection_adjust(self, index):
        pass

    def xview(self, *args):
        return (0.0, 1.0)

    def xview_moveto(self, fraction):
        pass

    def xview_scroll(self, number, what):
        pass

    def scan_mark(self, x):
        pass

    def scan_dragto(self, x):
        pass

    def validate(self):
        return self._run_validation(self._value, self._value, -1, 'forced') is not False

    def _on_edit(self, ev):
        new = str(ev.get('v', ''))
        old = self._value
        if new == old:
            return
        mode = str(self._o('validate') or 'none')
        if mode in ('key', 'all'):
            action = 1 if len(new) > len(old) else 0
            ok = self._run_validation(old, new, action, 'key')
            if ok is False:
                _app.op('value', self._id, old)
                inv = self._o('invalidcommand')
                if inv:
                    self._call_vcmd(inv, old, new, action, 'key')
                return
        self._value = new
        var = self._opts.get('_textvar_obj')
        if var is not None:
            var._store(new, source=self)

    def _on_focus_change(self, focused):
        mode = str(self._o('validate') or 'none')
        if mode in ('focus', 'all') or (mode == 'focusin' and focused) or (mode == 'focusout' and not focused):
            ok = self._run_validation(self._value, self._value, -1, 'focusin' if focused else 'focusout')
            if ok is False and self._o('invalidcommand'):
                self._call_vcmd(self._o('invalidcommand'), self._value, self._value, -1,
                                'focusin' if focused else 'focusout')

    def _extra_wants(self):
        mode = str(self._o('validate') or 'none')
        return {'focus'} if mode in ('focus', 'focusin', 'focusout', 'all') else set()

    def _run_validation(self, old, new, action, reason):
        vcmd = self._o('validatecommand')
        if not vcmd:
            return True
        result = self._call_vcmd(vcmd, old, new, action, reason)
        if result is None:
            self._opts['validate'] = 'none'
            return True
        try:
            return _getboolean(result)
        except TclError:
            self._opts['validate'] = 'none'
            return True

    def _call_vcmd(self, vcmd, old, new, action, reason):
        if callable(vcmd):
            func, args = vcmd, []
        else:
            parts = list(vcmd) if isinstance(vcmd, (tuple, list)) else list(_splitlist(vcmd))
            if not parts:
                return True
            head = parts[0]
            func = head if callable(head) else _app.commands.get(str(head))
            args = parts[1:]
            if func is None:
                return True
        # what was inserted or deleted, worked out by comparing old and new
        start = 0
        while start < min(len(old), len(new)) and old[start] == new[start]:
            start += 1
        end_old, end_new = len(old), len(new)
        while end_old > start and end_new > start and old[end_old - 1] == new[end_new - 1]:
            end_old -= 1
            end_new -= 1
        changed = new[start:end_new] if action == 1 else old[start:end_old]
        subs = {'%d': str(action), '%i': str(start if action != -1 else -1), '%P': new, '%s': old,
                '%S': changed, '%v': str(self._o('validate')), '%V': reason, '%W': self._w}
        values = [subs.get(str(a), a) for a in args]
        return _app.deliver(func, *values)


# Text

_TEXT_SPEC = {
    'autoseparators': 1, 'background': 'SystemWindow', 'blockcursor': 0, 'borderwidth': 1,
    'cursor': 'xterm', 'endline': '', 'exportselection': 1, 'font': 'TkFixedFont',
    'foreground': 'SystemWindowText', 'height': 24, 'highlightbackground': 'SystemButtonFace',
    'highlightcolor': 'SystemWindowFrame', 'highlightthickness': 0,
    'inactiveselectbackground': 'SystemButtonFace', 'insertbackground': 'SystemWindowText',
    'insertborderwidth': 0, 'insertofftime': 300, 'insertontime': 600, 'insertunfocussed': 'none',
    'insertwidth': 2, 'maxundo': 0, 'padx': 1, 'pady': 1, 'relief': 'sunken',
    'selectbackground': 'SystemHighlight', 'selectborderwidth': 0,
    'selectforeground': 'SystemHighlightText', 'setgrid': 0, 'spacing1': 0, 'spacing2': 0,
    'spacing3': 0, 'startline': '', 'state': 'normal', 'tabs': '', 'tabstyle': 'tabular',
    'takefocus': '', 'undo': 0, 'width': 80, 'wrap': 'char', 'xscrollcommand': '',
    'yscrollcommand': '',
}

_TEXT_INDEX = _re.compile(r'^\s*(?P<base>@-?\d+,-?\d+|\d+\.(?:\d+|end)|[A-Za-z_][\w.]*)(?P<mods>.*)$')
_TEXT_MOD = _re.compile(r'\s*(?:([+-])\s*(\d+)\s*(c|ch|cha|char|chars|l|li|lin|line|lines|i|in|ind|indi|indic|indice|indices)'
                        r'|(linestart|lineend|wordstart|wordend))', _re.I)


class Text(Widget):
    _spec = dict(_TEXT_SPEC)
    _kind = 'text'
    _class = 'Text'

    def _init_state(self):
        self._value = ''
        self._marks = {}
        self._tags = {}
        self._modified = False

    def _props(self):
        p = _box_props(self, {})
        p['fg'] = _color(self._o('foreground'))
        p['font'] = _font_css(self._o('font'), 'TkFixedFont')
        p['width'] = [float(self._o('width') or 0), 'ch']
        p['height'] = [float(self._o('height') or 0), 'lines']
        p['padx'] = _px(self._o('padx'))
        p['pady'] = _px(self._o('pady'))
        p['wrap'] = str(self._o('wrap'))
        p['state'] = _state_str(self._o('state'))
        p['caret'] = _color(self._o('insertbackground'))
        p['selectbg'] = _color(self._o('selectbackground'))
        p['selectfg'] = _color(self._o('selectforeground'))
        return p

    def _on_edit(self, ev):
        self._value = str(ev.get('v', ''))
        self._modified = True

    def _logical(self):
        return self._value + '\n'

    def _line_starts(self, content):
        starts = [0]
        for i, ch in enumerate(content):
            if ch == '\n':
                starts.append(i + 1)
        return starts

    def _offset(self, index):
        content = self._logical()
        n = len(content)
        starts = self._line_starts(content)
        if isinstance(index, (int, float)) and not isinstance(index, bool):
            index = '%s' % index
        m = _TEXT_INDEX.match(str(index))
        if not m:
            raise TclError('bad text index "%s"' % index)
        base, mods = m.group('base'), m.group('mods')
        if base.startswith('@'):
            pos = n - 1
        elif _re.match(r'^\d+\.', base):
            line_s, char_s = base.split('.', 1)
            line = int(line_s)
            if line < 1:
                pos = 0
            elif line > len(starts):
                pos = n
            else:
                start = starts[line - 1]
                end = (starts[line] - 1) if line < len(starts) else n
                pos = end if char_s == 'end' else min(start + int(char_s), end)
        elif base == 'end':
            pos = n
        elif base in ('insert', 'current'):
            q = _app.query(q='caret', w=self._id)
            pos = self._marks.get(base, n - 1) if q is None else int(q)
        elif base in ('sel.first', 'sel.last'):
            q = _app.query(q='selection', w=self._id)
            if not q or q[0] == q[1]:
                raise TclError('text doesn\'t contain any characters tagged with "sel"')
            pos = q[0] if base == 'sel.first' else q[1]
        elif base in self._marks:
            pos = self._marks[base]
        elif base.endswith('.first') or base.endswith('.last'):
            tag = base.rsplit('.', 1)[0]
            ranges = self._tags.get(tag, {}).get('ranges', [])
            if not ranges:
                raise TclError('text doesn\'t contain any characters tagged with "%s"' % tag)
            pos = ranges[0][0] if base.endswith('.first') else ranges[-1][1]
        else:
            raise TclError('bad text index "%s"' % index)
        pos = max(0, min(n, pos))
        for mm in _TEXT_MOD.finditer(mods):
            if mm.group(4):
                word = mm.group(4).lower()
                line_start = content.rfind('\n', 0, pos) + 1 if pos > 0 else 0
                if word == 'linestart':
                    pos = line_start
                elif word == 'lineend':
                    e = content.find('\n', pos)
                    pos = e if e >= 0 else n
                elif word == 'wordstart':
                    while pos > 0 and (content[pos - 1].isalnum() or content[pos - 1] == '_'):
                        pos -= 1
                elif word == 'wordend':
                    while pos < n - 1 and (content[pos].isalnum() or content[pos] == '_'):
                        pos += 1
            else:
                sign = 1 if mm.group(1) == '+' else -1
                amount = int(mm.group(2))
                unit = mm.group(3).lower()
                if unit.startswith('l'):
                    cur_line = content.count('\n', 0, pos)
                    col = pos - starts[cur_line]
                    target = max(0, min(len(starts) - 1, cur_line + sign * amount))
                    line_end = (starts[target + 1] - 1) if target + 1 < len(starts) else n
                    pos = min(starts[target] + col, line_end)
                else:
                    pos = max(0, min(n, pos + sign * amount))
        return max(0, min(n, pos))

    def _to_index(self, offset):
        content = self._logical()
        offset = max(0, min(len(content), offset))
        line = content.count('\n', 0, offset) + 1
        col = offset - (content.rfind('\n', 0, offset) + 1)
        return '%d.%d' % (line, col)

    def _editable(self):
        return self._o('state') != 'disabled'

    def _set_text(self, value):
        self._value = value
        self._modified = True
        _app.op('value', self._id, value)

    def index(self, index):
        return self._to_index(self._offset(index))

    def get(self, index1, index2=None):
        content = self._logical()
        a = self._offset(index1)
        if index2 is None:
            return content[a:a + 1]
        b = self._offset_end(index2)
        return content[a:b] if b > a else ''

    _offset_end = _offset

    def insert(self, index, chars, *args):
        self._check()
        if not self._editable():
            return
        text = str(chars)
        for i, a in enumerate(args):
            if i % 2 == 1:
                text += str(a)
        pos = min(self._offset(index), len(self._value))
        self._set_text(self._value[:pos] + text + self._value[pos:])

    def delete(self, index1, index2=None):
        self._check()
        if not self._editable():
            return
        a = min(self._offset(index1), len(self._value))
        b = a + 1 if index2 is None else min(self._offset_end(index2), len(self._value))
        if b > a:
            self._set_text(self._value[:a] + self._value[b:])

    def replace(self, index1, index2, chars, *args):
        if not self._editable():
            return
        a = min(self._offset(index1), len(self._value))
        b = min(self._offset_end(index2), len(self._value))
        self._set_text(self._value[:a] + str(chars) + self._value[max(a, b):])

    def compare(self, index1, op, index2):
        a, b = self._offset(index1), self._offset(index2)
        return {'<': a < b, '<=': a <= b, '==': a == b, '>=': a >= b, '>': a > b, '!=': a != b}[op]

    def count(self, index1, index2, *args):
        a, b = self._offset(index1), self._offset_end(index2)
        return (abs(b - a),)

    def see(self, index):
        _app.op('see', self._id, self._offset(index))

    def mark_set(self, markName, index):
        pos = self._offset(index)
        self._marks[markName] = pos
        if markName == 'insert':
            _app.op('caret', self._id, pos)

    def mark_unset(self, *markNames):
        for m in markNames:
            self._marks.pop(m, None)

    def mark_names(self):
        return ('insert', 'current') + tuple(self._marks)

    def mark_gravity(self, markName, direction=None):
        return 'right'

    def mark_next(self, index):
        return ''

    def mark_previous(self, index):
        return ''

    def tag_add(self, tagName, index1, *args):
        tag = self._tags.setdefault(tagName, {'config': {}, 'ranges': []})
        a = self._offset(index1)
        b = self._offset_end(args[0]) if args else a + 1
        tag['ranges'].append((a, b))

    def tag_remove(self, tagName, index1, index2=None):
        if tagName in self._tags:
            self._tags[tagName]['ranges'] = []

    def tag_delete(self, *tagNames):
        for t in tagNames:
            self._tags.pop(t, None)

    def tag_configure(self, tagName, cnf=None, **kw):
        tag = self._tags.setdefault(tagName, {'config': {}, 'ranges': []})
        tag['config'].update(_cnfmerge(cnf, kw))
        return None

    tag_config = tag_configure

    def tag_cget(self, tagName, option):
        return self._tags.get(tagName, {}).get('config', {}).get(_optname(option), '')

    def tag_names(self, index=None):
        return ('sel',) + tuple(self._tags)

    def tag_ranges(self, tagName):
        out = []
        for a, b in self._tags.get(tagName, {}).get('ranges', []):
            out.extend([self._to_index(a), self._to_index(b)])
        return tuple(out)

    def tag_nextrange(self, tagName, index1, index2=None):
        return ()

    def tag_prevrange(self, tagName, index1, index2=None):
        return ()

    def tag_raise(self, tagName, aboveThis=None):
        pass

    def tag_lower(self, tagName, belowThis=None):
        pass

    def tag_bind(self, tagName, sequence, func, add=None):
        return _app.register(func)

    def tag_unbind(self, tagName, sequence, funcid=None):
        pass

    def search(self, pattern, index, stopindex=None, forwards=None, backwards=None, exact=None,
               regexp=None, nocase=None, count=None, elide=None):
        content = self._logical()
        start = self._offset(index)
        stop = self._offset_end(stopindex) if stopindex is not None else None
        flags = _re.I if nocase else 0
        pat = str(pattern) if regexp else _re.escape(str(pattern))
        if backwards:
            region_start = stop if stop is not None else 0
            found = None
            for m in _re.finditer(pat, content[region_start:start], flags):
                found = m
            if found is None:
                return ''
            pos, length = region_start + found.start(), len(found.group(0))
        else:
            region_end = stop if stop is not None else len(content)
            m = _re.compile(pat, flags).search(content, start, region_end)
            if m is None and stop is None and start > 0:
                m = _re.compile(pat, flags).search(content, 0, start)
            if m is None:
                return ''
            pos, length = m.start(), len(m.group(0))
        if count is not None and isinstance(count, Variable):
            count.set(length)
        return self._to_index(pos)

    def edit_modified(self, arg=None):
        if arg is None:
            return self._modified
        self._modified = _getboolean(arg)

    def edit_undo(self):
        pass

    def edit_redo(self):
        pass

    def edit_reset(self):
        pass

    def edit_separator(self):
        pass

    def edit(self, *args):
        return ''

    def bbox(self, index):
        return None

    def dlineinfo(self, index):
        return None

    def dump(self, index1, index2=None, command=None, **kw):
        return [('text', self.get(index1, index2 or index1 + '+1c'), self.index(index1))]

    def image_create(self, index, cnf={}, **kw):
        return ''

    def window_create(self, index, cnf={}, **kw):
        pass

    def xview(self, *args):
        return (0.0, 1.0)

    def yview(self, *args):
        return (0.0, 1.0)

    def xview_moveto(self, fraction):
        pass

    def yview_moveto(self, fraction):
        if float(fraction) >= 1:
            _app.op('see', self._id, len(self._value))

    def xview_scroll(self, number, what):
        pass

    def yview_scroll(self, number, what):
        pass

    def yview_pickplace(self, *what):
        pass

    def scan_mark(self, x, y):
        pass

    def scan_dragto(self, x, y):
        pass

    def debug(self, boolean=None):
        return 0


# Listbox

class Listbox(Widget):
    _spec = {
        'activestyle': 'underline', 'background': 'SystemWindow', 'borderwidth': 1, 'cursor': '',
        'disabledforeground': 'SystemDisabledText', 'exportselection': 1, 'font': 'TkDefaultFont',
        'foreground': 'SystemWindowText', 'height': 10, 'highlightbackground': 'SystemButtonFace',
        'highlightcolor': 'SystemWindowFrame', 'highlightthickness': 1, 'justify': 'left',
        'listvariable': '', 'relief': 'sunken', 'selectbackground': 'SystemHighlight',
        'selectborderwidth': 0, 'selectforeground': 'SystemHighlightText', 'selectmode': 'browse',
        'setgrid': 0, 'state': 'normal', 'takefocus': '', 'width': 20, 'xscrollcommand': '',
        'yscrollcommand': '',
    }
    _kind = 'listbox'
    _class = 'Listbox'

    def _init_state(self):
        self._items = []
        self._selection = set()
        self._item_opts = {}
        self._active = 0
        self._anchor = 0
        self._items_dirty = True
        self._opts['_listvar_obj'] = None

    def _watched_vars(self):
        v = self._opts.get('_listvar_obj')
        return [v] if v is not None else []

    def _set_option(self, name, value, initial=False):
        if name == 'listvariable':
            old = self._opts.get('_listvar_obj')
            if old is not None:
                old._unwatch(self)
            var = _as_variable(value)
            self._opts['_listvar_obj'] = var
            if var is not None:
                var._watch(self)
                self._items_from_var(var)
        self._opts[name] = value

    def _items_from_var(self, var):
        value = var._value
        if isinstance(value, (list, tuple)):
            self._items = [str(v) for v in value]
        elif value in (None, ''):
            self._items = []
        else:
            self._items = [str(v) for v in _splitlist(value)]
        self._selection = {i for i in self._selection if i < len(self._items)}
        self._items_dirty = True

    def _var_changed(self, var):
        self._items_from_var(var)
        self._changed()

    def _write_var(self):
        var = self._opts.get('_listvar_obj')
        if var is not None:
            var._store(tuple(self._items), source=self)

    def _props(self):
        p = _box_props(self, {})
        p['fg'] = _color(self._o('foreground'))
        p['font'] = _font_css(self._o('font'))
        p['width'] = [float(self._o('width') or 0), 'ch'] if self._o('width') else None
        p['height'] = [float(self._o('height') or 0), 'lines'] if self._o('height') else None
        p['selectbg'] = _color(self._o('selectbackground'))
        p['selectfg'] = _color(self._o('selectforeground'))
        p['selectmode'] = str(self._o('selectmode'))
        p['state'] = _state_str(self._o('state'))
        p['justify'] = str(self._o('justify'))
        p['disabledfg'] = _color(self._o('disabledforeground'))
        return p

    def _sync(self):
        _app.op('config', self._id, self._props())
        if self._items_dirty:
            self._items_dirty = False
            styles = {}
            for i, o in self._item_opts.items():
                if i < len(self._items):
                    styles[str(i)] = {'bg': _color(o.get('background', '')) or None,
                                      'fg': _color(o.get('foreground', '')) or None,
                                      'selectbg': _color(o.get('selectbackground', '')) or None,
                                      'selectfg': _color(o.get('selectforeground', '')) or None}
            _app.op('items', self._id, self._items, styles)
        _app.op('selection', self._id, sorted(self._selection))

    def _idx(self, index, for_insert=False):
        n = len(self._items)
        if isinstance(index, int):
            return max(0, min(n if for_insert else n, index))
        s = str(index)
        if s == 'end':
            return n
        if s == 'active':
            return self._active
        if s == 'anchor':
            return self._anchor
        if s.startswith('@'):
            try:
                y = int(s[1:].split(',')[1])
            except (IndexError, ValueError):
                y = 0
            return self.nearest(y)
        try:
            return int(s)
        except ValueError:
            raise TclError('bad listbox index "%s": must be active, anchor, end, @x,y, or a number' % index)

    def insert(self, index, *elements):
        self._check()
        i = self._idx(index, True)
        i = max(0, min(len(self._items), i))
        new = [str(e) for e in elements]
        self._items[i:i] = new
        self._selection = {s + len(new) if s >= i else s for s in self._selection}
        self._item_opts = {(k + len(new) if k >= i else k): v for k, v in self._item_opts.items()}
        self._items_dirty = True
        self._write_var()
        self._changed()

    def delete(self, first, last=None):
        self._check()
        a = self._idx(first)
        b = a if last is None else self._idx(last)
        if b >= len(self._items):
            b = len(self._items) - 1
        if a < 0 or b < a or a >= len(self._items):
            return
        count = b - a + 1
        del self._items[a:b + 1]
        self._selection = {s - count if s > b else s for s in self._selection if not a <= s <= b}
        self._item_opts = {(k - count if k > b else k): v for k, v in self._item_opts.items() if not a <= k <= b}
        self._items_dirty = True
        self._write_var()
        self._changed()

    def get(self, first, last=None):
        a = self._idx(first)
        if last is None:
            return self._items[a] if 0 <= a < len(self._items) else ''
        b = self._idx(last)
        if b >= len(self._items):
            b = len(self._items) - 1
        return tuple(self._items[a:b + 1])

    def size(self):
        return len(self._items)

    def curselection(self):
        return tuple(sorted(self._selection))

    def selection_set(self, first, last=None):
        a = self._idx(first)
        b = a if last is None else self._idx(last)
        for i in range(min(a, b), max(a, b) + 1):
            if 0 <= i < len(self._items):
                self._selection.add(i)
        self._changed()

    select_set = selection_set

    def selection_clear(self, first, last=None):
        a = self._idx(first)
        b = a if last is None else self._idx(last)
        for i in range(min(a, b), max(a, b) + 1):
            self._selection.discard(i)
        self._changed()

    select_clear = selection_clear

    def selection_includes(self, index):
        return 1 if self._idx(index) in self._selection else 0

    select_includes = selection_includes

    def selection_anchor(self, index):
        self._anchor = self._idx(index)

    select_anchor = selection_anchor

    def activate(self, index):
        self._active = self._idx(index)

    def index(self, index):
        return self._idx(index)

    def nearest(self, y):
        q = _app.query(q='lbnearest', w=self._id, y=int(y))
        if q is None:
            return 0
        return int(q)

    def see(self, index):
        _app.op('see', self._id, self._idx(index))

    def itemconfigure(self, index, cnf=None, **kw):
        i = self._idx(index)
        opts = self._item_opts.setdefault(i, {})
        for k, v in _cnfmerge(cnf, kw).items():
            opts[_optname(k)] = v
        self._items_dirty = True
        self._changed()

    itemconfig = itemconfigure

    def itemcget(self, index, option):
        return self._item_opts.get(self._idx(index), {}).get(_optname(option), '')

    def bbox(self, index):
        return None

    def xview(self, *args):
        return (0.0, 1.0)

    def yview(self, *args):
        return (0.0, 1.0)

    def xview_moveto(self, fraction):
        pass

    def yview_moveto(self, fraction):
        pass

    def xview_scroll(self, number, what):
        pass

    def yview_scroll(self, number, what):
        pass

    def scan_mark(self, x, y):
        pass

    def scan_dragto(self, x, y):
        pass

    def _on_lbsel(self, ev):
        if self._o('state') == 'disabled':
            self._changed()
            return
        sel = {int(i) for i in ev.get('sel', []) if 0 <= int(i) < len(self._items)}
        self._selection = sel
        if 'a' in ev:
            self._active = int(ev['a'])
        _app.fire_virtual(self, 'ListboxSelect')


# Scale

class Scale(Widget):
    _spec = {
        'activebackground': 'SystemButtonFace', 'background': 'SystemButtonFace', 'bigincrement': 0,
        'borderwidth': 1, 'command': '', 'cursor': '', 'digits': 0, 'font': 'TkDefaultFont',
        'foreground': 'SystemButtonText', 'from': 0, 'highlightbackground': 'SystemButtonFace',
        'highlightcolor': 'SystemWindowFrame', 'highlightthickness': 2, 'label': '', 'length': 100,
        'orient': 'vertical', 'relief': 'flat', 'repeatdelay': 300, 'repeatinterval': 100,
        'resolution': 1, 'showvalue': 1, 'sliderlength': 30, 'sliderrelief': 'raised',
        'state': 'normal', 'takefocus': '', 'tickinterval': 0, 'to': 100,
        'troughcolor': 'SystemScrollbar', 'variable': '', 'width': 15,
    }
    _kind = 'scale'
    _class = 'Scale'

    def _init_state(self):
        self._value = 0.0
        self._opts['_var_obj'] = None

    def _post_create(self):
        var = self._opts.get('_var_obj')
        if var is None:
            var = DoubleVar(value=float(self._o('from')))
            self._opts['_var_obj'] = var
            var._watch(self)
        self._value = self._clamp(self._raw_float(var._value))
        self._changed()

    def _watched_vars(self):
        v = self._opts.get('_var_obj')
        return [v] if v is not None else []

    def _set_option(self, name, value, initial=False):
        if name == 'variable':
            old = self._opts.get('_var_obj')
            if old is not None:
                old._unwatch(self)
            var = _as_variable(value, DoubleVar)
            self._opts['_var_obj'] = var
            if var is not None:
                var._watch(self)
                if not initial:
                    self._value = self._clamp(self._raw_float(var._value))
        self._opts[name] = value

    def _raw_float(self, value):
        try:
            return float(value)
        except (TypeError, ValueError):
            return float(self._o('from'))

    def _resolution(self):
        try:
            return float(self._o('resolution'))
        except (TypeError, ValueError):
            return 1.0

    def _clamp(self, value):
        lo, hi = float(self._o('from')), float(self._o('to'))
        if lo > hi:
            lo, hi = hi, lo
        value = max(lo, min(hi, value))
        res = self._resolution()
        if res > 0:
            value = round(round(value / res) * res, 10)
        return value

    def _format(self, value):
        res = self._resolution()
        if res >= 1 and float(value).is_integer():
            return str(int(value))
        digits = int(self._o('digits') or 0)
        if digits > 0:
            return ('%.' + str(max(0, digits - len(str(int(abs(value)))))) + 'f') % value
        decimals = 0
        if 0 < res < 1:
            decimals = max(0, len(('%f' % res).rstrip('0').split('.')[1]))
        return ('%.' + str(decimals) + 'f') % value

    def _props(self):
        p = _box_props(self, {})
        p['fg'] = _color(self._o('foreground'))
        p['font'] = _font_css(self._o('font'))
        p['from'] = float(self._o('from'))
        p['to'] = float(self._o('to'))
        p['res'] = self._resolution()
        p['value'] = self._value
        p['text'] = self._format(self._value)
        p['orient'] = str(self._o('orient'))
        p['length'] = _px(self._o('length'))
        p['thickness'] = _px(self._o('width'))
        p['showvalue'] = _getboolean(self._o('showvalue'))
        p['label'] = str(self._o('label') or '')
        p['state'] = _state_str(self._o('state'))
        p['trough'] = _color(self._o('troughcolor'))
        p['activebg'] = _color(self._o('activebackground'))
        return p

    def _var_changed(self, var):
        self._value = self._clamp(self._raw_float(var._value))
        self._changed()

    def get(self):
        value = self._value
        if self._resolution() >= 1 and float(value).is_integer():
            return int(value)
        return float(value)

    def set(self, value):
        new = self._clamp(float(value))
        changed = new != self._value
        self._value = new
        var = self._opts.get('_var_obj')
        if var is not None:
            var._store(new, source=self)
        self._changed()
        if changed:
            self._schedule_command()

    def _schedule_command(self):
        command = self._o('command')
        if callable(command):
            text = self._format(self._value)
            _app.after_idle(command, (text,))

    def coords(self, value=None):
        return (0, 0)

    def identify(self, x, y):
        return ''

    def _on_scale(self, ev):
        if self._o('state') == 'disabled':
            self._changed()
            return
        new = self._clamp(float(ev.get('v', self._value)))
        if new == self._value:
            return
        self._value = new
        var = self._opts.get('_var_obj')
        if var is not None:
            var._store(new, source=self)
        self._changed()
        command = self._o('command')
        if callable(command):
            command(self._format(new))


# Spinbox

class Spinbox(Entry):
    _spec = dict(_ENTRY_SPEC, activebackground='SystemButtonFace', buttonbackground='SystemButtonFace',
                 buttoncursor='', buttondownrelief='raised', buttonuprelief='raised', command='',
                 format='', increment=1, to=0, values='', wrap=0)
    _spec['from'] = 0
    _kind = 'spinbox'
    _class = 'Spinbox'

    def _post_create(self):
        Entry._post_create(self)
        if not self._value:
            self._value = self._initial()
            if self._value:
                _app.op('value', self._id, self._value)
                var = self._opts.get('_textvar_obj')
                if var is not None:
                    var._store(self._value, source=self)

    def _values(self):
        v = self._o('values')
        if v in ('', None):
            return None
        return [str(x) for x in (v if isinstance(v, (list, tuple)) else _splitlist(v))]

    def _is_integral(self):
        try:
            return all(float(self._o(k)).is_integer() for k in ('from', 'to', 'increment'))
        except (TypeError, ValueError):
            return False

    def _fmt(self, value):
        fmt = self._o('format')
        if fmt:
            try:
                return str(fmt) % value
            except (TypeError, ValueError):
                pass
        return str(int(value)) if self._is_integral() else str(float(value))

    def _initial(self):
        values = self._values()
        if values:
            return values[0]
        try:
            return self._fmt(float(self._o('from')))
        except (TypeError, ValueError):
            return ''

    def _props(self):
        p = self._entry_props({})
        p['buttonbg'] = _color(self._o('buttonbackground'))
        return p

    def set(self, value):
        self._set_value(str(value))

    def invoke(self, element):
        self._step(1 if element == 'buttonup' else -1)

    def _step(self, direction):
        if self._o('state') == 'disabled':
            return
        values = self._values()
        wrap = _getboolean(self._o('wrap'))
        if values:
            try:
                i = values.index(self._value)
            except ValueError:
                i = -1 if direction > 0 else len(values)
            i += direction
            if i >= len(values):
                i = 0 if wrap else len(values) - 1
            elif i < 0:
                i = len(values) - 1 if wrap else 0
            new = values[i]
        else:
            lo, hi = float(self._o('from')), float(self._o('to'))
            inc = float(self._o('increment') or 1)
            try:
                cur = float(self._value)
            except ValueError:
                cur = lo
            v = cur + direction * inc
            if v > hi:
                v = lo if wrap else hi
            elif v < lo:
                v = hi if wrap else lo
            new = self._fmt(v)
        self._set_value(new)
        command = self._o('command')
        if callable(command):
            command()

    def _on_spin(self, ev):
        self._step(1 if int(ev.get('d', 1)) > 0 else -1)

    def identify(self, x, y):
        return ''

    def scan(self, *args):
        pass


# Scrollbar: the page scrolls lists and text itself, so a scrollbar draws nothing.

class Scrollbar(Widget):
    _spec = {
        'activebackground': 'SystemButtonFace', 'activerelief': 'raised', 'background': 'SystemButtonFace',
        'borderwidth': 0, 'command': '', 'cursor': '', 'elementborderwidth': -1,
        'highlightbackground': 'SystemButtonFace', 'highlightcolor': 'SystemWindowFrame',
        'highlightthickness': 0, 'jump': 0, 'orient': 'vertical', 'relief': 'sunken',
        'repeatdelay': 300, 'repeatinterval': 100, 'takefocus': '', 'troughcolor': 'SystemScrollbar',
        'width': 17,
    }
    _kind = 'scrollbar'
    _class = 'Scrollbar'

    def _init_state(self):
        self._fractions = (0.0, 1.0)

    def _props(self):
        return {'orient': str(self._o('orient'))}

    def set(self, first, last):
        self._fractions = (float(first), float(last))

    def get(self):
        return self._fractions

    def activate(self, index=None):
        return ''

    def delta(self, deltax, deltay):
        return 0.0

    def fraction(self, x, y):
        return 0.0

    def identify(self, x, y):
        return ''


# ── Canvas ──────────────────────────────────────────────────────────────────

_ITEM_DEFAULTS = {
    'rectangle': {'fill': '', 'outline': 'black', 'width': 1.0, 'dash': '', 'state': '', 'tags': (),
                  'activefill': '', 'activeoutline': '', 'stipple': '', 'outlinestipple': '',
                  'disabledfill': '', 'disabledoutline': '', 'dashoffset': 0, 'activewidth': 0,
                  'activedash': '', 'disabledwidth': 0, 'offset': '0,0', 'outlineoffset': '0,0'},
    'oval': None,
    'arc': {'fill': '', 'outline': 'black', 'width': 1.0, 'dash': '', 'state': '', 'tags': (),
            'start': 0.0, 'extent': 90.0, 'style': 'pieslice', 'activefill': '', 'activeoutline': '',
            'stipple': '', 'outlinestipple': '', 'disabledfill': '', 'disabledoutline': '',
            'activewidth': 0, 'offset': '0,0'},
    'line': {'fill': 'black', 'width': 1.0, 'dash': '', 'state': '', 'tags': (), 'arrow': 'none',
             'arrowshape': (8, 10, 3), 'capstyle': 'butt', 'joinstyle': 'round', 'smooth': 0,
             'splinesteps': 12, 'activefill': '', 'activewidth': 0, 'stipple': '', 'disabledfill': '',
             'dashoffset': 0},
    'polygon': {'fill': 'black', 'outline': '', 'width': 1.0, 'dash': '', 'state': '', 'tags': (),
                'joinstyle': 'round', 'smooth': 0, 'splinesteps': 12, 'activefill': '',
                'activeoutline': '', 'stipple': '', 'outlinestipple': '', 'disabledfill': '',
                'disabledoutline': '', 'activewidth': 0, 'offset': '0,0'},
    'text': {'text': '', 'fill': 'black', 'font': 'TkDefaultFont', 'anchor': 'center',
             'justify': 'left', 'width': 0, 'angle': 0.0, 'state': '', 'tags': (), 'activefill': '',
             'disabledfill': '', 'stipple': '', 'underline': -1, 'offset': '0,0'},
    'image': {'image': '', 'anchor': 'center', 'state': '', 'tags': (), 'activeimage': '',
              'disabledimage': ''},
    'window': {'window': '', 'anchor': 'center', 'width': 0, 'height': 0, 'state': '', 'tags': ()},
    'bitmap': {'bitmap': '', 'anchor': 'center', 'state': '', 'tags': (), 'foreground': 'black',
               'background': ''},
}
_ITEM_DEFAULTS['oval'] = dict(_ITEM_DEFAULTS['rectangle'])
_MIN_COORDS = {'rectangle': 4, 'oval': 4, 'arc': 4, 'line': 4, 'polygon': 6, 'text': 2,
               'image': 2, 'window': 2, 'bitmap': 2}


def _flatten_coords(args):
    out = []

    def walk(a):
        if isinstance(a, (tuple, list)):
            for x in a:
                walk(x)
        elif isinstance(a, str):
            for part in a.replace(',', ' ').split():
                out.append(_fpx(part))
        else:
            out.append(float(a))
    walk(args)
    return out


def _dash(value):
    if value in ('', None, ()):
        return None
    if isinstance(value, (tuple, list)):
        return [float(v) for v in value]
    if isinstance(value, (int, float)):
        return [float(value)]
    s = str(value).strip()
    if all(c in '.-,_ ' for c in s):
        pattern = {'.': [2, 4], '-': [6, 4], '-.': [6, 4, 2, 4], '-..': [6, 4, 2, 4, 2, 4],
                   ',': [4, 4], '_': [8, 4]}
        return pattern.get(s.replace(' ', ''), [4, 4])
    return [float(v) for v in s.split()]


class Canvas(Widget):
    _spec = {
        'background': 'SystemButtonFace', 'borderwidth': 0, 'closeenough': 1, 'confine': 1,
        'cursor': '', 'height': 265, 'highlightbackground': 'SystemButtonFace',
        'highlightcolor': 'SystemWindowFrame', 'highlightthickness': 2,
        'insertbackground': 'SystemButtonText', 'insertborderwidth': 0, 'insertofftime': 300,
        'insertontime': 600, 'insertwidth': 2, 'offset': '0,0', 'relief': 'flat',
        'scrollregion': '', 'selectbackground': 'SystemHighlight', 'selectborderwidth': 1,
        'selectforeground': 'SystemHighlightText', 'state': 'normal', 'takefocus': '',
        'width': 378, 'xscrollcommand': '', 'xscrollincrement': 0, 'yscrollcommand': '',
        'yscrollincrement': 0,
    }
    _kind = 'canvas'
    _class = 'Canvas'

    def _init_state(self):
        self._items = {}
        self._order = []
        self._next_item = 1
        self._item_bindings = {}
        self._current = None
        self._dirty_items = {}

    def _props(self):
        p = _box_props(self, {})
        p['width'] = _px(self._o('width'))
        p['height'] = _px(self._o('height'))
        return p

    def cget(self, key):
        value = Misc.cget(self, key)
        if _optname(key) in ('width', 'height'):
            return str(_px(value))
        return value

    __getitem__ = cget

    def _sync(self):
        _app.op('config', self._id, self._props())
        self._flush_items()

    def _flush_items(self):
        dirty, self._dirty_items = self._dirty_items, {}
        for iid, kind in dirty.items():
            item = self._items.get(iid)
            if item is None:
                continue
            if kind == 'coords':
                _app.op('cvcoords', self._id, iid, item['coords'])
            else:
                _app.op('cvitem', self._id, iid, item['type'], item['coords'], self._item_props(item))

    def _touch(self, iid, kind='full'):
        if self._dirty_items.get(iid) != 'full':
            self._dirty_items[iid] = kind
        _app.mark(self)

    def _extra_wants(self):
        out = set()
        for table in self._item_bindings.values():
            out |= table.wants()
        return out

    # item properties for the page
    def _item_props(self, item):
        o = item['opts']
        t = item['type']
        p = {'state': str(o.get('state') or '')}
        if t in ('rectangle', 'oval', 'arc', 'polygon'):
            p['fill'] = _color(o.get('fill'))
            p['outline'] = _color(o.get('outline'))
            p['width'] = _fpx(o.get('width', 1))
            p['dash'] = _dash(o.get('dash'))
            p['activefill'] = _color(o.get('activefill')) or None
            p['activeoutline'] = _color(o.get('activeoutline')) or None
            if t == 'arc':
                p['start'] = float(o.get('start', 0))
                p['extent'] = float(o.get('extent', 90))
                p['style'] = str(o.get('style', 'pieslice'))
            if t == 'polygon':
                p['smooth'] = _getboolean(o.get('smooth', 0)) if o.get('smooth') not in ('bezier', 'raw') else True
                p['joinstyle'] = str(o.get('joinstyle', 'round'))
        elif t == 'line':
            p['fill'] = _color(o.get('fill'))
            p['width'] = _fpx(o.get('width', 1))
            p['dash'] = _dash(o.get('dash'))
            p['arrow'] = str(o.get('arrow', 'none'))
            p['arrowshape'] = [_fpx(v) for v in _flatten_coords(o.get('arrowshape', (8, 10, 3)))]
            p['capstyle'] = str(o.get('capstyle', 'butt'))
            p['joinstyle'] = str(o.get('joinstyle', 'round'))
            smooth = o.get('smooth', 0)
            p['smooth'] = True if smooth in ('bezier', 'raw', 'true') else _getboolean(smooth) if smooth != '' else False
            p['activefill'] = _color(o.get('activefill')) or None
        elif t == 'text':
            p['text'] = str(o.get('text', ''))
            p['fill'] = _color(o.get('fill'))
            p['font'] = _font_css(o.get('font'))
            p['anchor'] = _anchor(o.get('anchor', 'center'))
            p['justify'] = str(o.get('justify', 'left'))
            p['width'] = _fpx(o.get('width', 0))
            p['angle'] = float(o.get('angle', 0) or 0)
            p['activefill'] = _color(o.get('activefill')) or None
        elif t == 'image':
            name = _image_name(o.get('image'))
            img = _app.images.get(name) if name else None
            p['image'] = name
            p['iw'] = img.width() if img else 0
            p['ih'] = img.height() if img else 0
            p['anchor'] = _anchor(o.get('anchor', 'center'))
        elif t == 'window':
            win = o.get('window')
            if isinstance(win, str) and win:
                win = self.nametowidget(win)
            p['win'] = win._id if isinstance(win, Misc) else None
            p['anchor'] = _anchor(o.get('anchor', 'center'))
            p['width'] = _px(o.get('width', 0))
            p['height'] = _px(o.get('height', 0))
        return p

    # creating items
    def _create_item(self, itemtype, args, kw):
        args = list(args)
        cnf = {}
        if args and isinstance(args[-1], dict):
            cnf = args.pop()
        coords = _flatten_coords(args)
        need = _MIN_COORDS[itemtype]
        if itemtype in ('rectangle', 'oval', 'arc'):
            if len(coords) != 4:
                raise TclError('wrong # coordinates: expected 4, got %d' % len(coords))
        elif itemtype in ('text', 'image', 'window', 'bitmap'):
            if len(coords) != 2:
                raise TclError('wrong # coordinates: expected 2, got %d' % len(coords))
        elif len(coords) < need or len(coords) % 2:
            if len(coords) % 2:
                raise TclError('wrong # coordinates: expected an even number, got %d' % len(coords))
            raise TclError('wrong # coordinates: expected at least %d, got %d' % (need, len(coords)))
        opts = dict(_ITEM_DEFAULTS[itemtype])
        self._apply_item_options(itemtype, opts, _cnfmerge(cnf, kw))
        iid = self._next_item
        self._next_item += 1
        item = {'type': itemtype, 'coords': coords, 'opts': opts,
                'tags': list(self._normalise_tags(opts.get('tags', ())))}
        self._items[iid] = item
        self._order.append(iid)
        if itemtype == 'window':
            win = opts.get('window')
            if isinstance(win, Misc):
                win._manager = 'canvas'
        _app.op('cvitem', self._id, iid, itemtype, coords, self._item_props(item))
        return iid

    def _normalise_tags(self, tags):
        if tags in (None, ''):
            return ()
        if isinstance(tags, str):
            return _splitlist(tags)
        return tuple(str(t) for t in tags)

    def _apply_item_options(self, itemtype, opts, kw):
        for key, value in kw.items():
            name = _optname(key)
            if name not in _ITEM_DEFAULTS[itemtype]:
                raise TclError('unknown option "-%s"' % name)
            if name == 'image' and value not in ('', None) and _image_name(value) not in _app.images:
                raise TclError('image "%s" doesn\'t exist' % value)
            opts[name] = value
            if name == 'image':
                opts['_image_ref'] = value

    def create_rectangle(self, *args, **kw):
        return self._create_item('rectangle', args, kw)

    def create_oval(self, *args, **kw):
        return self._create_item('oval', args, kw)

    def create_arc(self, *args, **kw):
        return self._create_item('arc', args, kw)

    def create_line(self, *args, **kw):
        return self._create_item('line', args, kw)

    def create_polygon(self, *args, **kw):
        return self._create_item('polygon', args, kw)

    def create_text(self, *args, **kw):
        return self._create_item('text', args, kw)

    def create_image(self, *args, **kw):
        return self._create_item('image', args, kw)

    def create_window(self, *args, **kw):
        return self._create_item('window', args, kw)

    def create_bitmap(self, *args, **kw):
        return self._create_item('bitmap', args, kw)

    # finding items
    def _find(self, tag_or_id):
        if tag_or_id is None:
            return []
        if isinstance(tag_or_id, int) and not isinstance(tag_or_id, bool):
            return [tag_or_id] if tag_or_id in self._items else []
        s = str(tag_or_id)
        if s.isdigit():
            n = int(s)
            return [n] if n in self._items else []
        if s == 'all':
            return list(self._order)
        if s == 'current':
            return [self._current] if self._current in self._items else []
        if '&&' in s or '||' in s or s.startswith('!') or '^' in s:
            return [i for i in self._order if self._tag_expr(s, self._items[i]['tags'], i)]
        return [i for i in self._order if s in self._items[i]['tags']]

    def _tag_expr(self, expr, tags, iid):
        def has(t):
            t = t.strip()
            if t.startswith('!'):
                return not has(t[1:])
            if t == 'current':
                return iid == self._current
            return t in tags
        for alt in expr.split('||'):
            if all(has(part) for part in alt.split('&&')):
                return True
        return False

    def _first(self, tag_or_id):
        found = self._find(tag_or_id)
        return found[0] if found else None

    def find_all(self):
        return tuple(self._order)

    def find_withtag(self, tagOrId):
        return tuple(self._find(tagOrId))

    def _bbox_of(self, iid):
        item = self._items[iid]
        t, c, o = item['type'], item['coords'], item['opts']
        if t in ('rectangle', 'oval', 'arc', 'line', 'polygon'):
            xs, ys = c[0::2], c[1::2]
            w = _fpx(o.get('width', 1)) if (t == 'line' or o.get('outline')) else 0.0
            half = w / 2.0
            return (int(_math.floor(min(xs) - half)), int(_math.floor(min(ys) - half)),
                    int(_math.ceil(max(xs) + half)), int(_math.ceil(max(ys) + half)))
        if t == 'text':
            q = _app.query(q='textbbox', w=self._id, i=iid)
            if q:
                return tuple(int(v) for v in q)
            text = str(o.get('text', ''))
            lines = text.split('\n') or ['']
            spec = _font_spec(o.get('font')) or _named_fonts['TkDefaultFont']
            size = abs(spec.get('size', 9)) * (1.333 if spec.get('size', 9) > 0 else 1)
            width = max(len(line) for line in lines) * size * 0.6
            height = len(lines) * size * 1.25
            return self._anchor_box(c[0], c[1], width, height, o.get('anchor', 'center'))
        if t == 'image':
            img = _app.images.get(_image_name(o.get('image')) or '')
            w, h = (img.width(), img.height()) if img else (0, 0)
            return self._anchor_box(c[0], c[1], w, h, o.get('anchor', 'center'))
        if t == 'window':
            win = o.get('window')
            w = _px(o.get('width', 0)) or (win.winfo_width() if isinstance(win, Misc) else 0)
            h = _px(o.get('height', 0)) or (win.winfo_height() if isinstance(win, Misc) else 0)
            return self._anchor_box(c[0], c[1], w, h, o.get('anchor', 'center'))
        return (int(c[0]), int(c[1]), int(c[0]), int(c[1]))

    def _anchor_box(self, x, y, w, h, anchor):
        anchor = str(anchor or 'center')
        if 'w' in anchor:
            x0 = x
        elif 'e' in anchor:
            x0 = x - w
        else:
            x0 = x - w / 2.0
        if anchor.startswith('n'):
            y0 = y
        elif anchor.startswith('s'):
            y0 = y - h
        else:
            y0 = y - h / 2.0
        return (int(_math.floor(x0)), int(_math.floor(y0)), int(_math.ceil(x0 + w)), int(_math.ceil(y0 + h)))

    def bbox(self, *args):
        boxes = []
        for tag in args:
            for iid in self._find(tag):
                if str(self._items[iid]['opts'].get('state')) != 'hidden':
                    boxes.append(self._bbox_of(iid))
        if not boxes:
            return None
        return (min(b[0] for b in boxes), min(b[1] for b in boxes),
                max(b[2] for b in boxes), max(b[3] for b in boxes))

    def find_overlapping(self, x1, y1, x2, y2):
        x1, x2 = sorted((float(x1), float(x2)))
        y1, y2 = sorted((float(y1), float(y2)))
        out = []
        for iid in self._order:
            if str(self._items[iid]['opts'].get('state')) == 'hidden':
                continue
            b = self._bbox_of(iid)
            if b[0] <= x2 and b[2] >= x1 and b[1] <= y2 and b[3] >= y1:
                out.append(iid)
        return tuple(out)

    def find_enclosed(self, x1, y1, x2, y2):
        x1, x2 = sorted((float(x1), float(x2)))
        y1, y2 = sorted((float(y1), float(y2)))
        out = []
        for iid in self._order:
            b = self._bbox_of(iid)
            if b[0] >= x1 and b[2] <= x2 and b[1] >= y1 and b[3] <= y2:
                out.append(iid)
        return tuple(out)

    def find_closest(self, x, y, halo=None, start=None):
        best, best_d = None, None
        x, y = float(x), float(y)
        for iid in self._order:
            if str(self._items[iid]['opts'].get('state')) == 'hidden':
                continue
            b = self._bbox_of(iid)
            dx = max(b[0] - x, 0, x - b[2])
            dy = max(b[1] - y, 0, y - b[3])
            d = _math.hypot(dx, dy)
            if best_d is None or d <= best_d:
                best, best_d = iid, d
        return (best,) if best is not None else ()

    def find_above(self, tagOrId):
        iid = self._first(tagOrId)
        if iid is None:
            return ()
        i = self._order.index(iid)
        return (self._order[i + 1],) if i + 1 < len(self._order) else ()

    def find_below(self, tagOrId):
        iid = self._first(tagOrId)
        if iid is None:
            return ()
        i = self._order.index(iid)
        return (self._order[i - 1],) if i > 0 else ()

    def _find_spec(self, spec, *args):
        return getattr(self, 'find_' + spec)(*args)

    def find(self, *args):
        return self._find_spec(*args)

    # changing items
    def coords(self, tagOrId, *args):
        iid = self._first(tagOrId)
        if iid is None:
            return []
        item = self._items[iid]
        if not args:
            return [float(v) for v in item['coords']]
        coords = _flatten_coords(args)
        if len(coords) % 2 or len(coords) < _MIN_COORDS[item['type']] or \
                (item['type'] in ('rectangle', 'oval', 'arc') and len(coords) != 4):
            raise TclError('wrong # coordinates: expected %s, got %d'
                           % ('4' if item['type'] in ('rectangle', 'oval', 'arc') else 'at least %d' % _MIN_COORDS[item['type']],
                              len(coords)))
        for i in self._find(tagOrId)[:1]:
            self._items[i]['coords'] = coords
            self._touch(i, 'coords')
        return None

    def move(self, tagOrId, xAmount, yAmount):
        dx, dy = float(xAmount), float(yAmount)
        for iid in self._find(tagOrId):
            c = self._items[iid]['coords']
            self._items[iid]['coords'] = [v + (dx if k % 2 == 0 else dy) for k, v in enumerate(c)]
            self._touch(iid, 'coords')

    def moveto(self, tagOrId, x='', y=''):
        items = self._find(tagOrId)
        if not items:
            return
        box = self.bbox(tagOrId)
        if box is None:
            return
        dx = 0.0 if x == '' else float(x) - box[0]
        dy = 0.0 if y == '' else float(y) - box[1]
        self.move(tagOrId, dx, dy)

    def scale(self, tagOrId, xOrigin, yOrigin, xScale, yScale):
        xo, yo, xs, ys = float(xOrigin), float(yOrigin), float(xScale), float(yScale)
        for iid in self._find(tagOrId):
            c = self._items[iid]['coords']
            self._items[iid]['coords'] = [(xo + (v - xo) * xs) if k % 2 == 0 else (yo + (v - yo) * ys)
                                          for k, v in enumerate(c)]
            self._touch(iid, 'coords')

    def itemconfigure(self, tagOrId, cnf=None, **kw):
        items = self._find(tagOrId)
        opts = _cnfmerge(cnf, kw) if not isinstance(cnf, str) else {}
        if isinstance(cnf, str) or (cnf is None and not kw):
            if not items:
                return None
            o = self._items[items[0]]['opts']
            if isinstance(cnf, str):
                name = _optname(cnf)
                return (name, '', '', _ITEM_DEFAULTS[self._items[items[0]]['type']].get(name, ''), o.get(name, ''))
            return {k: (k, '', '', '', v) for k, v in o.items() if not k.startswith('_')}
        for iid in items:
            item = self._items[iid]
            self._apply_item_options(item['type'], item['opts'], opts)
            if 'tags' in {_optname(k) for k in opts}:
                item['tags'] = list(self._normalise_tags(item['opts']['tags']))
            self._touch(iid, 'full')
        return None

    itemconfig = itemconfigure

    def itemcget(self, tagOrId, option):
        iid = self._first(tagOrId)
        if iid is None:
            return ''
        name = _optname(option)
        item = self._items[iid]
        if name == 'tags':
            return ' '.join(item['tags'])
        if name not in _ITEM_DEFAULTS[item['type']]:
            raise TclError('unknown option "-%s"' % name)
        value = item['opts'].get(name, '')
        return value if isinstance(value, str) else str(value)

    def type(self, tagOrId):
        iid = self._first(tagOrId)
        return self._items[iid]['type'] if iid is not None else None

    def gettags(self, tagOrId):
        iid = self._first(tagOrId)
        if iid is None:
            return ()
        tags = tuple(self._items[iid]['tags'])
        return tags + (('current',) if iid == self._current else ())

    def addtag(self, *args):
        newtag, how = args[0], args[1]
        rest = args[2:]
        getattr(self, 'addtag_' + how)(newtag, *rest)

    def _addtag(self, newtag, items):
        for iid in items:
            if newtag not in self._items[iid]['tags']:
                self._items[iid]['tags'].append(str(newtag))

    def addtag_withtag(self, newtag, tagOrId):
        self._addtag(newtag, self._find(tagOrId))

    def addtag_all(self, newtag):
        self._addtag(newtag, list(self._order))

    def addtag_above(self, newtag, tagOrId):
        self._addtag(newtag, self.find_above(tagOrId))

    def addtag_below(self, newtag, tagOrId):
        self._addtag(newtag, self.find_below(tagOrId))

    def addtag_closest(self, newtag, x, y, halo=None, start=None):
        self._addtag(newtag, self.find_closest(x, y, halo, start))

    def addtag_enclosed(self, newtag, x1, y1, x2, y2):
        self._addtag(newtag, self.find_enclosed(x1, y1, x2, y2))

    def addtag_overlapping(self, newtag, x1, y1, x2, y2):
        self._addtag(newtag, self.find_overlapping(x1, y1, x2, y2))

    def dtag(self, tagOrId, tagToDelete=None):
        tag = str(tagOrId if tagToDelete is None else tagToDelete)
        for iid in self._find(tagOrId):
            tags = self._items[iid]['tags']
            if tag in tags:
                tags.remove(tag)

    def delete(self, *args):
        gone = []
        for tag in args:
            gone.extend(i for i in self._find(tag) if i not in gone)
        for iid in gone:
            item = self._items.pop(iid, None)
            if item is None:
                continue
            self._order.remove(iid)
            self._dirty_items.pop(iid, None)
            if self._current == iid:
                self._current = None
            if item['type'] == 'window' and isinstance(item['opts'].get('window'), Misc):
                item['opts']['window']._manager = None
        if gone:
            _app.op('cvdelete', self._id, gone)

    def tag_raise(self, tagOrId, aboveThis=None):
        items = self._find(tagOrId)
        if not items:
            return
        for iid in items:
            self._order.remove(iid)
        if aboveThis is None:
            self._order.extend(items)
        else:
            ref = [r for r in self._find(aboveThis) if r in self._order]
            pos = max(self._order.index(r) for r in ref) + 1 if ref else len(self._order)
            self._order[pos:pos] = items
        _app.op('cvorder', self._id, list(self._order))

    lift = tkraise = tag_raise

    def tag_lower(self, tagOrId, belowThis=None):
        items = self._find(tagOrId)
        if not items:
            return
        for iid in items:
            self._order.remove(iid)
        if belowThis is None:
            self._order[0:0] = items
        else:
            ref = [r for r in self._find(belowThis) if r in self._order]
            pos = min(self._order.index(r) for r in ref) if ref else 0
            self._order[pos:pos] = items
        _app.op('cvorder', self._id, list(self._order))

    lower = tag_lower

    def tag_bind(self, tagOrId, sequence=None, func=None, add=None):
        tag = str(tagOrId)
        table = self._item_bindings.get(tag)
        if sequence is None:
            return tuple(table.sequences.values()) if table else ()
        if func is None:
            return ''
        if table is None:
            table = self._item_bindings[tag] = _BindingTable()
        funcid = _app.register(func)
        table.bind(sequence, func, bool(add), funcid)
        _app.mark(self)
        return funcid

    def tag_unbind(self, tagOrId, sequence, funcid=None):
        table = self._item_bindings.get(str(tagOrId))
        if table is not None:
            table.unbind(sequence, funcid)

    def _set_current(self, iid):
        self._current = iid if iid in self._items else None

    def _item_event(self, item, k, etype, detail, mods, count, event):
        if k in ('motion', 'press', 'enter') or item is not None:
            self._set_current(item)
        if item is None:
            return None
        return self._item_dispatch(item, etype, detail, mods, count, event)

    def _item_dispatch(self, iid, etype, detail, mods, count, event):
        item = self._items.get(iid)
        if item is None:
            return None
        tags = [str(iid)] + list(item['tags']) + ['current', 'all']
        for tag in tags:
            table = self._item_bindings.get(tag)
            if table is None:
                continue
            funcs = table.best(etype, detail, mods, count)
            for _fid, func in list(funcs or []):
                if func(event) == 'break':
                    return 'break'
        return None

    def _on_citem(self, ev):
        old = self._current
        new = ev.get('i')
        new = new if new in self._items else None
        if old == new:
            return
        for iid, etype in ((old, 'Leave'), (new, 'Enter')):
            if iid is None:
                continue
            e = Event()
            e.widget = self
            e.type = EventType.Leave if etype == 'Leave' else EventType.Enter
            e.x, e.y = int(ev.get('x', 0)), int(ev.get('y', 0))
            e.x_root, e.y_root = int(ev.get('X', 0)), int(ev.get('Y', 0))
            if etype == 'Enter':
                self._current = new
            _app.deliver(self._item_dispatch, iid, etype, None, set(), 1, e)
        self._current = new

    def canvasx(self, screenx, gridspacing=None):
        return float(screenx)

    def canvasy(self, screeny, gridspacing=None):
        return float(screeny)

    def xview(self, *args):
        return (0.0, 1.0)

    def yview(self, *args):
        return (0.0, 1.0)

    def xview_moveto(self, fraction):
        pass

    def yview_moveto(self, fraction):
        pass

    def xview_scroll(self, number, what):
        pass

    def yview_scroll(self, number, what):
        pass

    def scan_mark(self, x, y):
        pass

    def scan_dragto(self, x, y, gain=10):
        pass

    def focus(self, *args):
        if args:
            return None
        return Misc.focus_set(self)

    def icursor(self, *args):
        pass

    def index(self, tagOrId, index):
        return 0

    def insert(self, *args):
        pass

    def dchars(self, *args):
        pass

    def select_clear(self):
        pass

    def select_item(self):
        return None

    def postscript(self, cnf={}, **kw):
        raise TclError('postscript output is not available in the browser')


# ── Menus ───────────────────────────────────────────────────────────────────

_MENU_ITEM_OPTIONS = {
    'accelerator', 'activebackground', 'activeforeground', 'background', 'bitmap', 'columnbreak',
    'command', 'compound', 'font', 'foreground', 'hidemargin', 'image', 'indicatoron', 'label',
    'menu', 'offvalue', 'onvalue', 'selectcolor', 'selectimage', 'state', 'underline', 'value',
    'variable',
}


class Menu(Widget):
    _spec = {
        'activebackground': 'SystemHighlight', 'activeborderwidth': 0,
        'activeforeground': 'SystemHighlightText', 'background': 'SystemMenu', 'borderwidth': 0,
        'cursor': 'arrow', 'disabledforeground': 'SystemDisabledText', 'font': 'TkMenuFont',
        'foreground': 'SystemMenuText', 'postcommand': '', 'relief': 'flat',
        'selectcolor': 'SystemMenuText', 'takefocus': 0, 'tearoff': 1, 'tearoffcommand': '',
        'title': '', 'type': 'normal',
    }
    _kind = None
    _class = 'Menu'

    def _init_state(self):
        self._entries = []
        self._owners = []
        self._vars = []

    def _create(self):
        pass

    def _post_create(self):
        if _getboolean(self._o('tearoff')):
            self._entries.append({'type': 'tearoff'})

    def _sync(self):
        for owner in list(self._owners):
            if not owner._destroyed:
                owner._changed()

    def _watched_vars(self):
        return list(self._vars)

    def _attach(self, owner):
        if owner not in self._owners:
            self._owners.append(owner)

    def _var_changed(self, var):
        self._changed()

    def _model(self):
        items = []
        for i, e in enumerate(self._entries):
            t = e['type']
            if t == 'tearoff':
                items.append({'type': 'tearoff', 'i': i})
                continue
            if t == 'separator':
                items.append({'type': 'separator', 'i': i})
                continue
            item = {'type': t, 'i': i, 'label': str(e.get('label', '')),
                    'accel': str(e.get('accelerator', '')), 'state': str(e.get('state', 'normal')),
                    'underline': int(e.get('underline', -1) if e.get('underline', '') != '' else -1)}
            if e.get('foreground'):
                item['fg'] = _color(e['foreground'])
            if e.get('background'):
                item['bg'] = _color(e['background'])
            if e.get('font'):
                item['font'] = _font_css(e['font'])
            if t == 'cascade':
                sub = e.get('menu')
                if isinstance(sub, str) and sub:
                    try:
                        sub = self.nametowidget(sub)
                    except KeyError:
                        sub = None
                item['menu'] = sub._model() if isinstance(sub, Menu) and not sub._destroyed else {'id': None, 'items': []}
            elif t == 'checkbutton':
                var = e.get('_var')
                item['on'] = var is not None and str(var._value) == str(e.get('onvalue', 1))
            elif t == 'radiobutton':
                var = e.get('_var')
                item['on'] = var is not None and var._value is not None and str(var._value) == str(e.get('value', e.get('label', '')))
            items.append(item)
        return {'id': self._id, 'items': items,
                'bg': _color(self._o('background')), 'fg': _color(self._o('foreground')),
                'font': _font_css(self._o('font'), 'TkMenuFont'),
                'activebg': _color(self._o('activebackground')),
                'activefg': _color(self._o('activeforeground'))}

    def _entry_options(self, entry, kw):
        for key, value in kw.items():
            name = _optname(key)
            if name not in _MENU_ITEM_OPTIONS:
                raise TclError('unknown option "-%s"' % name)
            entry[name] = value
            if name == 'variable':
                var = _as_variable(value, IntVar if entry['type'] == 'checkbutton' else StringVar)
                entry['_var'] = var
                if var is not None:
                    var._watch(self)
                    if var not in self._vars:
                        self._vars.append(var)
            if name == 'menu' and isinstance(value, Menu):
                value._attach(self)
        if entry['type'] == 'checkbutton' and entry.get('_var') is None:
            var = IntVar(value=0)
            entry['_var'] = var
            entry['variable'] = var
            var._watch(self)
            self._vars.append(var)
        if entry['type'] == 'radiobutton' and entry.get('_var') is None:
            var = _app.vars.get('selectedButton') or Variable(name='selectedButton', value=None)
            entry['_var'] = var
            entry['variable'] = var
            var._watch(self)
            self._vars.append(var)

    def add(self, itemType, cnf={}, **kw):
        self.insert('end', itemType, cnf, **kw)

    def add_cascade(self, cnf={}, **kw):
        self.add('cascade', cnf, **kw)

    def add_checkbutton(self, cnf={}, **kw):
        self.add('checkbutton', cnf, **kw)

    def add_command(self, cnf={}, **kw):
        self.add('command', cnf, **kw)

    def add_radiobutton(self, cnf={}, **kw):
        self.add('radiobutton', cnf, **kw)

    def add_separator(self, cnf={}, **kw):
        self.add('separator', cnf, **kw)

    def insert(self, index, itemType, cnf={}, **kw):
        if itemType not in ('cascade', 'checkbutton', 'command', 'radiobutton', 'separator'):
            raise TclError('bad menu entry type "%s": must be cascade, checkbutton, command, radiobutton, or separator' % itemType)
        entry = {'type': itemType}
        self._entry_options(entry, _cnfmerge(cnf, kw))
        i = len(self._entries) if str(index) in ('end', 'last') else self.index(index)
        i = len(self._entries) if i is None else i
        self._entries.insert(i, entry)
        self._changed()

    def insert_cascade(self, index, cnf={}, **kw):
        self.insert(index, 'cascade', cnf, **kw)

    def insert_checkbutton(self, index, cnf={}, **kw):
        self.insert(index, 'checkbutton', cnf, **kw)

    def insert_command(self, index, cnf={}, **kw):
        self.insert(index, 'command', cnf, **kw)

    def insert_radiobutton(self, index, cnf={}, **kw):
        self.insert(index, 'radiobutton', cnf, **kw)

    def insert_separator(self, index, cnf={}, **kw):
        self.insert(index, 'separator', cnf, **kw)

    def delete(self, index1, index2=None):
        a = self.index(index1)
        b = a if index2 is None else self.index(index2)
        if a is None or b is None:
            return
        del self._entries[a:b + 1]
        self._changed()

    def index(self, index):
        n = len(self._entries)
        if isinstance(index, int):
            return max(0, min(n - 1, index)) if n else None
        s = str(index)
        if s in ('end', 'last'):
            return n - 1 if n else None
        if s == 'none':
            return None
        if s == 'active':
            return None
        if s.startswith('@'):
            return 0 if n else None
        try:
            return int(s)
        except ValueError:
            pass
        for i, e in enumerate(self._entries):
            if str(e.get('label', '')) == s:
                return i
        import fnmatch
        for i, e in enumerate(self._entries):
            if fnmatch.fnmatchcase(str(e.get('label', '')), s):
                return i
        raise TclError('bad menu entry index "%s"' % index)

    def entrycget(self, index, option):
        i = self.index(index)
        name = _optname(option)
        entry = self._entries[i]
        if name == 'variable':
            return entry.get('_var') or ''
        return entry.get(name, '')

    def entryconfigure(self, index, cnf=None, **kw):
        i = self.index(index)
        if i is None:
            return None
        entry = self._entries[i]
        opts = _cnfmerge(cnf, kw) if not isinstance(cnf, str) else {}
        if not opts:
            return {k: (k, '', '', '', v) for k, v in entry.items() if not k.startswith('_')}
        self._entry_options(entry, opts)
        self._changed()
        return None

    entryconfig = entryconfigure

    def type(self, index):
        i = self.index(index)
        return self._entries[i]['type'] if i is not None else ''

    def invoke(self, index):
        i = self.index(index)
        if i is None or i >= len(self._entries):
            return ''
        entry = self._entries[i]
        if str(entry.get('state', 'normal')) == 'disabled':
            return ''
        t = entry['type']
        var = entry.get('_var')
        if t == 'checkbutton' and var is not None:
            on, off = entry.get('onvalue', 1), entry.get('offvalue', 0)
            var._store(off if str(var._value) == str(on) else on)
        elif t == 'radiobutton' and var is not None:
            var._store(entry.get('value', entry.get('label', '')))
        command = entry.get('command')
        self._changed()
        if callable(command):
            return command()
        return ''

    def post(self, x, y):
        _app.op('popup', self._id, self._model(), int(x), int(y))

    def tk_popup(self, x, y, entry=''):
        self.post(x, y)

    def unpost(self):
        _app.op('unpopup')

    def activate(self, index):
        pass

    def xposition(self, index):
        return 0

    def yposition(self, index):
        return 0

    def add_tearoff(self):
        pass


class Menubutton(_TextOptions, Widget):
    _spec = dict(_LABEL_SPEC, direction='below', indicatoron=0, menu='', relief='flat')
    _kind = 'menubutton'
    _class = 'Menubutton'

    def _set_option(self, name, value, initial=False):
        if name == 'menu' and isinstance(value, Menu):
            value._attach(self)
        _TextOptions._set_option(self, name, value, initial)

    def _props(self):
        p = self._label_props({})
        menu = self._o('menu')
        p['menu'] = menu._model() if isinstance(menu, Menu) and not menu._destroyed else None
        p['indicator'] = _getboolean(self._o('indicatoron'))
        return p


class _setit:
    """The command an OptionMenu entry runs: set the variable, then call back."""

    def __init__(self, var, value, callback=None):
        self.__value = value
        self.__var = var
        self.__callback = callback

    def __call__(self, *args):
        self.__var.set(self.__value)
        if self.__callback is not None:
            self.__callback(self.__value, *args)


class OptionMenu(Menubutton):
    _kind = 'optionmenu'
    _class = 'Menubutton'

    def __init__(self, master, variable, value, *values, **kwargs):
        callback = kwargs.pop('command', None)
        if kwargs:
            raise TclError('unknown option -' + next(iter(kwargs)))
        self._variable = variable if isinstance(variable, Variable) else _as_variable(variable)
        Menubutton.__init__(self, master, textvariable=self._variable, indicatoron=1,
                            relief='raised', anchor='center', highlightthickness=2)
        menu = self.__menu = Menu(self, name='menu', tearoff=0)
        self.menuname = menu._w
        menu.add_command(label=value, command=_setit(self._variable, value, callback))
        for v in values:
            menu.add_command(label=v, command=_setit(self._variable, v, callback))
        self._opts['menu'] = menu
        menu._attach(self)
        self._changed()

    def __getitem__(self, name):
        if name == 'menu':
            return self.__menu
        return Menubutton.cget(self, name)

    cget = __getitem__

    def _props(self):
        p = Menubutton._props(self)
        menu = self._opts.get('menu')
        p['options'] = [str(e.get('label', '')) for e in menu._entries if e['type'] != 'tearoff'] \
            if isinstance(menu, Menu) else []
        p['indices'] = [i for i, e in enumerate(menu._entries) if e['type'] != 'tearoff'] \
            if isinstance(menu, Menu) else []
        return p

    def _on_opt(self, ev):
        menu = self._opts.get('menu')
        if isinstance(menu, Menu):
            menu.invoke(int(ev.get('i', 0)))

    def destroy(self):
        Menubutton.destroy(self)
        self.__menu = None


class PanedWindow(Widget, _Container):
    _spec = {
        'background': 'SystemButtonFace', 'borderwidth': 1, 'cursor': '', 'handlepad': 8,
        'handlesize': 8, 'height': '', 'opaqueresize': 1, 'orient': 'horizontal',
        'proxybackground': '', 'proxyborderwidth': 2, 'proxyrelief': 'flat', 'relief': 'flat',
        'sashcursor': '', 'sashpad': 0, 'sashrelief': 'flat', 'sashwidth': 3, 'showhandle': 0,
        'width': '',
    }
    _kind = 'frame'
    _class = 'Panedwindow'

    def _props(self):
        p = _box_props(self, {})
        p['width'] = _px(self._o('width'))
        p['height'] = _px(self._o('height'))
        p['padx'] = 0
        p['pady'] = 0
        return p

    def add(self, child, **kw):
        side = 'left' if str(self._o('orient')) == 'horizontal' else 'top'
        child.pack(in_=self, side=side, fill='both', expand=True,
                   padx=(0, _px(self._o('sashwidth'))) if side == 'left' else 0,
                   pady=(0, _px(self._o('sashwidth'))) if side == 'top' else 0)

    def remove(self, child):
        child.pack_forget()

    forget = remove

    def panes(self):
        return tuple(s for s in self._slaves if s._manager == 'pack')

    def paneconfigure(self, tagOrId, cnf=None, **kw):
        pass

    paneconfig = paneconfigure

    def panecget(self, child, option):
        return ''

    def sash_coord(self, index):
        return (0, 0)

    def sash_place(self, index, x, y):
        pass

    def sash_mark(self, index):
        pass

    def identify(self, x, y):
        return ''

    def proxy_coord(self):
        return (0, 0)

    def proxy_forget(self):
        pass

    def proxy_place(self, x, y):
        pass


# ── Images ──────────────────────────────────────────────────────────────────

def _png_size(data):
    if data[:8] == b'\x89PNG\r\n\x1a\n' and len(data) >= 24:
        return _struct.unpack('>II', data[16:24])
    return None


def _gif_size(data):
    if data[:6] in (b'GIF87a', b'GIF89a') and len(data) >= 10:
        return _struct.unpack('<HH', data[6:10])
    return None


def _encode_png(width, height, rgba):
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(rgba[y * stride:(y + 1) * stride])

    def chunk(tag, body):
        c = _struct.pack('>I', len(body)) + tag + body
        return c + _struct.pack('>I', _zlib.crc32(tag + body) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', _struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', _zlib.compress(bytes(raw), 6)) + chunk(b'IEND', b''))


_NAMED_RGB = {
    'black': (0, 0, 0), 'white': (255, 255, 255), 'red': (255, 0, 0), 'green': (0, 128, 0),
    'blue': (0, 0, 255), 'yellow': (255, 255, 0), 'cyan': (0, 255, 255), 'magenta': (255, 0, 255),
    'orange': (255, 165, 0), 'purple': (128, 0, 128), 'grey': (128, 128, 128), 'gray': (128, 128, 128),
    'pink': (255, 192, 203), 'brown': (165, 42, 42), 'lime': (0, 255, 0), 'navy': (0, 0, 128),
}


def _rgb_of(color):
    if isinstance(color, (tuple, list)) and len(color) >= 3:
        return tuple(int(c) for c in color[:3])
    css = _color(color) or ''
    if css.startswith('#') and len(css) == 7:
        return (int(css[1:3], 16), int(css[3:5], 16), int(css[5:7], 16))
    if css.startswith('#') and len(css) == 4:
        return tuple(int(c * 2, 16) for c in css[1:4])
    if css in _NAMED_RGB:
        return _NAMED_RGB[css]
    q = _app.query(q='rgb', c=css)
    if isinstance(q, list):
        return tuple(int(v) for v in q)
    raise TclError('unknown color name "%s"' % color)


class Image:
    _last_id = 0

    def __init__(self, imgtype, name=None, cnf={}, master=None, **kw):
        if name is None:
            _app.image_seq += 1
            name = 'pyimage%d' % _app.image_seq
        self.name = str(name)
        self.tk = master.tk if master is not None else (_default_root.tk if _default_root else None)
        self._type = imgtype
        self._w_px = 0
        self._h_px = 0
        self._src = None
        self._pixels = None
        self._bytes = None
        _app.images[self.name] = self

    def __str__(self):
        return self.name

    def __del__(self):
        pass

    def __setitem__(self, key, value):
        self.configure(**{key: value})

    def __getitem__(self, key):
        return self.cget(key)

    def configure(self, **kw):
        pass

    config = configure

    def cget(self, option):
        return ''

    def height(self):
        return self._h_px

    def width(self):
        return self._w_px

    def type(self):
        return self._type

    def _send(self):
        _app.op('image', self.name, {'src': self._src, 'w': self._w_px, 'h': self._h_px})


class PhotoImage(Image):
    """GIF and PNG from a file or base64 data, or a blank image to put() pixels into."""

    def __init__(self, name=None, cnf={}, master=None, **kw):
        Image.__init__(self, 'photo', name, cnf, master)
        opts = _cnfmerge(cnf, kw)
        self._opts = {}
        self._load(opts)

    def _load(self, opts):
        filename = opts.get('file')
        data = opts.get('data')
        width = opts.get('width')
        height = opts.get('height')
        for k in ('file', 'data', 'format', 'width', 'height', 'gamma', 'palette'):
            if k in opts:
                self._opts[k] = opts[k]
        raw = None
        if filename:
            try:
                with open(filename, 'rb') as fh:
                    raw = fh.read()
            except OSError:
                raise TclError('couldn\'t open "%s": no such file or directory' % filename)
            label = '"%s"' % filename
        elif data:
            if isinstance(data, (bytes, bytearray)):
                raw = bytes(data)
                if not (_png_size(raw) or _gif_size(raw)):
                    try:
                        raw = _base64.b64decode(raw)
                    except Exception:
                        pass
            else:
                try:
                    raw = _base64.b64decode(str(data))
                except Exception:
                    raw = str(data).encode('latin-1', 'replace')
            label = 'data'
        if raw is not None:
            size = _png_size(raw)
            mime = 'image/png'
            if size is None:
                size = _gif_size(raw)
                mime = 'image/gif'
            if size is None:
                if filename:
                    raise TclError('couldn\'t recognize data in image file %s' % label)
                raise TclError('couldn\'t recognize image data')
            self._bytes = raw
            self._pixels = None
            self._w_px, self._h_px = int(size[0]), int(size[1])
            self._src = 'data:%s;base64,%s' % (mime, _base64.b64encode(raw).decode('ascii'))
        else:
            w = _px(width) if width not in (None, '') else self._w_px
            h = _px(height) if height not in (None, '') else self._h_px
            self._blank(w, h)
        if width not in (None, '') and raw is not None:
            self._w_px = _px(width)
        if height not in (None, '') and raw is not None:
            self._h_px = _px(height)
        self._send()

    def _blank(self, w, h):
        self._w_px, self._h_px = int(w), int(h)
        self._pixels = bytearray(self._w_px * self._h_px * 4)
        self._bytes = None
        self._refresh_pixels()

    def _refresh_pixels(self):
        # put() is often called once per pixel; encode once, when the batch goes out.
        if self._pixels is not None:
            _app.dirty_images[self.name] = self

    def _encode_now(self):
        if self._pixels is None:
            return
        if self._w_px and self._h_px:
            png = _encode_png(self._w_px, self._h_px, self._pixels)
            self._src = 'data:image/png;base64,' + _base64.b64encode(png).decode('ascii')
        else:
            self._src = None
        self._send()

    def configure(self, **kw):
        merged = dict(self._opts)
        merged.update(kw)
        if 'file' in kw or 'data' in kw:
            merged.pop('data' if 'file' in kw else 'file', None)
        self._load(merged)

    config = configure

    def cget(self, option):
        return self._opts.get(option, '')

    def blank(self):
        if self._pixels is not None:
            self._pixels = bytearray(len(self._pixels))
            self._refresh_pixels()

    def _ensure_pixels(self):
        if self._pixels is None:
            self._pixels = bytearray(self._w_px * self._h_px * 4)

    def put(self, data, to=None):
        self._ensure_pixels()
        if isinstance(data, str):
            rows = []
            text = data.strip()
            if text.startswith('{') or ' ' in text:
                for row in _splitlist(text) if text.startswith('{') else [text]:
                    rows.append(list(_splitlist(row)))
            else:
                rows = [[text]]
        else:
            rows = [list(r) if isinstance(r, (tuple, list)) else [r] for r in data]
        if to is None:
            x0, y0, x1, y1 = 0, 0, None, None
        else:
            coords = [int(v) for v in (to if isinstance(to, (tuple, list)) else _splitlist(to))]
            x0, y0 = coords[0], coords[1]
            x1, y1 = (coords[2], coords[3]) if len(coords) >= 4 else (None, None)
        if not rows or not rows[0]:
            return
        if x1 is None:
            x1, y1 = x0 + len(rows[0]), y0 + len(rows)
        if x1 > self._w_px or y1 > self._h_px:
            new_w, new_h = max(self._w_px, x1), max(self._h_px, y1)
            old, ow = self._pixels, self._w_px
            self._pixels = bytearray(new_w * new_h * 4)
            for y in range(self._h_px):
                self._pixels[y * new_w * 4:(y * new_w + ow) * 4] = old[y * ow * 4:(y + 1) * ow * 4]
            self._w_px, self._h_px = new_w, new_h
        cache = {}
        for yy in range(y0, y1):
            row = rows[(yy - y0) % len(rows)]
            for xx in range(x0, x1):
                c = row[(xx - x0) % len(row)]
                key = c if not isinstance(c, list) else tuple(c)
                rgb = cache.get(key)
                if rgb is None:
                    rgb = cache[key] = _rgb_of(c)
                i = (yy * self._w_px + xx) * 4
                self._pixels[i:i + 4] = bytes((rgb[0], rgb[1], rgb[2], 255))
        self._refresh_pixels()

    def get(self, x, y):
        if self._pixels is None:
            return (0, 0, 0)
        x, y = int(x), int(y)
        if not (0 <= x < self._w_px and 0 <= y < self._h_px):
            raise TclError('coordinates for -from option extend outside image')
        i = (y * self._w_px + x) * 4
        return tuple(self._pixels[i:i + 3])

    def transparency_get(self, x, y):
        if self._pixels is None:
            return False
        i = (int(y) * self._w_px + int(x)) * 4
        return self._pixels[i + 3] == 0

    def transparency_set(self, x, y, boolean):
        self._ensure_pixels()
        i = (int(y) * self._w_px + int(x)) * 4
        self._pixels[i + 3] = 0 if boolean else 255
        self._refresh_pixels()

    def _derived(self, w, h):
        img = PhotoImage.__new__(PhotoImage)
        Image.__init__(img, 'photo')
        img._opts = {}
        img._src = self._src
        img._bytes = self._bytes
        img._pixels = None
        img._w_px, img._h_px = max(1, int(w)), max(1, int(h))
        img._send()
        return img

    def copy(self):
        img = self._derived(self._w_px, self._h_px)
        if self._pixels is not None:
            img._pixels = bytearray(self._pixels)
        return img

    def zoom(self, x, y=''):
        y = x if y == '' else y
        return self._derived(self._w_px * int(x), self._h_px * int(y))

    def subsample(self, x, y=''):
        y = x if y == '' else y
        return self._derived(max(1, self._w_px // int(x)), max(1, self._h_px // int(y)))

    def write(self, filename, format=None, from_coords=None):
        if self._pixels is not None:
            data = _encode_png(self._w_px, self._h_px, self._pixels)
        else:
            data = self._bytes or b''
        with open(filename, 'wb') as fh:
            fh.write(data)

    def data(self, format=None, **kw):
        if self._pixels is not None:
            return _base64.b64encode(_encode_png(self._w_px, self._h_px, self._pixels)).decode('ascii')
        return _base64.b64encode(self._bytes or b'').decode('ascii')


class BitmapImage(Image):
    """Bitmaps are XBM, which the browser cannot show; the image is kept but blank."""

    def __init__(self, name=None, cnf={}, master=None, **kw):
        Image.__init__(self, 'bitmap', name, cnf, master)
        self._send()


def _coder_dialog(spec, headless=None):
    """Show a message box or prompt in the page and wait for the answer.

    With JSPI, Python waits on the dialog's promise while the page runs. Without
    it the page cannot draw anything while Python waits, so the renderer falls
    back to the browser's own blocking alert/confirm/prompt.
    """
    _app.flush()
    if _host is None:
        return headless
    payload = _json.dumps(spec)
    if _can_block():
        raw = _run_sync(_host.dialog(payload))
        _check_stop()
    else:
        raw = _host.dialog_sync(payload)
    raw = None if raw is None else str(raw)
    return _json.loads(raw) if raw else None


# The Coder bootstrap calls these; they are not part of tkinter's API.

async def _coder_keepalive():
    """After the program ends: keep a window that is still open working."""
    import asyncio
    if _host is None:
        return
    app = _app
    app.flush()
    if app.mainloop_called and not app.mainloop_deferred:
        return
    if not app.mainloop_called and not app.has_visible_window():
        return
    app.quit_flag = False
    if not app.mainloop_called:
        app.autofocus()
    while app.roots and not app.quit_flag:
        app.pump()
        await asyncio.sleep(app.next_delay())
    app.flush()


def _coder_shutdown():
    _app.timer_funcs.clear()
    _app.timers = []
    _app.idle = []
    try:
        _app.flush()
    except Exception:
        pass
