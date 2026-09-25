# tkinter.scrolledtext: a Text in a Frame. The page scrolls the text itself.

from tkinter import Frame, Text, Scrollbar, Pack, Grid, Place, RIGHT, LEFT, Y, BOTH

__all__ = ['ScrolledText']


class ScrolledText(Text):
    def __init__(self, master=None, **kw):
        self.frame = Frame(master)
        self.vbar = Scrollbar(self.frame)
        self.vbar.pack(side=RIGHT, fill=Y)
        kw.update({'yscrollcommand': self.vbar.set})
        Text.__init__(self, self.frame, **kw)
        Text.pack(self, side=LEFT, fill=BOTH, expand=True)
        self.vbar['command'] = self.yview
        # Geometry methods place the frame, not the text inside it — as in tkinter.
        for m in [n for n in dir(Pack) + dir(Grid) + dir(Place) if not n.startswith('_')]:
            if m not in ('config', 'configure', 'forget') and not m.startswith('__'):
                setattr(self, m, getattr(self.frame, m))

    def __str__(self):
        return str(self.frame)
