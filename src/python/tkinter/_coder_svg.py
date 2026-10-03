"""A turtle drawing as SVG: what Coder's tester compares, and its previews show.

Not part of tkinter. It reads what turtle.py left on its canvas and writes it
out in a canonical form, so that two programs that draw the same picture give
the same text:

- every line is cut into its segments, and segments that carry straight on in
  the same style are joined again, so forward(100) and two forward(50)s — or
  turtle starting a new line item every 42 points — draw the same lines;
- a segment of no length (dot() draws one, with round caps) is a circle;
- filled shapes lose repeated points and points in the middle of a straight
  side, for the same reason;
- numbers are rounded to a tenth of a pixel, and colours are #rrggbb;
- the turtles themselves are left out when `include_turtles` is false (they
  are where the turtle stopped, not what it drew), as are items nothing
  can see.

Coordinates are the canvas's, with y down, as the page draws them.
"""

import math

from tkinter import Canvas, _color, _font_css

_MERGE_TOLERANCE = 1e-6


def _num(value):
    r = round(float(value), 1)
    if r == 0:
        r = 0.0
    return '%.1f' % r


def _escape(text):
    return (str(text).replace('&', '&amp;').replace('<', '&lt;')
            .replace('>', '&gt;').replace('"', '&quot;'))


def _points(coords):
    return [(float(coords[i]), float(coords[i + 1])) for i in range(0, len(coords) - 1, 2)]


def _collinear_on(d1, d2):
    """Do two direction vectors point the same way along one line?"""
    cross = d1[0] * d2[1] - d1[1] * d2[0]
    dot = d1[0] * d2[0] + d1[1] * d2[1]
    scale = math.hypot(*d1) * math.hypot(*d2)
    return dot > 0 and abs(cross) <= _MERGE_TOLERANCE * max(scale, 1.0)


def _simplify_ring(points):
    out = []
    for p in points:
        if not out or (abs(p[0] - out[-1][0]) > 1e-9 or abs(p[1] - out[-1][1]) > 1e-9):
            out.append(p)
    if len(out) > 1 and abs(out[0][0] - out[-1][0]) <= 1e-9 and abs(out[0][1] - out[-1][1]) <= 1e-9:
        out.pop()
    changed = True
    while changed and len(out) > 3:
        changed = False
        for i in range(len(out)):
            a, b, c = out[i - 1], out[i], out[(i + 1) % len(out)]
            if _collinear_on((b[0] - a[0], b[1] - a[1]), (c[0] - b[0], c[1] - b[1])):
                del out[i]
                changed = True
                break
    return out


class _Writer:
    def __init__(self):
        self.lines = []
        self.run = None          # a line being extended: [x1, y1, x2, y2, style]
        self.box = [math.inf, math.inf, -math.inf, -math.inf]

    def grow(self, x, y, pad=0.0):
        b = self.box
        b[0] = min(b[0], x - pad)
        b[1] = min(b[1], y - pad)
        b[2] = max(b[2], x + pad)
        b[3] = max(b[3], y + pad)

    def end_run(self):
        if self.run is None:
            return
        x1, y1, x2, y2, (stroke, width, cap) = self.run
        self.lines.append('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="%s" stroke-linecap="%s"/>'
                          % (_num(x1), _num(y1), _num(x2), _num(y2), stroke, _num(width), cap))
        self.run = None

    def segment(self, a, b, style):
        stroke, width, cap = style
        self.grow(a[0], a[1], width / 2)
        self.grow(b[0], b[1], width / 2)
        if math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9:
            if cap == 'round':
                self.end_run()
                self.lines.append('<circle cx="%s" cy="%s" r="%s" fill="%s"/>'
                                  % (_num(a[0]), _num(a[1]), _num(width / 2), stroke))
            return
        run = self.run
        if run is not None and run[4] == style and abs(run[2] - a[0]) < 1e-9 and abs(run[3] - a[1]) < 1e-9 \
                and _collinear_on((run[2] - run[0], run[3] - run[1]), (b[0] - a[0], b[1] - a[1])):
            run[2], run[3] = b[0], b[1]
            return
        self.end_run()
        self.run = [a[0], a[1], b[0], b[1], style]

    def element(self, text):
        self.end_run()
        self.lines.append(text)


def _turtle_items(screen):
    ids = set()
    for t in screen.turtles():
        image = getattr(t, 'turtle', None)
        item = getattr(image, '_item', None)
        if isinstance(item, (list, tuple)):
            ids.update(item)
        elif item is not None:
            ids.add(item)
    return ids


def canvas_svg(canvas, skip=()):
    """Every visible item on `canvas`, in stacking order, as canonical SVG."""
    w = _Writer()
    for iid in canvas._order:
        if iid in skip:
            continue
        item = canvas._items.get(iid)
        if item is None:
            continue
        o = item['opts']
        if str(o.get('state') or '') == 'hidden':
            continue
        kind = item['type']
        pts = _points(item['coords'])
        if kind == 'line':
            stroke = _color(o.get('fill'))
            if not stroke or not pts:
                continue
            style = (stroke, float(o.get('width', 1) or 1), str(o.get('capstyle', 'butt')))
            if len(pts) == 1:
                pts = pts * 2
            for a, b in zip(pts, pts[1:]):
                w.segment(a, b, style)
        elif kind == 'polygon':
            fill = _color(o.get('fill')) or 'none'
            outline = _color(o.get('outline')) or 'none'
            ring = _simplify_ring(pts)
            if (fill == 'none' and outline == 'none') or len(ring) < 3:
                continue
            width = float(o.get('width', 1) or 1)
            for p in ring:
                w.grow(p[0], p[1], width / 2 if outline != 'none' else 0)
            w.element('<polygon points="%s" fill="%s" stroke="%s" stroke-width="%s"/>'
                      % (' '.join('%s,%s' % (_num(x), _num(y)) for x, y in ring), fill, outline,
                         _num(width) if outline != 'none' else '0.0'))
        elif kind == 'text':
            text = str(o.get('text', ''))
            if not text or not pts:
                continue
            x, y = pts[0]
            font = _font_css(o.get('font'))
            w.grow(x, y, 10)
            w.element('<text x="%s" y="%s" fill="%s" font="%s" anchor="%s">%s</text>'
                      % (_num(x), _num(y), _color(o.get('fill')) or 'none', _escape(font[0] if isinstance(font, (list, tuple)) else font),
                         _escape(o.get('anchor', 'center')), _escape(text)))
        elif kind == 'image':
            # turtle keeps an empty image item for bgpic() from the start.
            if not pts or not o.get('image'):
                continue
            x, y = pts[0]
            w.grow(x, y, 10)
            w.element('<image x="%s" y="%s" name="%s"/>' % (_num(x), _num(y), _escape(o.get('image', ''))))
        elif kind in ('rectangle', 'oval', 'arc') and len(pts) == 2:
            (x1, y1), (x2, y2) = pts
            w.grow(x1, y1)
            w.grow(x2, y2)
            w.element('<%s x1="%s" y1="%s" x2="%s" y2="%s" fill="%s" stroke="%s"/>'
                      % (kind, _num(x1), _num(y1), _num(x2), _num(y2), _color(o.get('fill')) or 'none',
                         _color(o.get('outline')) or 'none'))
    w.end_run()
    return w


def turtle_svg(turtle, include_turtles=True):
    """The turtle screen's drawing as canonical SVG, or '' if nothing ever made one."""
    scrolled = getattr(turtle._Screen, '_canvas', None)
    canvas = getattr(scrolled, '_canvas', scrolled)
    if not isinstance(canvas, Canvas) or canvas._destroyed:
        return ''
    screen = turtle.Screen()
    skip = () if include_turtles else _turtle_items(screen)
    w = canvas_svg(canvas, skip)
    x0, y0, x1, y1 = w.box
    if x0 == math.inf:
        x0, y0, x1, y1 = -200.0, -150.0, 200.0, 150.0
    margin = 10.0
    x0, y0, x1, y1 = x0 - margin, y0 - margin, x1 + margin, y1 + margin
    bg = _color(canvas.cget('background')) or '#ffffff'
    head = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s %s %s %s" width="%s" height="%s">'
            % (_num(x0), _num(y0), _num(x1 - x0), _num(y1 - y0), _num(x1 - x0), _num(y1 - y0)))
    rect = '<rect x="%s" y="%s" width="%s" height="%s" fill="%s"/>' % (_num(x0), _num(y0), _num(x1 - x0), _num(y1 - y0), bg)
    return '\n'.join([head, rect] + w.lines + ['</svg>'])
