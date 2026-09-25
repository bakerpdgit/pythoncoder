# tkinter.colorchooser: askcolor(), using the browser's colour picker.

from tkinter import _coder_dialog, _color
from tkinter.commondialog import Dialog

__all__ = ['Chooser', 'askcolor']


class Chooser(Dialog):
    command = 'tk_chooseColor'

    def show(self, **options):
        self.options.update(options)
        initial = self.options.get('initialcolor') or self.options.get('color')
        if isinstance(initial, (tuple, list)):
            initial = '#%02x%02x%02x' % tuple(int(v) for v in initial[:3])
        css = _color(initial) if initial else '#000000'
        if not (isinstance(css, str) and css.startswith('#') and len(css) == 7):
            css = '#000000'
        answer = _coder_dialog({'kind': 'color', 'title': str(self.options.get('title') or ''),
                                'initial': css}, headless=None)
        if not answer:
            return (None, None)
        answer = str(answer)
        rgb = (int(answer[1:3], 16), int(answer[3:5], 16), int(answer[5:7], 16))
        return (rgb, answer)


def askcolor(color=None, **options):
    if color:
        options = dict(options, initialcolor=color)
    return Chooser(**options).show()
