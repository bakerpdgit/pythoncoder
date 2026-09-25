# tkinter.font: named fonts, measured by the page.

import tkinter as _tk
from tkinter import _named_fonts, _font_spec, _font_css, _app

__all__ = ['NORMAL', 'ROMAN', 'BOLD', 'ITALIC', 'nametofont', 'Font', 'families', 'names']

NORMAL = 'normal'
ROMAN = 'roman'
BOLD = 'bold'
ITALIC = 'italic'

_font_seq = [0]
_OPTIONS = ('family', 'size', 'weight', 'slant', 'underline', 'overstrike')


def nametofont(name, root=None):
    return Font(name=name, exists=True, root=root)


class Font:
    """A named font. Changing one redraws every widget that uses it."""

    def __init__(self, root=None, font=None, name=None, exists=False, **options):
        if name is None:
            _font_seq[0] += 1
            name = 'font%d' % _font_seq[0]
        self.name = str(name)
        if exists:
            if self.name not in _named_fonts:
                raise _tk.TclError('named font "%s" does not already exist' % self.name)
            spec = _named_fonts[self.name]
        else:
            spec = _font_spec(font) if font is not None else dict(_named_fonts['TkDefaultFont'])
            if spec is None:
                spec = dict(_named_fonts['TkDefaultFont'])
            _named_fonts[self.name] = spec
        self._set(spec, options)
        self.delete_font = not exists

    def _set(self, spec, options):
        for k, v in options.items():
            if k not in _OPTIONS:
                raise _tk.TclError('bad option "-%s": must be -family, -size, -weight, -slant, '
                                   '-underline, or -overstrike' % k)
            if k == 'size':
                v = int(round(float(v)))
            elif k in ('underline', 'overstrike'):
                v = 1 if _tk._getboolean(v) else 0
            spec[k] = v
        if options:
            for w in list(_app.widgets.values()):
                w._changed()

    def _coder_spec(self):
        return dict(_named_fonts.get(self.name, _named_fonts['TkDefaultFont']))

    def __str__(self):
        return self.name

    def __repr__(self):
        return '<%s.%s object %r>' % (self.__class__.__module__, self.__class__.__qualname__, self.name)

    def __eq__(self, other):
        return isinstance(other, Font) and self.name == other.name

    def __hash__(self):
        return hash(self.name)

    def __getitem__(self, key):
        return self.cget(key)

    def __setitem__(self, key, value):
        self.configure(**{key: value})

    def copy(self):
        return Font(font=tuple(self._tuple()))

    def _tuple(self):
        s = self._coder_spec()
        styles = []
        if s['weight'] == 'bold':
            styles.append('bold')
        if s['slant'] == 'italic':
            styles.append('italic')
        if s['underline']:
            styles.append('underline')
        if s['overstrike']:
            styles.append('overstrike')
        return [s['family'], s['size']] + styles

    def actual(self, option=None, displayof=None):
        s = self._coder_spec()
        return s[option] if option else s

    def cget(self, option):
        return self._coder_spec()[option]

    def config(self, **options):
        if not options:
            return self._coder_spec()
        self._set(_named_fonts.setdefault(self.name, self._coder_spec()), options)

    configure = config

    def measure(self, text, displayof=None):
        q = _app.query(q='measure', font=_font_css(self)[0], text=str(text))
        if q is None:
            size = abs(self._coder_spec()['size']) or 9
            return int(len(str(text)) * size * 0.8)
        return int(q)

    def metrics(self, *options, **kw):
        q = _app.query(q='metrics', font=_font_css(self)[0])
        size = abs(self._coder_spec()['size']) or 9
        m = q or {'ascent': int(size * 1.1), 'descent': int(size * 0.3), 'linespace': int(size * 1.5)}
        m = dict(m)
        m['fixed'] = 1 if 'courier' in self._coder_spec()['family'].lower() or 'mono' in self._coder_spec()['family'].lower() else 0
        if options:
            return m[options[0]] if len(options) == 1 else tuple(m[o] for o in options)
        return m


def families(root=None, displayof=None):
    return ('Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS', 'Consolas', 'Courier',
            'Courier New', 'Georgia', 'Helvetica', 'Impact', 'Segoe UI', 'Tahoma', 'Times',
            'Times New Roman', 'Trebuchet MS', 'Verdana')


def names(root=None):
    return tuple(_named_fonts)
