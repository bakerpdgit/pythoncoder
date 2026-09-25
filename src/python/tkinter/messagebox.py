# tkinter.messagebox: the standard message boxes, drawn by Coder's page.

from tkinter import _coder_dialog
from tkinter.commondialog import Dialog

__all__ = ['showinfo', 'showwarning', 'showerror', 'askquestion', 'askokcancel', 'askyesno',
           'askyesnocancel', 'askretrycancel']

# icons
ERROR = 'error'
INFO = 'info'
QUESTION = 'question'
WARNING = 'warning'

# types
ABORTRETRYIGNORE = 'abortretryignore'
OK = 'ok'
OKCANCEL = 'okcancel'
RETRYCANCEL = 'retrycancel'
YESNO = 'yesno'
YESNOCANCEL = 'yesnocancel'

# replies
ABORT = 'abort'
RETRY = 'retry'
IGNORE = 'ignore'
OK = 'ok'
CANCEL = 'cancel'
YES = 'yes'
NO = 'no'

_BUTTONS = {
    'ok': ['ok'], 'okcancel': ['ok', 'cancel'], 'yesno': ['yes', 'no'],
    'yesnocancel': ['yes', 'no', 'cancel'], 'retrycancel': ['retry', 'cancel'],
    'abortretryignore': ['abort', 'retry', 'ignore'],
}


class Message(Dialog):
    command = 'tk_messageBox'

    def show(self, **options):
        for k, v in options.items():
            self.options[k] = v
        o = self.options
        kind = str(o.get('type', OK))
        buttons = _BUTTONS.get(kind, ['ok'])
        default = str(o.get('default', buttons[0]))
        answer = _coder_dialog({
            'kind': 'message',
            'title': '' if o.get('title') is None else str(o.get('title')),
            'message': '' if o.get('message') is None else str(o.get('message')),
            'detail': '' if o.get('detail') is None else str(o.get('detail')),
            'icon': str(o.get('icon', INFO)),
            'buttons': buttons,
            'default': default,
        }, headless=default)
        return str(answer) if answer else (CANCEL if CANCEL in buttons else buttons[-1])


def _show(title=None, message=None, _icon=None, _type=None, **options):
    if _icon and 'icon' not in options:
        options['icon'] = _icon
    if _type and 'type' not in options:
        options['type'] = _type
    if title:
        options['title'] = title
    if message:
        options['message'] = message
    return Message(**options).show()


def showinfo(title=None, message=None, **options):
    return _show(title, message, INFO, OK, **options)


def showwarning(title=None, message=None, **options):
    return _show(title, message, WARNING, OK, **options)


def showerror(title=None, message=None, **options):
    return _show(title, message, ERROR, OK, **options)


def askquestion(title=None, message=None, **options):
    return _show(title, message, QUESTION, YESNO, **options)


def askokcancel(title=None, message=None, **options):
    return _show(title, message, QUESTION, OKCANCEL, **options) == OK


def askyesno(title=None, message=None, **options):
    return _show(title, message, QUESTION, YESNO, **options) == YES


def askyesnocancel(title=None, message=None, **options):
    s = _show(title, message, QUESTION, YESNOCANCEL, **options)
    if s == CANCEL:
        return None
    return s == YES


def askretrycancel(title=None, message=None, **options):
    return _show(title, message, WARNING, RETRYCANCEL, **options) == RETRY
