"""Marking a chart by what it shows.

A chart test (``{"typ": "chart", "filename": "sol.py"}``) passes when the
student's program draws the same chart as the solution file. "The same" is
decided from *facts* about each chart rather than from its pixels: the titles
and axis labels, what kind of series it holds (lines, bars, points, a heatmap)
and the numbers each one plots, the legend, any text written on it. So
``ax.bar`` passes for ``plt.bar``, a loop passes for three calls, and a title
typed in a different case passes - but a missing label, a wrong column or a
line where a bar chart was asked for does not, and the student is told which.

Colours, sizes, fonts and the like are left alone unless a test asks for
colours (``"colours": true``), because a beginner's chart should not fail for
being a slightly different blue.

The tester worker installs this module as ``_coder_charts`` and calls:

- ``reset()`` before a program runs;
- ``capture_open_figures()`` from ``plt.show()`` (and after the program, for
  figures it built but never showed) - every open matplotlib figure is
  described and then closed, exactly as ``show()`` does on the page;
- ``capture_plotly(fig)`` from ``plotly.io.show``;
- ``take()`` after the run, for what the program drew;
- ``compare(expected, actual, options)`` -> a JSON string for the page.

Everything here runs under native Python too (``chartCheck.test.ts``).
"""

import base64
import io
import json
import math
import numbers

_captured = []

# How many differences are worth telling a student about at once.
_MAX_DIFFERENCES = 4


# ── capturing ──────────────────────────────────────────────────────────────


def reset():
    del _captured[:]


def take():
    charts = list(_captured)
    reset()
    return charts


def capture_open_figures():
    """Describe every open pyplot figure, then close them (what show() does)."""
    import matplotlib.pyplot as plt
    for num in plt.get_fignums():
        fig = plt.figure(num)
        try:
            _captured.append(describe_matplotlib(fig))
        except Exception as exc:  # a chart we cannot read must not end the run
            _captured.append({'kind': 'unreadable', 'error': str(exc)})
    plt.close('all')


def capture_plotly(fig):
    try:
        _captured.append(describe_plotly(fig))
    except Exception as exc:
        _captured.append({'kind': 'unreadable', 'error': str(exc)})


# ── values ─────────────────────────────────────────────────────────────────


def _value(v):
    """One plotted value, made comparable: a float, a bool, None or text."""
    try:
        import numpy as np
        if isinstance(v, np.generic):
            v = v.item()
    except ImportError:
        pass
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, numbers.Real):
        f = float(v)
        return None if math.isnan(f) else f
    return str(v)


def _values(seq):
    if seq is None:
        return []
    try:
        import numpy as np
    except ImportError:
        return [_value(v) for v in seq]
    if isinstance(seq, np.ma.MaskedArray):
        # A heatmap's hidden squares: masked, so not plotted at all.
        hidden = np.ma.getmaskarray(seq).ravel().tolist()
        shown = _values(np.asarray(seq.data))
        return [None if h else v for v, h in zip(shown, hidden)]
    arr = np.asarray(seq)
    if arr.dtype.kind == 'M':
        # Dates as dates: as objects, nanosecond datetimes turn into bare integers.
        return [None if np.isnat(v) else str(v) for v in arr.ravel()]
    return [_value(v) for v in np.asarray(seq, dtype=object).ravel().tolist()]


def _text(s):
    return ' '.join(str(s or '').split())


def _hex(colour):
    try:
        from matplotlib.colors import to_hex
        return to_hex(colour, keep_alpha=False)
    except Exception:
        return str(colour)


# ── matplotlib ─────────────────────────────────────────────────────────────

_LINESTYLES = {'-': 'solid', 'solid': 'solid', '--': 'dashed', 'dashed': 'dashed',
               ':': 'dotted', 'dotted': 'dotted', '-.': 'dash-dot', 'dashdot': 'dash-dot',
               'None': 'none', 'none': 'none', '': 'none', ' ': 'none'}


def _category_names(axis):
    """For a categorical axis (bars of names), position -> name."""
    units = axis.get_units()
    mapping = getattr(units, '_mapping', None)
    if not mapping:
        return None
    return {int(v): str(k) for k, v in mapping.items()}


def _place(names, position):
    if names is not None:
        nearest = int(round(position))
        if abs(position - nearest) < 1e-6 and nearest in names:
            return names[nearest]
    return _value(position)


def _where(ax):
    try:
        spec = ax.get_subplotspec()
    except Exception:
        spec = None
    if spec is None:
        return None
    rows, cols, start, _stop = spec.get_geometry()
    return (int(rows), int(cols), int(start))


def _series_label(artist):
    label = artist.get_label() or ''
    return '' if label.startswith('_') else _text(label)


def _bars(ax, container):
    patches = list(container.patches)
    orientation = getattr(container, 'orientation', None)
    if orientation is None and patches:
        orientation = 'vertical'
    vertical = orientation != 'horizontal'
    names = _category_names(ax.xaxis if vertical else ax.yaxis)
    positions, values = [], []
    data = getattr(container, 'datavalues', None)
    for i, p in enumerate(patches):
        if vertical:
            positions.append(_place(names, p.get_x() + p.get_width() / 2))
            values.append(_value(data[i]) if data is not None else _value(p.get_height()))
        else:
            positions.append(_place(names, p.get_y() + p.get_height() / 2))
            values.append(_value(data[i]) if data is not None else _value(p.get_width()))
    return {
        'kind': 'bars',
        'label': _series_label(container),
        'horizontal': not vertical,
        'x': positions,
        'y': values,
        'colours': [_hex(p.get_facecolor()) for p in patches],
    }


def describe_axes(ax):
    from matplotlib.collections import PathCollection, PolyCollection, QuadMesh
    from matplotlib.container import BarContainer

    series = []
    in_containers = set()
    for container in ax.containers:
        if isinstance(container, BarContainer):
            series.append(_bars(ax, container))
            in_containers.update(id(p) for p in container.patches)

    for line in ax.lines:
        x = line.get_xdata(orig=True)
        y = line.get_ydata(orig=True)
        xs, ys = _values(x), _values(y)
        if not xs and not ys:
            continue
        marker = line.get_marker()
        series.append({
            'kind': 'line',
            'label': _series_label(line),
            'x': xs,
            'y': ys,
            'markers': marker not in (None, '', ' ', 'None', 'none'),
            'linestyle': _LINESTYLES.get(str(line.get_linestyle()), str(line.get_linestyle())),
            'colours': [_hex(line.get_color())],
        })

    for coll in ax.collections:
        if isinstance(coll, QuadMesh):
            arr = coll.get_array()
            series.append({'kind': 'heatmap', 'label': '', 'x': [], 'y': _values(arr),
                           'colours': []})
        elif isinstance(coll, PathCollection):
            offsets = coll.get_offsets()
            xs = _values([o[0] for o in offsets])
            ys = _values([o[1] for o in offsets])
            series.append({'kind': 'points', 'label': _series_label(coll), 'x': xs, 'y': ys,
                           'colours': [_hex(c) for c in coll.get_facecolors()[:1]]})
        elif isinstance(coll, PolyCollection):
            series.append({'kind': 'area', 'label': _series_label(coll), 'x': [],
                           'y': [len(coll.get_paths())],
                           'colours': [_hex(c) for c in coll.get_facecolors()[:1]]})

    shapes = {}
    for patch in ax.patches:
        if id(patch) in in_containers:
            continue
        name = type(patch).__name__
        shapes[name] = shapes.get(name, 0) + 1

    legend = ax.get_legend()
    return {
        'where': _where(ax),
        'title': _text(ax.get_title()),
        'xlabel': _text(ax.get_xlabel()),
        'ylabel': _text(ax.get_ylabel()),
        'legend': [_text(t.get_text()) for t in legend.get_texts()] if legend else None,
        'texts': [_text(t.get_text()) for t in ax.texts if _text(t.get_text())],
        'yinverted': bool(ax.yaxis_inverted()),
        'xscale': ax.get_xscale(),
        'yscale': ax.get_yscale(),
        'series': series,
        'shapes': shapes,
    }


def describe_matplotlib(fig):
    axes = [ax for ax in fig.axes if ax.get_label() != '<colorbar>']
    suptitle = getattr(fig, '_suptitle', None)
    return {
        'kind': 'matplotlib',
        'suptitle': _text(suptitle.get_text()) if suptitle is not None else '',
        'axes': [describe_axes(ax) for ax in axes],
        '_figure': fig,
    }


# ── plotly ─────────────────────────────────────────────────────────────────


def _plotly_mode(trace):
    mode = getattr(trace, 'mode', None)
    if mode is None:
        if getattr(trace, 'type', '') != 'scatter':
            return None
        n = len(trace.y) if getattr(trace, 'y', None) is not None else 0
        mode = 'lines+markers' if n < 20 else 'lines'
    parts = set(mode.split('+')) & {'lines', 'markers', 'text'}
    return '+'.join(sorted(parts)) or mode


def describe_plotly(fig):
    traces = []
    for trace in fig.data:
        kind = trace.type
        x = getattr(trace, 'x', None)
        y = getattr(trace, 'y', None)
        traces.append({
            'kind': kind,
            'label': _text(getattr(trace, 'name', '') or ''),
            'x': _values(x) if x is not None else [],
            'y': _values(y) if y is not None else [],
            'mode': _plotly_mode(trace),
            'horizontal': getattr(trace, 'orientation', None) == 'h',
            'colours': [],
        })
    layout = fig.layout

    def title(obj):
        t = getattr(obj, 'title', None)
        return _text(getattr(t, 'text', None) or '') if t is not None else ''

    return {
        'kind': 'plotly',
        'title': title(layout),
        'xlabel': title(layout.xaxis),
        'ylabel': title(layout.yaxis),
        'series': traces,
        '_figure': fig,
    }


# ── words ──────────────────────────────────────────────────────────────────

_KIND_WORDS = {
    'line': ('line', 'lines'),
    'bars': ('set of bars', 'sets of bars'),
    'points': ('set of scatter points', 'sets of scatter points'),
    'heatmap': ('heatmap', 'heatmaps'),
    'area': ('shaded area', 'shaded areas'),
    'scatter': ('scatter/line trace', 'scatter/line traces'),
    'bar': ('bar trace', 'bar traces'),
    'histogram': ('histogram trace', 'histogram traces'),
    'box': ('box trace', 'box traces'),
    'pie': ('pie trace', 'pie traces'),
}

_SHAPE_WORDS = {
    'PathPatch': 'box', 'Rectangle': 'rectangle', 'Wedge': 'pie slice',
    'Polygon': 'polygon', 'Circle': 'circle', 'Ellipse': 'ellipse',
}


def _count(n, kind):
    one, many = _KIND_WORDS.get(kind, (kind, kind + 's'))
    return '%d %s' % (n, one if n == 1 else many)


def _quote(s):
    return "'%s'" % s if s else 'nothing'


def _show(v):
    if isinstance(v, float):
        if v == int(v) and abs(v) < 1e15:
            return str(int(v))
        return ('%.4g' % v) if abs(v) < 1e-3 or abs(v) >= 1e6 else str(round(v, 4))
    if v is None:
        return 'nothing'
    return "'%s'" % v if isinstance(v, str) else str(v)


def _axes_name(where, count):
    if where is None or count == 1 or where[:2] == (1, 1):
        return 'the chart'
    rows, cols, start = where
    if rows == 1:
        return 'chart %d (of %d side by side)' % (start + 1, cols)
    if cols == 1:
        return 'chart %d (of %d stacked)' % (start + 1, rows)
    return 'the chart in row %d, column %d' % (start // cols + 1, start % cols + 1)


def _series_name(s, i, kind_count):
    one = _KIND_WORDS.get(s['kind'], (s['kind'],))[0]
    if s['kind'] == 'bars':
        one = 'bars' if s.get('label') else 'bar chart'
    if s.get('label'):
        return "the %s '%s'" % (one, s['label'])
    if kind_count == 1:
        return 'the %s' % one
    return '%s %d' % (one, i + 1)


# ── comparing ──────────────────────────────────────────────────────────────


def _same_text(a, b):
    return _text(a).casefold() == _text(b).casefold()


def _same_value(a, b):
    if isinstance(a, float) and isinstance(b, float):
        return math.isclose(a, b, rel_tol=1e-6, abs_tol=1e-6)
    if isinstance(a, str) and isinstance(b, str):
        return _same_text(a, b)
    return a == b


def _first_difference(expected, actual):
    for i, (e, a) in enumerate(zip(expected, actual)):
        if not _same_value(e, a):
            return i
    return None


class _Diffs(list):
    def add(self, message):
        if message not in self:
            self.append(message)


def _compare_values(diffs, what, axis_word, point_word, expected, actual, names=None):
    if len(expected) != len(actual):
        diffs.add('%s should have %d %s; yours has %d.' % (what, len(expected), point_word, len(actual)))
        return
    i = _first_difference(expected, actual)
    if i is None:
        return
    at = (' for %s' % _show(names[i])) if names and i < len(names) else (' at %s %d' % (point_word.rstrip('s'), i + 1))
    diffs.add('%s: the %s%s should be %s; yours is %s.' % (
        what[0].upper() + what[1:], axis_word, at, _show(expected[i]), _show(actual[i])))


def _match_series(expected, actual):
    """Pairs of series of one kind: by label when every series has a distinct one, else in order."""
    labels_e = [s.get('label') for s in expected]
    labels_a = [s.get('label') for s in actual]
    if all(labels_e) and all(labels_a) and len(set(labels_e)) == len(labels_e) \
            and sorted(l.casefold() for l in labels_e) == sorted(l.casefold() for l in labels_a):
        by_label = {s['label'].casefold(): s for s in actual}
        return [(e, by_label[e['label'].casefold()]) for e in expected]
    return list(zip(expected, actual))


def _kinds(series):
    kinds = []
    for s in series:
        if s['kind'] not in kinds:
            kinds.append(s['kind'])
    return kinds


def _drawn(series):
    kinds = _kinds(series)
    if not kinds:
        return 'nothing'
    return ' and '.join(_count(sum(1 for s in series if s['kind'] == k), k) for k in kinds)


def _compare_series(diffs, where, expected, actual, options):
    cap = where[0].upper() + where[1:]
    if expected and not set(_kinds(expected)) & set(_kinds(actual)):
        # A different kind of chart altogether: say so once.
        diffs.add('%s should show %s; yours shows %s.' % (cap, _drawn(expected), _drawn(actual)))
        return
    for kind in _kinds(expected + actual):
        es = [s for s in expected if s['kind'] == kind]
        acts = [s for s in actual if s['kind'] == kind]
        if len(es) != len(acts):
            if not es:
                diffs.add('%s should not have any %s; yours has %d.' % (
                    cap, _KIND_WORDS.get(kind, (kind, kind + 's'))[1], len(acts)))
            else:
                diffs.add('%s should have %s; yours has %d.' % (cap, _count(len(es), kind), len(acts)))
            continue
        for i, (e, a) in enumerate(_match_series(es, acts)):
            name = _series_name(e, i, len(es))
            full = '%s on %s' % (name, where) if where != 'the chart' else name
            if e.get('label') and not _same_text(e['label'], a.get('label')):
                diffs.add('%s should be labelled %s; yours is labelled %s.' % (
                    full[0].upper() + full[1:], _quote(e['label']), _quote(a.get('label'))))
            if kind == 'bars':
                if e.get('horizontal') != a.get('horizontal'):
                    diffs.add('%s should be %s; yours are %s.' % (
                        full[0].upper() + full[1:],
                        'horizontal (barh)' if e['horizontal'] else 'vertical (bar)',
                        'horizontal' if a['horizontal'] else 'vertical'))
                    continue
                if len(e['x']) != len(a['x']):
                    diffs.add('%s should have %d bars; yours has %d.' % (
                        full[0].upper() + full[1:], len(e['x']), len(a['x'])))
                    continue
                if _first_difference(e['x'], a['x']) is not None:
                    if all(isinstance(v, str) for v in e['x']):
                        diffs.add('%s should be for %s; yours are for %s.' % (
                            full[0].upper() + full[1:],
                            ', '.join(e['x']), ', '.join(_show(v).strip("'") for v in a['x'])))
                    else:
                        _compare_values(diffs, full, 'position', 'bars', e['x'], a['x'])
                    continue
                _compare_values(diffs, full, 'bar', 'bars', e['y'], a['y'],
                                names=e['x'] if all(isinstance(v, str) for v in e['x']) else None)
            elif kind == 'area':
                if e['y'] != a['y']:
                    diffs.add('%s should have %d shaded areas; yours has %d.' % (
                        where[0].upper() + where[1:], e['y'][0], a['y'][0]))
            elif kind == 'heatmap':
                _compare_values(diffs, full, 'value', 'squares', e['y'], a['y'])
            else:
                if e.get('horizontal') != a.get('horizontal'):
                    diffs.add('%s should be %s.' % (full[0].upper() + full[1:],
                                                    'horizontal' if e['horizontal'] else 'vertical'))
                    continue
                if e.get('mode') and a.get('mode') and e['mode'] != a['mode']:
                    diffs.add('%s should be drawn as %s; yours is %s.' % (
                        full[0].upper() + full[1:], e['mode'], a['mode']))
                if len(e['x']) != len(a['x']) or len(e['y']) != len(a['y']):
                    diffs.add('%s should have %d points; yours has %d.' % (
                        full[0].upper() + full[1:], len(e['y']), len(a['y'])))
                    continue
                _compare_values(diffs, full, 'x value', 'points', e['x'], a['x'])
                _compare_values(diffs, full, 'y value', 'points', e['y'], a['y'], names=e['x']
                                if e['x'] and all(isinstance(v, str) for v in e['x']) else None)
                if 'markers' in e and e['markers'] != a.get('markers'):
                    diffs.add('%s should %s markers at its points.' % (
                        full[0].upper() + full[1:], 'have' if e['markers'] else 'not have'))
                if 'linestyle' in e and e['linestyle'] != a.get('linestyle'):
                    diffs.add('%s should be %s; yours is %s.' % (
                        full[0].upper() + full[1:], e['linestyle'], a.get('linestyle')))
            if options.get('colours') and e.get('colours') and a.get('colours') is not None:
                if [c.lower() for c in e['colours']] != [c.lower() for c in a['colours']]:
                    diffs.add('%s is not coloured as asked: it should be %s; yours is %s.' % (
                        full[0].upper() + full[1:], ', '.join(e['colours']), ', '.join(a['colours'])))


def _compare_labels(diffs, where, expected, actual):
    cap = where[0].upper() + where[1:]
    for key, word in (('title', 'title'), ('xlabel', 'x-axis label'), ('ylabel', 'y-axis label')):
        if not _same_text(expected.get(key), actual.get(key)):
            if expected.get(key):
                diffs.add('%s should have the %s %s; yours has %s.' % (
                    cap, word, _quote(expected[key]), _quote(actual.get(key))))
            else:
                diffs.add('%s should have no %s; yours has %s.' % (cap, word, _quote(actual.get(key))))


def _compare_axes(diffs, where, e, a, options):
    cap = where[0].upper() + where[1:]
    _compare_labels(diffs, where, e, a)
    _compare_series(diffs, where, e['series'], a['series'], options)
    if (e['legend'] is None) != (a['legend'] is None):
        diffs.add('%s should %s a legend.' % (cap, 'have' if e['legend'] is not None else 'not have'))
    elif e['legend'] is not None and \
            sorted(l.casefold() for l in e['legend']) != sorted(l.casefold() for l in a['legend']):
        diffs.add("%s's legend should list %s; yours lists %s." % (
            cap, ', '.join(e['legend']) or 'nothing', ', '.join(a['legend']) or 'nothing'))
    if sorted(t.casefold() for t in e['texts']) != sorted(t.casefold() for t in a['texts']):
        if len(e['texts']) != len(a['texts']):
            diffs.add('%s should have %d piece%s of text written on it; yours has %d.' % (
                cap, len(e['texts']), '' if len(e['texts']) == 1 else 's', len(a['texts'])))
        else:
            missing = [t for t in e['texts'] if t.casefold() not in {x.casefold() for x in a['texts']}]
            diffs.add('%s should have the text %s written on it.' % (cap, _quote(missing[0]) if missing else ''))
    if e['yinverted'] != a['yinverted']:
        diffs.add('%s should have its y axis %s.' % (cap, 'flipped (invert_yaxis)' if e['yinverted'] else 'the usual way up'))
    for key, axis in (('xscale', 'x'), ('yscale', 'y')):
        if e[key] != a[key]:
            diffs.add('%s should have a %s %s axis; yours is %s.' % (cap, e[key], axis, a[key]))
    if e['shapes'] != a['shapes']:
        for name in sorted(set(e['shapes']) | set(a['shapes'])):
            ne, na = e['shapes'].get(name, 0), a['shapes'].get(name, 0)
            if ne != na:
                word = _SHAPE_WORDS.get(name, name)
                diffs.add('%s should have %d %s%s; yours has %d.' % (cap, ne, word, '' if ne == 1 else 'es' if word.endswith('x') else 's', na))


def _compare_matplotlib(diffs, prefix, e, a, options):
    if not _same_text(e['suptitle'], a['suptitle']):
        diffs.add('%sThe figure should have the overall title (suptitle) %s; yours has %s.' % (
            prefix, _quote(e['suptitle']), _quote(a['suptitle'])))
    ew = [ax['where'] for ax in e['axes']]
    aw = [ax['where'] for ax in a['axes']]
    if len(e['axes']) != len(a['axes']) or (all(ew) and all(aw) and ew[0][:2] != aw[0][:2]):
        def grid(axes):
            w = axes[0]['where'] if axes else None
            if not axes:
                return 'no charts'
            if w and w[:2] != (1, 1):
                return '%d row%s and %d column%s of charts' % (w[0], '' if w[0] == 1 else 's', w[1], '' if w[1] == 1 else 's')
            return '%d chart%s' % (len(axes), '' if len(axes) == 1 else 's')
        diffs.add('%sThe figure should hold %s; yours holds %s.' % (prefix, grid(e['axes']), grid(a['axes'])))
        return
    pairs = list(zip(e['axes'], a['axes']))
    if all(ew) and all(aw):
        by_where = {ax['where']: ax for ax in a['axes']}
        pairs = [(ax, by_where.get(ax['where'])) for ax in e['axes']]
    for ex, ac in pairs:
        where = _axes_name(ex['where'], len(e['axes']))
        if ac is None:
            diffs.add('%s%s is missing.' % (prefix, where[0].upper() + where[1:]))
            continue
        before = len(diffs)
        _compare_axes(diffs, where, ex, ac, options)
        if prefix:
            for i in range(before, len(diffs)):
                diffs[i] = prefix + diffs[i]


def _compare_plotly(diffs, prefix, e, a, options):
    before = len(diffs)
    _compare_labels(diffs, 'the chart', e, a)
    _compare_series(diffs, 'the chart', e['series'], a['series'], options)
    if prefix:
        for i in range(before, len(diffs)):
            diffs[i] = prefix + diffs[i]


_LIB_WORDS = {'matplotlib': 'a matplotlib/seaborn chart (plt.show())', 'plotly': 'a plotly chart (fig.show())'}


def differences(expected, actual, options=None):
    """What differs between two programs' charts, in words, most important first."""
    options = options or {}
    diffs = _Diffs()
    expected = [c for c in expected if c.get('kind') != 'unreadable']
    for c in actual:
        if c.get('kind') == 'unreadable':
            diffs.add('Your chart could not be read: %s' % c.get('error'))
    actual = [c for c in actual if c.get('kind') != 'unreadable']
    if not actual and expected:
        diffs.add('Your program did not draw a chart. Build it, then call %s.' % (
            'fig.show()' if expected[0]['kind'] == 'plotly' else 'plt.show()'))
        return list(diffs)
    if len(expected) != len(actual):
        diffs.add('Your program should draw %d chart%s (one per plt.show() or fig.show()); it draws %d.' % (
            len(expected), '' if len(expected) == 1 else 's', len(actual)))
        return list(diffs)
    for n, (e, a) in enumerate(zip(expected, actual)):
        prefix = ('Figure %d: ' % (n + 1)) if len(expected) > 1 else ''
        if e['kind'] != a['kind']:
            diffs.add('%sThis should be %s; yours is %s.' % (prefix, _LIB_WORDS[e['kind']], _LIB_WORDS[a['kind']]))
        elif e['kind'] == 'matplotlib':
            _compare_matplotlib(diffs, prefix, e, a, options)
        else:
            _compare_plotly(diffs, prefix, e, a, options)
    return list(diffs)


def picture(chart, dpi=60):
    """A small PNG of a matplotlib chart, as a data URL ('' for anything else)."""
    fig = chart.get('_figure') if isinstance(chart, dict) else None
    if fig is None or chart.get('kind') != 'matplotlib':
        return ''
    buf = io.BytesIO()
    try:
        fig.savefig(buf, format='png', dpi=dpi, bbox_inches='tight', facecolor='white')
    except Exception:
        return ''
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')


def compare(expected, actual, options=None):
    """The verdict for the page: {passed, message, differences, expected?, actual?} as JSON."""
    diffs = differences(expected, actual, options)
    result = {'passed': not diffs, 'differences': diffs[:_MAX_DIFFERENCES]}
    if diffs:
        extra = len(diffs) - _MAX_DIFFERENCES
        result['message'] = diffs[0] if len(diffs) == 1 else '%d differences from the expected chart.' % len(diffs)
        if extra > 0:
            result['differences'].append('...and %d more.' % extra)
        if expected:
            result['expected'] = picture(expected[0])
        if actual:
            result['actual'] = picture(actual[0])
    else:
        result['message'] = 'Same chart as expected.'
    return json.dumps(result)


def preview(charts):
    """What a guide's ![preview](chartpreview) shows: the first chart, as a PNG or plotly HTML."""
    for chart in charts:
        if chart.get('kind') == 'matplotlib':
            return json.dumps({'png': picture(chart, dpi=80)})
        if chart.get('kind') == 'plotly':
            fig = chart['_figure']
            return json.dumps({'html': fig.to_html(include_plotlyjs='cdn', full_html=True,
                                                   default_width='100%', default_height='360px')})
    return json.dumps({})
