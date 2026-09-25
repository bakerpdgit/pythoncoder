# tkinter.filedialog: choose a file from the program's own files (Coder's file panel).

import os
import fnmatch

from tkinter import _coder_dialog
from tkinter.commondialog import Dialog

__all__ = ['askopenfilename', 'askopenfilenames', 'askopenfile', 'askopenfiles', 'asksaveasfilename',
           'asksaveasfile', 'askdirectory', 'Open', 'SaveAs', 'Directory']

# Pyodide's own directories, which are not the student's files.
_SYSTEM_DIRS = {'lib', 'dev', 'proc', 'tmp', 'home', 'sys', 'usr', 'etc', 'bin'}


def _walk(base, want_dirs=False):
    base = os.path.abspath(base or os.getcwd())
    found = []
    for root, dirs, files in os.walk(base):
        if root == '/':
            dirs[:] = [d for d in dirs if d not in _SYSTEM_DIRS]
        dirs[:] = sorted(d for d in dirs if not d.startswith('.') and d != '__pycache__')
        if want_dirs:
            for d in dirs:
                found.append(os.path.join(root, d))
        else:
            for f in sorted(files):
                found.append(os.path.join(root, f))
    return base, found


def _filetypes(value):
    out = []
    for entry in value or ():
        if isinstance(entry, (tuple, list)) and len(entry) >= 2:
            label, patterns = entry[0], entry[1]
        else:
            label, patterns = str(entry), str(entry)
        if isinstance(patterns, str):
            patterns = patterns.split()
        out.append([str(label), [str(p) for p in patterns]])
    return out


def _choose(mode, options):
    base, paths = _walk(options.get('initialdir'), want_dirs=(mode == 'dir'))
    shown = [os.path.relpath(p, base) for p in paths]
    answer = _coder_dialog({
        'kind': 'file', 'mode': mode, 'title': str(options.get('title') or ''),
        'files': shown, 'filetypes': _filetypes(options.get('filetypes')),
        'initial': str(options.get('initialfile') or ''), 'multiple': bool(options.get('multiple')),
        'base': base,
    }, headless=None)
    if answer in (None, '', []):
        return None
    if isinstance(answer, list):
        return [os.path.normpath(os.path.join(base, a)) for a in answer]
    path = os.path.normpath(os.path.join(base, str(answer)))
    if mode == 'save':
        ext = options.get('defaultextension')
        if ext and not os.path.splitext(path)[1]:
            path += ext if str(ext).startswith('.') else '.' + str(ext)
    return path


def askopenfilename(**options):
    result = _choose('open', dict(options, multiple=False))
    return result or ''


def askopenfilenames(**options):
    result = _choose('open', dict(options, multiple=True))
    if not result:
        return ''
    return tuple(result if isinstance(result, list) else [result])


def askopenfile(mode='r', **options):
    filename = askopenfilename(**options)
    return open(filename, mode) if filename else None


def askopenfiles(mode='r', **options):
    files = askopenfilenames(**options)
    return [open(f, mode) for f in files] if files else None


def asksaveasfilename(**options):
    return _choose('save', options) or ''


def asksaveasfile(mode='w', **options):
    filename = asksaveasfilename(**options)
    return open(filename, mode) if filename else None


def askdirectory(**options):
    return _choose('dir', options) or ''


class Open(Dialog):
    def show(self, **options):
        self.options.update(options)
        if self.options.get('multiple'):
            return askopenfilenames(**self.options)
        return askopenfilename(**self.options)


class SaveAs(Dialog):
    def show(self, **options):
        self.options.update(options)
        return asksaveasfilename(**self.options)


class Directory(Dialog):
    def show(self, **options):
        self.options.update(options)
        return askdirectory(**self.options)
