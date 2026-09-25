"""tkinter.ttk for Coder: the themed widgets.

Themed widgets take their look from styles (ttk.Style) rather than from their
own colour options: a ttk.Button has no `bg`, exactly as in Tk, and setting one
raises the same TclError. The page draws them with a modern flat look close to
Windows' "vista" theme; Style().configure()/map() colours and fonts are applied
on top.
"""

import tkinter as _tk
from tkinter import (TclError, _app, _color, _font_css, _px, _pad, _cnfmerge, _optname, _splitlist,
                     _getboolean, _anchor, _as_variable, _var_value, _image_name, _box_props,
                     _cursor_css, _state_str, _BindingTable, Variable, IntVar, DoubleVar, StringVar,
                     Misc, Event, EventType)

__all__ = ['Button', 'Checkbutton', 'Combobox', 'Entry', 'Frame', 'Label', 'Labelframe', 'LabelFrame',
           'Menubutton', 'Notebook', 'Panedwindow', 'PanedWindow', 'Progressbar', 'Radiobutton', 'Scale',
           'Scrollbar', 'Separator', 'Sizegrip', 'Spinbox', 'Style', 'Treeview', 'LabeledScale',
           'OptionMenu', 'tclobjs_to_py', 'setup_master']

__version__ = '0.3.1'


def tclobjs_to_py(adict):
    return {k: _convert_stringval(v) for k, v in adict.items()}


def setup_master(master=None):
    return master if master is not None else _tk._get_default_root()


def _convert_stringval(value):
    value = str(value)
    try:
        value = int(value)
    except (ValueError, TypeError):
        pass
    return value


def _padding(value):
    if value in (None, ''):
        return None
    if isinstance(value, (tuple, list)):
        vals = [_px(v) for v in value]
    else:
        vals = [_px(v) for v in str(value).split()]
    if not vals:
        return None
    if len(vals) == 1:
        return [vals[0]] * 4
    if len(vals) == 2:
        return [vals[0], vals[1], vals[0], vals[1]]
    if len(vals) == 3:
        return [vals[0], vals[1], vals[2], vals[1]]
    return vals[:4]


def _restyle():
    for w in list(_app.widgets.values()):
        if isinstance(w, _TtkWidget):
            w._changed()


class Style:
    """ttk.Style: configure() and map() colours, fonts and padding by style name."""
    _name = 'ttk::style'

    def __init__(self, master=None):
        self.master = master
        self.tk = master.tk if master is not None else None

    def configure(self, style, query_opt=None, **kw):
        store = _app.ttk_styles.setdefault(style, {})
        if query_opt is not None:
            return store.get(_optname(query_opt), '')
        if not kw:
            return dict(store) or None
        for k, v in kw.items():
            store[_optname(k)] = v
        _restyle()
        return None

    def map(self, style, query_opt=None, **kw):
        store = _app.ttk_maps.setdefault(style, {})
        if query_opt is not None:
            return list(store.get(_optname(query_opt), []))
        if not kw:
            return {k: list(v) for k, v in store.items()}
        for k, v in kw.items():
            store[_optname(k)] = [tuple(x) if isinstance(x, (tuple, list)) else (x,) for x in v]
        _restyle()
        return None

    def lookup(self, style, option, state=None, default=None):
        merged = _merged_style(_style_chain(style))
        return merged.get(_optname(option), default if default is not None else '')

    def layout(self, style, layoutspec=None):
        return []

    def element_create(self, elementname, etype, *args, **kw):
        pass

    def element_names(self):
        return ()

    def element_options(self, elementname):
        return ()

    def theme_create(self, themename, parent=None, settings=None):
        if settings:
            self.theme_settings(themename, settings)

    def theme_settings(self, themename, settings):
        for style, spec in (settings or {}).items():
            if 'configure' in spec:
                self.configure(style, **spec['configure'])
            if 'map' in spec:
                self.map(style, **spec['map'])

    def theme_names(self):
        return ('winnative', 'clam', 'alt', 'default', 'classic', 'vista', 'xpnative')

    def theme_use(self, themename=None):
        if themename is None:
            return _app.ttk_theme
        if themename not in self.theme_names():
            raise TclError('can\'t find a usable "%s" theme' % themename)
        _app.ttk_theme = themename
        _app.op('ttktheme', themename)
        _restyle()


def _style_chain(style_name, default_class=None):
    chain = ['.']
    if default_class:
        chain.append(default_class)
    if style_name:
        parts = str(style_name).split('.')
        for i in range(len(parts) - 1, -1, -1):
            name = '.'.join(parts[i:])
            if name not in chain:
                chain.append(name)
    return chain


def _merged_style(chain):
    merged = {}
    for name in chain:
        merged.update(_app.ttk_styles.get(name, {}))
    return merged


def _merged_maps(chain):
    merged = {}
    for name in chain:
        for opt, entries in _app.ttk_maps.get(name, {}).items():
            merged[opt] = list(entries) + [e for e in merged.get(opt, []) if e not in entries]
    return merged


_MAP_STATES = {'active': 'active', 'hover': 'active', 'pressed': 'pressed', 'disabled': 'disabled',
               'selected': 'selected', 'readonly': 'readonly', 'focus': 'focus', '!disabled': None}


class _TtkWidget:
    """What every themed widget shares: style, padding, state flags."""
    _style_class = 'TWidget'

    def _init_flags(self):
        self._flags = set()

    def _chain(self):
        return _style_chain(self._opts.get('style') or '', self._style_class)

    def _ttk_props(self, p):
        chain = self._chain()
        st = _merged_style(chain)
        maps = _merged_maps(chain)
        p['ttk'] = self._style_class
        p['theme'] = _app.ttk_theme

        def pick(opt):
            own = self._opts.get(opt) if opt in self._spec else None
            if own not in (None, ''):
                return own
            return st.get(opt)
        bg = pick('background')
        p['bg'] = _color(bg) if bg not in (None, '') else None
        fg = pick('foreground')
        p['fg'] = _color(fg) if fg not in (None, '') else None
        font = pick('font')
        p['font'] = _font_css(font) if font not in (None, '') else _font_css(None)
        p['padding'] = _padding(pick('padding'))
        # A themed widget has no relief of its own unless a style or its own
        # option gives it one; the page then draws the theme's border.
        relief = pick('relief')
        if relief not in (None, ''):
            p['relief'] = str(relief)
            bd = pick('borderwidth')
            p['bd'] = _px(bd) if bd not in (None, '') else (1 if relief != 'flat' else 0)
        else:
            p['relief'] = None
            p['bd'] = None
        anchor = pick('anchor')
        if anchor not in (None, ''):
            p['anchor'] = _anchor(anchor)
        for key, css in (('fieldbackground', 'fieldbg'), ('bordercolor', 'bordercolor'),
                         ('troughcolor', 'trough'), ('selectbackground', 'selectbg'),
                         ('selectforeground', 'selectfg'), ('insertcolor', 'caret'),
                         ('arrowcolor', 'arrowcolor'), ('lightcolor', 'lightcolor')):
            v = st.get(key)
            if v not in (None, ''):
                p[css] = _color(v)
        rowheight = st.get('rowheight')
        if rowheight not in (None, ''):
            p['rowheight'] = _px(rowheight)
        states = {}
        for opt in ('background', 'foreground', 'fieldbackground'):
            for entry in maps.get(opt, []):
                if len(entry) < 2:
                    continue
                spec, value = entry[:-1], entry[-1]
                words = []
                for s in spec:
                    words.extend(str(s).split())
                positive = [w for w in words if not w.startswith('!')]
                if len(positive) != 1:
                    continue
                state = _MAP_STATES.get(positive[0])
                if state:
                    states.setdefault(state, {}).setdefault(opt, _color(value))
        p['maps'] = states
        p['state'] = 'disabled' if 'disabled' in self._flags or self._opts.get('state') == 'disabled' else \
            ('readonly' if 'readonly' in self._flags or self._opts.get('state') == 'readonly' else 'normal')
        return p

    def state(self, statespec=None):
        if statespec is None:
            flags = set(self._flags)
            if self._opts.get('state') == 'disabled':
                flags.add('disabled')
            if self._opts.get('state') == 'readonly':
                flags.add('readonly')
            return tuple(sorted(flags))
        if isinstance(statespec, str):
            statespec = statespec.split()
        changed = []
        for s in statespec:
            s = str(s)
            if s.startswith('!'):
                flag = s[1:]
                if flag in self._flags:
                    self._flags.discard(flag)
                    changed.append(flag)
                if flag in ('disabled', 'readonly') and self._opts.get('state') == flag:
                    self._opts['state'] = 'normal'
            else:
                if s not in self._flags:
                    self._flags.add(s)
                    changed.append('!' + s)
                if s in ('disabled', 'readonly') and 'state' in self._spec:
                    self._opts['state'] = s
        self._changed()
        return tuple(changed)

    def instate(self, statespec, callback=None, *args, **kw):
        if isinstance(statespec, str):
            statespec = statespec.split()
        flags = set(self.state())
        ok = all((s[1:] not in flags) if s.startswith('!') else (s in flags) for s in map(str, statespec))
        if ok and callback is not None:
            return callback(*args, **kw)
        return ok

    def identify(self, x, y):
        return ''


def _ttk_spec(*groups, **extra):
    spec = {'class': '', 'cursor': '', 'style': '', 'takefocus': ''}
    for g in groups:
        spec.update(g)
    spec.update(extra)
    return spec


_LABELISH = {'compound': '', 'image': '', 'padding': '', 'state': 'normal', 'text': '',
             'textvariable': '', 'underline': -1, 'width': ''}


class Widget(_TtkWidget, _tk.Widget):
    def __init__(self, master, widgetname=None, kw=None):
        _tk.Widget.__init__(self, master, **(kw or {}))


class Label(_TtkWidget, _tk.Label):
    _spec = _ttk_spec(_LABELISH, anchor='', background='', borderwidth='', font='', foreground='',
                      justify='', relief='', wraplength='')
    _style_class = 'TLabel'
    _class_name_default = 'TLabel'

    def _init_state(self):
        self._init_flags()

    def winfo_class(self):
        return self._class_name or 'TLabel'

    def _props(self):
        p = self._label_props({})
        return self._ttk_props(p)


class Button(_TtkWidget, _tk.Button):
    _spec = _ttk_spec(_LABELISH, command='', default='normal')
    _style_class = 'TButton'

    def _init_state(self):
        self._init_flags()

    def winfo_class(self):
        return self._class_name or 'TButton'

    def _props(self):
        p = self._label_props({})
        p['overrelief'] = ''
        return self._ttk_props(p)

    def invoke(self):
        if self._opts.get('state') == 'disabled' or 'disabled' in self._flags:
            return ''
        command = self._o('command')
        return command() if callable(command) else ''


class Checkbutton(_TtkWidget, _tk.Checkbutton):
    _spec = _ttk_spec(_LABELISH, command='', offvalue=0, onvalue=1, variable='')
    _style_class = 'TCheckbutton'

    def _init_state(self):
        self._init_flags()
        _tk.Checkbutton._init_state(self)

    def winfo_class(self):
        return self._class_name or 'TCheckbutton'

    def _props(self):
        p = self._label_props({})
        p['checked'] = self._checked()
        p['indicator'] = True
        p['selectcolor'] = None
        return self._ttk_props(p)


class Radiobutton(_TtkWidget, _tk.Radiobutton):
    _spec = _ttk_spec(_LABELISH, command='', value='', variable='')
    _style_class = 'TRadiobutton'

    def _init_state(self):
        self._init_flags()
        _tk.Radiobutton._init_state(self)

    def winfo_class(self):
        return self._class_name or 'TRadiobutton'

    def _props(self):
        p = self._label_props({})
        p['checked'] = self._checked()
        p['indicator'] = True
        p['selectcolor'] = None
        return self._ttk_props(p)


_ENTRYISH = {'background': '', 'exportselection': 1, 'font': '', 'foreground': '', 'invalidcommand': '',
             'justify': 'left', 'show': '', 'state': 'normal', 'textvariable': '', 'validate': 'none',
             'validatecommand': '', 'width': 20, 'xscrollcommand': ''}


class Entry(_TtkWidget, _tk.Entry):
    _spec = _ttk_spec(_ENTRYISH)
    _style_class = 'TEntry'

    def __init__(self, master=None, widget=None, **kw):
        _tk.Entry.__init__(self, master, **kw)

    def _init_state(self):
        self._init_flags()
        _tk.Entry._init_state(self)

    def winfo_class(self):
        return self._class_name or 'TEntry'

    def _props(self):
        p = self._entry_props({})
        return self._ttk_props(p)

    def bbox(self, index):
        return (0, 0, 0, 0)

    def validate(self):
        return _tk.Entry.validate(self)


class Combobox(Entry):
    _spec = _ttk_spec(_ENTRYISH, height=10, postcommand='', values='')
    _style_class = 'TCombobox'
    _kind = 'combobox'

    def winfo_class(self):
        return self._class_name or 'TCombobox'

    def _values(self):
        v = self._o('values')
        if v in ('', None):
            return []
        return [str(x) for x in (v if isinstance(v, (list, tuple)) else _splitlist(v))]

    def _props(self):
        p = Entry._props(self)
        p['values'] = self._values()
        p['rows'] = int(self._o('height') or 10)
        p['post'] = bool(self._o('postcommand'))
        return p

    def current(self, newindex=None):
        values = self._values()
        if newindex is None:
            try:
                return values.index(self._value)
            except ValueError:
                return -1
        i = int(newindex)
        if not 0 <= i < len(values):
            raise TclError('index "%s" out of range' % newindex)
        self._set_value(values[i])
        return None

    def set(self, value):
        self._set_value(str(value))

    def _editable(self):
        return self._o('state') != 'disabled' and 'disabled' not in self._flags

    def _on_combo(self, ev):
        self._set_value(str(ev.get('v', '')))
        _app.fire_virtual(self, 'ComboboxSelected')

    def _on_combopost(self, ev):
        command = self._o('postcommand')
        if callable(command):
            command()
        self._changed()
        _app.flush()
        _app.op('comboopen', self._id)


class Spinbox(Entry):
    _spec = _ttk_spec(_ENTRYISH, command='', format='', increment=1, to=0, values='', wrap=False)
    _spec['from'] = 0
    _style_class = 'TSpinbox'
    _kind = 'spinbox'

    def winfo_class(self):
        return self._class_name or 'TSpinbox'

    _post_create = _tk.Spinbox._post_create
    _values = _tk.Spinbox._values
    _is_integral = _tk.Spinbox._is_integral
    _fmt = _tk.Spinbox._fmt
    _initial = _tk.Spinbox._initial
    _step = _tk.Spinbox._step
    _on_spin = _tk.Spinbox._on_spin

    def set(self, value):
        self._set_value(str(value))

    def _props(self):
        p = Entry._props(self)
        p['buttonbg'] = None
        return p


class Frame(_TtkWidget, _tk.Frame):
    _spec = _ttk_spec(borderwidth='', height=0, padding='', relief='', width=0)
    _style_class = 'TFrame'

    def _init_state(self):
        self._init_flags()

    def winfo_class(self):
        return self._class_name or 'TFrame'

    def _props(self):
        p = {'cursor': _cursor_css(self._o('cursor')), 'hl': 0, 'bd': 0, 'relief': 'flat',
             'width': _px(self._o('width')), 'height': _px(self._o('height')), 'padx': 0, 'pady': 0}
        return self._ttk_props(p)


class Labelframe(_TtkWidget, _tk.LabelFrame):
    _spec = _ttk_spec(borderwidth='', height=0, labelanchor='nw', labelwidget='', padding='', relief='',
                      text='', underline=-1, width=0)
    _style_class = 'TLabelframe'

    def _init_state(self):
        self._init_flags()

    def winfo_class(self):
        return self._class_name or 'TLabelframe'

    def _props(self):
        p = {'cursor': _cursor_css(self._o('cursor')), 'hl': 0, 'bd': 1, 'relief': 'groove',
             'width': _px(self._o('width')), 'height': _px(self._o('height')), 'padx': 0, 'pady': 0,
             'text': str(self._o('text')), 'labelanchor': str(self._o('labelanchor'))}
        p = self._ttk_props(p)
        label_style = _merged_style(_style_chain('TLabelframe.Label'))
        if label_style.get('foreground'):
            p['fg'] = _color(label_style['foreground'])
        if label_style.get('font'):
            p['font'] = _font_css(label_style['font'])
        if p.get('relief') is None:
            p['relief'] = 'groove'
        return p


LabelFrame = Labelframe


class Separator(_TtkWidget, _tk.Widget):
    _spec = _ttk_spec(orient='horizontal')
    _style_class = 'TSeparator'
    _kind = 'separator'
    _class = 'Separator'

    def _init_state(self):
        self._init_flags()

    def winfo_class(self):
        return self._class_name or 'TSeparator'

    def _props(self):
        return self._ttk_props({'orient': str(self._o('orient'))})


class Sizegrip(_TtkWidget, _tk.Widget):
    _spec = _ttk_spec()
    _style_class = 'TSizegrip'
    _kind = 'sizegrip'
    _class = 'Sizegrip'

    def _init_state(self):
        self._init_flags()

    def winfo_class(self):
        return self._class_name or 'TSizegrip'

    def _props(self):
        return self._ttk_props({})


class Scrollbar(_TtkWidget, _tk.Scrollbar):
    _spec = _ttk_spec(command='', orient='vertical')
    _style_class = 'TScrollbar'

    def _init_state(self):
        self._init_flags()
        _tk.Scrollbar._init_state(self)

    def winfo_class(self):
        return self._class_name or 'TScrollbar'

    def _props(self):
        return {'orient': str(self._o('orient'))}


class Progressbar(_TtkWidget, _tk.Widget):
    _spec = _ttk_spec(length=100, maximum=100, mode='determinate', orient='horizontal', phase=0,
                      value=0.0, variable='')
    _style_class = 'TProgressbar'
    _kind = 'progressbar'
    _class = 'Progressbar'

    def _init_state(self):
        self._init_flags()
        self._timer = None
        self._opts['_var_obj'] = None

    def winfo_class(self):
        return self._class_name or 'TProgressbar'

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
        self._opts[name] = value

    def _current(self):
        var = self._opts.get('_var_obj')
        raw = var._value if var is not None else self._o('value')
        try:
            return float(raw)
        except (TypeError, ValueError):
            return 0.0

    def _props(self):
        p = {'value': self._current(), 'maximum': float(self._o('maximum') or 100),
             'mode': str(self._o('mode')), 'orient': str(self._o('orient')), 'length': _px(self._o('length'))}
        return self._ttk_props(p)

    def __getitem__(self, key):
        if _optname(key) == 'value':
            return self._current()
        return _tk.Widget.cget(self, key)

    cget = __getitem__

    def _write(self, value):
        var = self._opts.get('_var_obj')
        if var is not None:
            var._store(value, source=self)
        self._opts['value'] = value
        self._changed()

    def step(self, amount=None):
        amount = 1.0 if amount is None else float(amount)
        value = self._current() + amount
        maximum = float(self._o('maximum') or 100)
        if value >= maximum and str(self._o('mode')) == 'determinate':
            value = value - maximum
        self._write(value)

    def start(self, interval=None):
        self.stop()
        interval = 50 if interval is None else int(interval)

        def tick():
            self._timer = None
            if self._destroyed:
                return
            self.step()
            self._timer = self.after(interval, tick)
        self._timer = self.after(interval, tick)

    def stop(self):
        if self._timer is not None:
            self.after_cancel(self._timer)
            self._timer = None


class Scale(_TtkWidget, _tk.Scale):
    _spec = _ttk_spec(command='', length=100, orient='horizontal', state='normal', to=1.0, value=0.0,
                      variable='')
    _spec['from'] = 0.0
    _style_class = 'TScale'

    def _init_state(self):
        self._init_flags()
        _tk.Scale._init_state(self)

    def _post_create(self):
        var = self._opts.get('_var_obj')
        if var is None:
            var = DoubleVar(value=float(self._o('value') or self._o('from')))
            self._opts['_var_obj'] = var
            var._watch(self)
        self._value = self._clamp(self._raw_float(var._value))
        self._changed()

    def winfo_class(self):
        return self._class_name or 'TScale'

    def _resolution(self):
        return 0.0

    def _format(self, value):
        return repr(float(value))

    def get(self, x=None, y=None):
        return float(self._value)

    def _props(self):
        p = {'from': float(self._o('from')), 'to': float(self._o('to')), 'res': 0, 'value': self._value,
             'text': '', 'orient': str(self._o('orient')), 'length': _px(self._o('length')),
             'thickness': 15, 'showvalue': False, 'label': '', 'state': _state_str(self._o('state'))}
        return self._ttk_props(p)


class LabeledScale(Frame):
    def __init__(self, master=None, variable=None, from_=0, to=10, **kw):
        Frame.__init__(self, master, **kw)
        self._variable = variable or IntVar(master)
        self.label = Label(self)
        self.scale = Scale(self, variable=self._variable, from_=from_, to=to,
                           command=lambda v: self.label.configure(text=str(int(float(v)))))
        self.label.pack(side='top')
        self.scale.pack(side='bottom', fill='x')
        self.label.configure(text=str(self._variable.get()))

    @property
    def value(self):
        return self._variable.get()

    @value.setter
    def value(self, val):
        self._variable.set(val)


class Menubutton(_TtkWidget, _tk.Menubutton):
    _spec = _ttk_spec(_LABELISH, direction='below', menu='')
    _style_class = 'TMenubutton'

    def _init_state(self):
        self._init_flags()

    def winfo_class(self):
        return self._class_name or 'TMenubutton'

    def _props(self):
        p = self._label_props({})
        menu = self._o('menu')
        p['menu'] = menu._model() if isinstance(menu, _tk.Menu) and not menu._destroyed else None
        p['indicator'] = True
        return self._ttk_props(p)


class OptionMenu(Menubutton):
    _kind = 'optionmenu'

    def __init__(self, master, variable, default=None, *values, **kwargs):
        style = kwargs.pop('style', '')
        kwargs.pop('direction', None)
        self._callback = kwargs.pop('command', None)
        if kwargs:
            raise TclError('unknown option -%s' % next(iter(kwargs)))
        self._variable = variable
        Menubutton.__init__(self, master, textvariable=variable, style=style)
        self._menu = _tk.Menu(self, tearoff=False)
        self._opts['menu'] = self._menu
        self._menu._attach(self)
        self.set_menu(default, *values)

    def __getitem__(self, item):
        if item == 'menu':
            return self._menu
        return Menubutton.cget(self, item)

    cget = __getitem__

    def set_menu(self, default=None, *values):
        self._menu.delete(0, 'end')
        for val in values:
            self._menu.add_radiobutton(label=val, command=None if self._callback is None
                                       else (lambda v=val: self._callback(v)),
                                       variable=self._variable, value=val)
        if default:
            self._variable.set(default)
        self._changed()

    def _props(self):
        p = Menubutton._props(self)
        p['options'] = [str(e.get('label', '')) for e in self._menu._entries if e['type'] != 'tearoff']
        p['indices'] = [i for i, e in enumerate(self._menu._entries) if e['type'] != 'tearoff']
        return p

    def _on_opt(self, ev):
        self._menu.invoke(int(ev.get('i', 0)))

    def destroy(self):
        Menubutton.destroy(self)


class Notebook(_TtkWidget, _tk.Widget):
    _spec = _ttk_spec(height=0, padding='', width=0)
    _style_class = 'TNotebook'
    _kind = 'notebook'
    _class = 'Notebook'

    def _init_state(self):
        self._init_flags()
        self._tabs = []
        self._current = None

    def winfo_class(self):
        return self._class_name or 'TNotebook'

    def _props(self):
        p = {'width': _px(self._o('width')), 'height': _px(self._o('height'))}
        p = self._ttk_props(p)
        tab_style = _merged_style(_style_chain('TNotebook.Tab'))
        tab_maps = _merged_maps(_style_chain('TNotebook.Tab'))
        p['tabbg'] = _color(tab_style['background']) if tab_style.get('background') else None
        p['tabfg'] = _color(tab_style['foreground']) if tab_style.get('foreground') else None
        p['tabfont'] = _font_css(tab_style['font']) if tab_style.get('font') else None
        p['tabpadding'] = _padding(tab_style.get('padding'))
        sel = {}
        for opt in ('background', 'foreground'):
            for entry in tab_maps.get(opt, []):
                if len(entry) >= 2 and 'selected' in str(entry[0]).split():
                    sel[opt] = _color(entry[-1])
        p['tabsel'] = sel
        return p

    def _sync(self):
        _app.op('config', self._id, self._props())
        _app.op('tabs', self._id, [{'w': t['w']._id, 'text': str(t.get('text', '')),
                                    'state': str(t.get('state', 'normal')),
                                    'image': _image_name(t.get('image'))} for t in self._tabs],
                self._current._id if self._current is not None else None)

    def _tab_index(self, tab_id):
        if isinstance(tab_id, int) and not isinstance(tab_id, bool):
            if not 0 <= tab_id < len(self._tabs):
                raise TclError('Slave index %d out of bounds' % tab_id)
            return tab_id
        s = str(tab_id)
        if s == 'current':
            if self._current is None:
                raise TclError('no tabs')
            return self._index_of(self._current)
        if s == 'end':
            return len(self._tabs)
        for i, t in enumerate(self._tabs):
            if t['w'] is tab_id or t['w']._w == s:
                return i
        if s.isdigit():
            return self._tab_index(int(s))
        raise TclError('%s is not managed by %s' % (tab_id, self._w))

    def _index_of(self, widget):
        for i, t in enumerate(self._tabs):
            if t['w'] is widget:
                return i
        return -1

    def _tab_options(self, tab, kw):
        for k, v in kw.items():
            name = _optname(k)
            if name not in ('text', 'image', 'compound', 'padding', 'sticky', 'state', 'underline'):
                raise TclError('unknown option "-%s"' % name)
            tab[name] = v

    def add(self, child, **kw):
        i = self._index_of(child)
        if i >= 0:
            self._tab_options(self._tabs[i], kw)
            if self._tabs[i].get('state') == 'hidden':
                self._tabs[i]['state'] = 'normal'
        else:
            tab = {'w': child, 'text': '', 'state': 'normal'}
            self._tab_options(tab, kw)
            self._tabs.append(tab)
            if child._manager and child._geo_master is not None:
                child._geo_master._forget_slave(child)
            child._manager = 'notebook'
            child._geo_master = self
            if child not in self._slaves:
                self._slaves.append(child)
            if self._current is None:
                self._current = child
                _app.after_idle(_app.fire_virtual, (self, 'NotebookTabChanged'))
        self._changed()

    def insert(self, pos, child, **kw):
        self.add(child, **kw)
        i = self._index_of(child)
        tab = self._tabs.pop(i)
        target = self._tab_index(pos) if str(pos) != 'end' else len(self._tabs)
        self._tabs.insert(target, tab)
        self._changed()

    def forget(self, tab_id):
        i = self._tab_index(tab_id)
        tab = self._tabs.pop(i)
        w = tab['w']
        w._manager = None
        if w in self._slaves:
            self._slaves.remove(w)
        _app.op('unmanage', w._id)
        if self._current is w:
            self._current = self._tabs[min(i, len(self._tabs) - 1)]['w'] if self._tabs else None
        self._changed()

    def _forget_slave(self, slave):
        i = self._index_of(slave)
        if i >= 0:
            self._tabs.pop(i)
            if self._current is slave:
                self._current = self._tabs[0]['w'] if self._tabs else None
            self._changed()
        if slave in self._slaves:
            self._slaves.remove(slave)

    def hide(self, tab_id):
        i = self._tab_index(tab_id)
        self._tabs[i]['state'] = 'hidden'
        if self._current is self._tabs[i]['w']:
            visible = [t['w'] for t in self._tabs if t.get('state') != 'hidden']
            self._current = visible[0] if visible else None
        self._changed()

    def select(self, tab_id=None):
        if tab_id is None:
            return self._current._w if self._current is not None else ''
        i = self._tab_index(tab_id)
        w = self._tabs[i]['w']
        if self._tabs[i].get('state') == 'hidden':
            self._tabs[i]['state'] = 'normal'
        if w is not self._current:
            self._current = w
            self._changed()
            _app.after_idle(_app.fire_virtual, (self, 'NotebookTabChanged'))
        return None

    def tab(self, tab_id, option=None, **kw):
        tab = self._tabs[self._tab_index(tab_id)]
        if option is not None:
            return tab.get(_optname(option), '')
        if not kw:
            return {k: v for k, v in tab.items() if k != 'w'}
        self._tab_options(tab, kw)
        self._changed()
        return None

    def tabs(self):
        return tuple(t['w']._w for t in self._tabs)

    def index(self, tab_id):
        return self._tab_index(tab_id)

    def enable_traversal(self):
        pass

    def _on_nbtab(self, ev):
        i = int(ev.get('i', 0))
        if 0 <= i < len(self._tabs) and self._tabs[i].get('state') != 'disabled':
            self.select(i)


class Panedwindow(_TtkWidget, _tk.PanedWindow):
    _spec = _ttk_spec(height=0, orient='vertical', width=0)
    _style_class = 'TPanedwindow'

    def _init_state(self):
        self._init_flags()

    def winfo_class(self):
        return self._class_name or 'TPanedwindow'

    def _props(self):
        p = {'width': _px(self._o('width')), 'height': _px(self._o('height')), 'padx': 0, 'pady': 0,
             'hl': 0, 'bd': 0, 'relief': 'flat', 'cursor': ''}
        return self._ttk_props(p)

    def add(self, child, **kw):
        kw.pop('weight', None)
        side = 'left' if str(self._o('orient')) == 'horizontal' else 'top'
        child.pack(in_=self, side=side, fill='both', expand=True)

    def insert(self, pos, child, **kw):
        self.add(child, **kw)

    def pane(self, pane, option=None, **kw):
        return {}

    def sashpos(self, index, newpos=None):
        return 0


PanedWindow = Panedwindow


class Treeview(_TtkWidget, _tk.Widget):
    _spec = _ttk_spec(columns='', displaycolumns='#all', height=10, padding='', selectmode='extended',
                      show='tree headings', xscrollcommand='', yscrollcommand='')
    _style_class = 'Treeview'
    _kind = 'treeview'
    _class = 'Treeview'

    def _init_state(self):
        self._init_flags()
        self._items = {'': {'children': [], 'parent': None, 'text': '', 'values': [], 'open': True,
                            'tags': [], 'image': ''}}
        self._selection = []
        self._focus = ''
        self._iid_seq = 0
        self._headings = {}
        self._columns = {}
        self._tag_opts = {}
        self._tag_bindings = {}

    def winfo_class(self):
        return self._class_name or 'Treeview'

    def _column_ids(self):
        cols = self._o('columns')
        if cols in ('', None):
            return []
        return [str(c) for c in (cols if isinstance(cols, (list, tuple)) else _splitlist(cols))]

    def _col_key(self, column):
        s = str(column)
        cols = self._column_ids()
        if s == '#0':
            return '#0'
        if s.startswith('#'):
            try:
                n = int(s[1:])
            except ValueError:
                raise TclError('Invalid column index %s' % s)
            display = self._display_columns()
            if 1 <= n <= len(display):
                return display[n - 1]
            raise TclError('Column index %s out of bounds' % s)
        if isinstance(column, int) and not isinstance(column, bool):
            if 0 <= column < len(cols):
                return cols[column]
            raise TclError('Column index %d out of bounds' % column)
        if s not in cols:
            raise TclError('Invalid column index %s' % s)
        return s

    def _display_columns(self):
        d = self._o('displaycolumns')
        cols = self._column_ids()
        if d in ('', None, '#all') or d == ('#all',):
            return cols
        items = d if isinstance(d, (list, tuple)) else _splitlist(d)
        out = []
        for c in items:
            if isinstance(c, int):
                out.append(cols[c])
            elif str(c) in cols:
                out.append(str(c))
        return out

    def _props(self):
        p = {'height': int(self._o('height') or 10)}
        p = self._ttk_props(p)
        heading = _merged_style(_style_chain('Treeview.Heading'))
        p['headbg'] = _color(heading['background']) if heading.get('background') else None
        p['headfg'] = _color(heading['foreground']) if heading.get('foreground') else None
        p['headfont'] = _font_css(heading['font']) if heading.get('font') else None
        maps = _merged_maps(self._chain())
        sel = {}
        for opt in ('background', 'foreground'):
            for entry in maps.get(opt, []):
                if len(entry) >= 2 and 'selected' in ' '.join(str(s) for s in entry[:-1]).split():
                    sel[opt] = _color(entry[-1])
        p['sel'] = sel
        return p

    def _sync(self):
        _app.op('config', self._id, self._props())
        show = str(self._o('show') if not isinstance(self._o('show'), (list, tuple)) else ' '.join(self._o('show')))
        columns = []
        for key in ['#0'] + self._display_columns():
            h = self._headings.get(key, {})
            c = self._columns.get(key, {})
            columns.append({'id': key, 'text': str(h.get('text', '')), 'hanchor': _anchor(h.get('anchor', 'center')),
                            'anchor': _anchor(c.get('anchor', 'w')), 'width': _px(c.get('width', 200)),
                            'minwidth': _px(c.get('minwidth', 20)), 'stretch': _getboolean(c.get('stretch', 1)),
                            'command': bool(h.get('command'))})
        all_cols = self._column_ids()
        display = self._display_columns()

        def row(iid):
            item = self._items[iid]
            values = list(item['values'])
            cells = []
            for key in display:
                idx = all_cols.index(key)
                cells.append('' if idx >= len(values) else str(values[idx]))
            return {'iid': iid, 'text': str(item['text']), 'values': cells, 'open': bool(item['open']),
                    'tags': list(item['tags']), 'image': _image_name(item.get('image')),
                    'children': [row(c) for c in item['children']]}
        tags = {}
        for tag, o in self._tag_opts.items():
            tags[tag] = {'bg': _color(o.get('background')) or None, 'fg': _color(o.get('foreground')) or None,
                         'font': _font_css(o['font']) if o.get('font') else None}
        _app.op('tree', self._id, {'show': show.split(), 'columns': columns,
                                   'rows': [row(c) for c in self._items['']['children']],
                                   'selection': list(self._selection), 'focus': self._focus, 'tags': tags,
                                   'selectmode': str(self._o('selectmode'))})

    def _extra_wants(self):
        out = set()
        for table in self._tag_bindings.values():
            out |= table.wants()
        return out

    def _item(self, iid):
        s = str(iid)
        if s not in self._items:
            raise TclError('Item %s not found' % iid)
        return self._items[s]

    # structure
    def insert(self, parent, index, iid=None, **kw):
        parent = str(parent)
        if parent not in self._items:
            raise TclError('Item %s not found' % parent)
        if iid is None or iid == '':
            while True:
                self._iid_seq += 1
                iid = 'I%03X' % self._iid_seq
                if iid not in self._items:
                    break
        else:
            iid = str(iid)
            if iid in self._items:
                raise TclError('Item %s already exists' % iid)
        item = {'children': [], 'parent': parent, 'text': '', 'values': [], 'open': False, 'tags': [],
                'image': ''}
        self._items[iid] = item
        self._set_item(item, kw)
        children = self._items[parent]['children']
        if str(index) == 'end':
            children.append(iid)
        else:
            children.insert(max(0, int(index)), iid)
        self._changed()
        return iid

    def _set_item(self, item, kw):
        for k, v in kw.items():
            name = _optname(k)
            if name == 'values':
                item['values'] = list(v) if isinstance(v, (list, tuple)) else (list(_splitlist(v)) if v != '' else [])
            elif name == 'tags':
                item['tags'] = [str(t) for t in v] if isinstance(v, (list, tuple)) else list(_splitlist(v))
            elif name == 'open':
                item['open'] = _getboolean(v)
            elif name in ('text', 'image'):
                item[name] = v
            else:
                raise TclError('unknown option "-%s"' % name)

    def item(self, item, option=None, **kw):
        it = self._item(item)
        if option is not None:
            name = _optname(option)
            if name == 'values':
                return tuple(it['values']) if it['values'] else ''
            if name == 'tags':
                return tuple(it['tags']) if it['tags'] else ''
            if name == 'open':
                return 1 if it['open'] else 0
            if name in ('text', 'image'):
                return it[name]
            raise TclError('unknown option "-%s"' % name)
        if not kw:
            return {'text': it['text'], 'image': it['image'] or '',
                    'values': [_convert_stringval(v) for v in it['values']] if it['values'] else '',
                    'open': 1 if it['open'] else 0,
                    'tags': list(it['tags']) if it['tags'] else ''}
        self._set_item(it, kw)
        self._changed()
        return None

    def delete(self, *items):
        if len(items) == 1 and isinstance(items[0], (list, tuple)):
            items = tuple(items[0])
        for iid in items:
            self._item(iid)
        for iid in items:
            iid = str(iid)
            if iid not in self._items:
                continue
            parent = self._items[iid]['parent']
            if parent is not None and iid in self._items[parent]['children']:
                self._items[parent]['children'].remove(iid)
            self._drop(iid)
        self._changed()

    def _drop(self, iid):
        item = self._items.pop(iid, None)
        if item is None:
            return
        for c in item['children']:
            self._drop(c)
        if iid in self._selection:
            self._selection.remove(iid)
        if self._focus == iid:
            self._focus = ''

    def detach(self, *items):
        for iid in items:
            it = self._item(iid)
            parent = it['parent']
            if parent is not None and str(iid) in self._items[parent]['children']:
                self._items[parent]['children'].remove(str(iid))
            it['parent'] = None
        self._changed()

    def move(self, item, parent, index):
        iid = str(item)
        it = self._item(iid)
        old = it['parent']
        if old is not None and iid in self._items[old]['children']:
            self._items[old]['children'].remove(iid)
        parent = str(parent)
        children = self._items[parent]['children']
        if str(index) == 'end':
            children.append(iid)
        else:
            children.insert(max(0, int(index)), iid)
        it['parent'] = parent
        self._changed()

    reattach = move

    def exists(self, item):
        return str(item) in self._items and (str(item) == '' or self._items[str(item)]['parent'] is not None)

    def parent(self, item):
        p = self._item(item)['parent']
        return p or ''

    def index(self, item):
        iid = str(item)
        parent = self._item(iid)['parent']
        return self._items[parent]['children'].index(iid) if parent is not None else 0

    def next(self, item):
        iid = str(item)
        parent = self._item(iid)['parent']
        sibs = self._items[parent]['children'] if parent is not None else []
        i = sibs.index(iid) if iid in sibs else -1
        return sibs[i + 1] if 0 <= i < len(sibs) - 1 else ''

    def prev(self, item):
        iid = str(item)
        parent = self._item(iid)['parent']
        sibs = self._items[parent]['children'] if parent is not None else []
        i = sibs.index(iid) if iid in sibs else -1
        return sibs[i - 1] if i > 0 else ''

    def get_children(self, item=None):
        return tuple(self._item('' if item is None else item)['children'])

    def set_children(self, item, *newchildren):
        it = self._item(item)
        for c in it['children']:
            self._items[c]['parent'] = None
        it['children'] = []
        for c in newchildren:
            self.move(c, item, 'end')
        self._changed()

    def see(self, item):
        iid = str(item)
        p = self._item(iid)['parent']
        while p:
            self._items[p]['open'] = True
            p = self._items[p]['parent']
        self._changed()
        _app.op('see', self._id, iid)

    def focus(self, item=None):
        if item is None:
            return self._focus
        self._item(item)
        self._focus = str(item)
        self._changed()
        return None

    def set(self, item, column=None, value=None):
        it = self._item(item)
        cols = self._column_ids()
        if column is None:
            return {c: (_convert_stringval(it['values'][i]) if i < len(it['values']) else '')
                    for i, c in enumerate(cols)}
        key = self._col_key(column)
        idx = cols.index(key)
        if value is None:
            return it['values'][idx] if idx < len(it['values']) else ''
        while len(it['values']) <= idx:
            it['values'].append('')
        it['values'][idx] = value
        self._changed()
        return None

    # selection
    def selection(self, selop=None, items=None):
        if selop is None:
            return tuple(self._selection)
        getattr(self, 'selection_' + selop)(items)
        return None

    def _sel_items(self, items):
        if len(items) == 1 and isinstance(items[0], (list, tuple)):
            items = items[0]
        elif len(items) == 1 and isinstance(items[0], str) and ' ' in items[0]:
            items = _splitlist(items[0])
        out = []
        for i in items:
            self._item(i)
            out.append(str(i))
        return out

    def _selection_changed(self):
        self._changed()
        _app.after_idle(_app.fire_virtual, (self, 'TreeviewSelect'))

    def selection_set(self, *items):
        self._selection = self._sel_items(items)
        self._selection_changed()

    def selection_add(self, *items):
        for i in self._sel_items(items):
            if i not in self._selection:
                self._selection.append(i)
        self._selection_changed()

    def selection_remove(self, *items):
        for i in self._sel_items(items):
            if i in self._selection:
                self._selection.remove(i)
        self._selection_changed()

    def selection_toggle(self, *items):
        for i in self._sel_items(items):
            if i in self._selection:
                self._selection.remove(i)
            else:
                self._selection.append(i)
        self._selection_changed()

    # columns and headings
    def heading(self, column, option=None, **kw):
        key = self._col_key(column)
        h = self._headings.setdefault(key, {'text': '', 'image': '', 'anchor': 'center', 'command': ''})
        if option is not None:
            return h.get(_optname(option), '')
        if not kw:
            return dict(h)
        for k, v in kw.items():
            name = _optname(k)
            if name not in ('text', 'image', 'anchor', 'command'):
                raise TclError('unknown option "-%s"' % name)
            h[name] = v
        self._changed()
        return None

    def column(self, column, option=None, **kw):
        key = self._col_key(column)
        c = self._columns.setdefault(key, {'width': 200, 'minwidth': 20, 'stretch': 1, 'anchor': 'w', 'id': key})
        if option is not None:
            return c.get(_optname(option), '')
        if not kw:
            return dict(c)
        for k, v in kw.items():
            name = _optname(k)
            if name not in ('width', 'minwidth', 'stretch', 'anchor', 'id'):
                raise TclError('unknown option "-%s"' % name)
            c[name] = v
        self._changed()
        return None

    # tags
    def tag_configure(self, tagname, option=None, **kw):
        o = self._tag_opts.setdefault(str(tagname), {})
        if option is not None:
            return o.get(_optname(option), '')
        if not kw:
            return dict(o)
        for k, v in kw.items():
            o[_optname(k)] = v
        self._changed()
        return None

    def tag_has(self, tagname, item=None):
        if item is None:
            return tuple(iid for iid, it in self._items.items() if iid and tagname in it['tags'])
        return tagname in self._item(item)['tags']

    def tag_bind(self, tagname, sequence=None, callback=None):
        table = self._tag_bindings.setdefault(str(tagname), _BindingTable())
        if sequence is None or callback is None:
            return ''
        funcid = _app.register(callback)
        table.bind(sequence, callback, False, funcid)
        _app.mark(self)
        return funcid

    def _item_event(self, item, k, etype, detail, mods, count, event):
        if item is None or str(item) not in self._items:
            return None
        for tag in self._items[str(item)]['tags']:
            table = self._tag_bindings.get(tag)
            if table is None:
                continue
            for _fid, func in list(table.best(etype, detail, mods, count) or []):
                if func(event) == 'break':
                    return 'break'
        return None

    # geometry questions answered by the page
    def identify_row(self, y):
        q = _app.query(q='tvrow', w=self._id, y=int(y))
        return str(q) if q else ''

    def identify_column(self, x):
        q = _app.query(q='tvcol', w=self._id, x=int(x))
        return str(q) if q else ''

    def identify_region(self, x, y):
        q = _app.query(q='tvregion', w=self._id, x=int(x), y=int(y))
        return str(q) if q else 'nothing'

    def identify_element(self, x, y):
        return ''

    def identify(self, component, x, y):
        if component == 'row' or component == 'item':
            return self.identify_row(y)
        if component == 'column':
            return self.identify_column(x)
        if component == 'region':
            return self.identify_region(x, y)
        return ''

    def bbox(self, item, column=None):
        return ''

    def xview(self, *args):
        return (0.0, 1.0)

    def yview(self, *args):
        return (0.0, 1.0)

    def yview_moveto(self, fraction):
        pass

    def xview_moveto(self, fraction):
        pass

    # events from the page
    def _on_tvsel(self, ev):
        sel = [str(i) for i in ev.get('sel', []) if str(i) in self._items]
        if ev.get('f') is not None and str(ev.get('f')) in self._items:
            self._focus = str(ev['f'])
        if sel != self._selection:
            self._selection = sel
            self._changed()
            _app.fire_virtual(self, 'TreeviewSelect')

    def _on_tvopen(self, ev):
        iid = str(ev.get('iid'))
        if iid in self._items:
            self._items[iid]['open'] = bool(ev.get('open'))
            self._focus = iid
            self._changed()
            _app.fire_virtual(self, 'TreeviewOpen' if ev.get('open') else 'TreeviewClose')

    def _on_tvhead(self, ev):
        key = str(ev.get('col'))
        command = self._headings.get(key, {}).get('command')
        if callable(command):
            command()
