# tkinter.commondialog: the base class the standard dialogs share.

__all__ = ['Dialog']


class Dialog:
    command = None

    def __init__(self, master=None, **options):
        if master is None:
            master = options.get('parent')
        self.master = master
        self.options = options

    def _fixoptions(self):
        pass

    def _fixresult(self, widget, result):
        return result

    def show(self, **options):
        for k, v in options.items():
            self.options[k] = v
        return None
