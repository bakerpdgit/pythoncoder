// The Python sources behind a tkinter or turtle run, as text. Imported only
// through `loadCoderTkFiles` (utils/tkinter.ts), so Vite gives them a chunk of
// their own that is fetched the first time a program opens a window.

import initSource from '../python/tkinter/__init__.py?raw'
import colorsSource from '../python/tkinter/_colors.py?raw'
import svgSource from '../python/tkinter/_coder_svg.py?raw'
import constantsSource from '../python/tkinter/constants.py?raw'
import ttkSource from '../python/tkinter/ttk.py?raw'
import messageboxSource from '../python/tkinter/messagebox.py?raw'
import simpledialogSource from '../python/tkinter/simpledialog.py?raw'
import filedialogSource from '../python/tkinter/filedialog.py?raw'
import colorchooserSource from '../python/tkinter/colorchooser.py?raw'
import commondialogSource from '../python/tkinter/commondialog.py?raw'
import fontSource from '../python/tkinter/font.py?raw'
import scrolledtextSource from '../python/tkinter/scrolledtext.py?raw'
import imagetkSource from '../python/tkinter/_pil_imagetk.py?raw'

/** Coder's tkinter package, by path under the shim directory. */
export const TKINTER_SHIM_FILES: Record<string, string> = {
  'tkinter/__init__.py': initSource,
  'tkinter/_colors.py': colorsSource,
  'tkinter/_coder_svg.py': svgSource,
  'tkinter/constants.py': constantsSource,
  'tkinter/ttk.py': ttkSource,
  'tkinter/messagebox.py': messageboxSource,
  'tkinter/simpledialog.py': simpledialogSource,
  'tkinter/filedialog.py': filedialogSource,
  'tkinter/colorchooser.py': colorchooserSource,
  'tkinter/commondialog.py': commondialogSource,
  'tkinter/font.py': fontSource,
  'tkinter/scrolledtext.py': scrolledtextSource,
  'tkinter/_pil_imagetk.py': imagetkSource,
}

/**
 * CPython 3.13's Lib/turtle.py, unmodified (line endings aside). Pyodide
 * removes turtle.py from its standard library along with tkinter; on top of
 * Coder's tkinter the real module runs as it does in IDLE — its animation,
 * speed(), tracer() and events are its own. Its licence is in its header.
 * A chunk of its own again: a tkinter program does not need it.
 */
export const loadTurtleSource = async (): Promise<string> =>
  (await import('../python/turtle.py?raw')).default
