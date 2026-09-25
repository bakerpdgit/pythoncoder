# tkinter.simpledialog: askstring / askinteger / askfloat, and the Dialog base class.

from tkinter import (Toplevel, Frame, Button, LEFT, ACTIVE, _coder_dialog, _default_root)
import tkinter as _tk
from tkinter import messagebox

__all__ = ['SimpleDialog', 'Dialog', 'askinteger', 'askfloat', 'askstring']


class Dialog(Toplevel):
    """A modal dialog to subclass: override body(), validate() and apply()."""

    def __init__(self, parent, title=None):
        master = parent or _tk._get_default_root()
        Toplevel.__init__(self, master)
        self.withdraw()
        if title:
            self.title(title)
        self.parent = parent
        self.result = None
        body = Frame(self)
        self.initial_focus = self.body(body)
        body.pack(padx=5, pady=5)
        self.buttonbox()
        if self.initial_focus is None:
            self.initial_focus = self
        self.protocol('WM_DELETE_WINDOW', self.cancel)
        self.deiconify()
        self.initial_focus.focus_set()
        self.grab_set()
        self.wait_window(self)

    def destroy(self):
        self.initial_focus = None
        Toplevel.destroy(self)

    def body(self, master):
        pass

    def buttonbox(self):
        box = Frame(self)
        w = Button(box, text='OK', width=10, command=self.ok, default=ACTIVE)
        w.pack(side=LEFT, padx=5, pady=5)
        w = Button(box, text='Cancel', width=10, command=self.cancel)
        w.pack(side=LEFT, padx=5, pady=5)
        self.bind('<Return>', self.ok)
        self.bind('<Escape>', self.cancel)
        box.pack()

    def ok(self, event=None):
        if not self.validate():
            if self.initial_focus is not None:
                self.initial_focus.focus_set()
            return
        self.withdraw()
        try:
            self.apply()
        finally:
            self.cancel()

    def cancel(self, event=None):
        if self.parent is not None:
            try:
                self.parent.focus_set()
            except _tk.TclError:
                pass
        self.grab_release()
        self.destroy()

    def validate(self):
        return 1

    def apply(self):
        pass


class SimpleDialog:
    """A dialog with a message and a row of buttons; go() returns the index pressed."""

    def __init__(self, master, text='', buttons=[], default=None, cancel=None, title=None, class_=None):
        self.text = text
        self.buttons = list(buttons)
        self.default = default
        self.cancel = cancel
        self.title = title

    def go(self):
        answer = _coder_dialog({'kind': 'message', 'title': str(self.title or ''), 'message': str(self.text),
                                'detail': '', 'icon': 'question', 'buttons': [str(b) for b in self.buttons],
                                'default': str(self.buttons[self.default]) if self.default is not None and self.buttons else ''},
                               headless=None)
        if answer in self.buttons:
            return self.buttons.index(answer)
        return self.cancel


def _ask(kind, title, prompt, initialvalue=None, minvalue=None, maxvalue=None, show=None, **kw):
    while True:
        answer = _coder_dialog({'kind': 'string', 'title': '' if title is None else str(title),
                                'prompt': '' if prompt is None else str(prompt),
                                'initial': '' if initialvalue is None else str(initialvalue),
                                'show': show or ''}, headless=None)
        if answer is None:
            return None
        if kind == 'string':
            return str(answer)
        try:
            value = int(str(answer).strip()) if kind == 'int' else float(str(answer).strip())
        except ValueError:
            messagebox.showwarning('Illegal value',
                                   ('Not an integer.' if kind == 'int' else 'Not a floating-point value.')
                                   + '\nPlease try again')
            continue
        if minvalue is not None and value < minvalue:
            messagebox.showwarning('Too small', 'The allowed minimum value is %s. Please try again.' % minvalue)
            continue
        if maxvalue is not None and value > maxvalue:
            messagebox.showwarning('Too large', 'The allowed maximum value is %s. Please try again.' % maxvalue)
            continue
        return value


def askstring(title, prompt, **kw):
    return _ask('string', title, prompt, **kw)


def askinteger(title, prompt, **kw):
    return _ask('int', title, prompt, **kw)


def askfloat(title, prompt, **kw):
    return _ask('float', title, prompt, **kw)
