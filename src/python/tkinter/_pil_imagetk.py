# PIL.ImageTk for Coder: Pillow images shown through the browser tkinter.
#
# Pillow's own ImageTk reaches into Tcl's C API, which does not exist here, so
# this stands in for it. A Pillow image is saved as PNG and handed to
# tkinter.PhotoImage, which is how the page shows every image anyway.

import io
import tkinter

__all__ = ['PhotoImage', 'BitmapImage', 'getimage']


def _png_bytes(image):
    buf = io.BytesIO()
    if image.mode not in ('RGB', 'RGBA', 'L', 'LA', 'P', '1'):
        image = image.convert('RGBA')
    image.save(buf, format='PNG')
    return buf.getvalue()


class PhotoImage:
    def __init__(self, image=None, size=None, **kw):
        from PIL import Image
        if image is None:
            if 'file' in kw:
                image = Image.open(kw.pop('file'))
            elif 'data' in kw:
                image = Image.open(io.BytesIO(kw.pop('data')))
        if isinstance(image, str):
            mode = image
            image = Image.new(mode, size or (1, 1))
        self._pil = image
        master = kw.pop('master', None)
        self._photo = tkinter.PhotoImage(data=_png_bytes(image), master=master)
        self.__size = image.size

    @property
    def name(self):
        return self._photo.name

    def __str__(self):
        return str(self._photo)

    def width(self):
        return self.__size[0]

    def height(self):
        return self.__size[1]

    def paste(self, im, box=None):
        self._pil = im
        self.__size = im.size
        self._photo.configure(data=_png_bytes(im))


class BitmapImage:
    def __init__(self, image=None, **kw):
        self._photo = tkinter.BitmapImage(**{k: v for k, v in kw.items() if k == 'master'})
        self._size = image.size if image is not None else (0, 0)

    @property
    def name(self):
        return self._photo.name

    def __str__(self):
        return str(self._photo)

    def width(self):
        return self._size[0]

    def height(self):
        return self._size[1]


def getimage(photo):
    return getattr(photo, '_pil', None)
