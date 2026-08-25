import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  STDCTX_CANVAS_HEIGHT,
  STDCTX_CANVAS_WIDTH,
  STDCTX_WORKER_BOOTSTRAP,
  clearStdctxImageCache,
  keyToVirtualKeyCode,
  processAudioCommand,
  processCanvasCommand,
  type StdctxCommand,
} from './stdctx'
import { codeUsesSpongeLibs, codeUsesStdaud, codeUsesStdctx } from './codeAnalysis'

const pythonAvailable = spawnSync('python', ['--version'], { encoding: 'utf8' }).status === 0

type StdctxRun = { batches: StdctxCommand[][]; slept: number[]; audio: Array<Record<string, unknown>>; stdout: string }

/**
 * Execute the exact Python that ships to the worker, with the four JS bridge
 * callables stubbed out, and report the commands it produced.
 */
function runStdctx(userCode: string, options: { keysDown?: number[] } = {}): StdctxRun {
  if (!pythonAvailable) throw new Error('Native Python is unavailable; stdctx tests cannot run.')

  const harness = `
import json as _harness_json
_batches = []
_slept = []
_audio = []
_keys_down = set(${JSON.stringify(options.keysDown ?? [])})

def js_stdctx_send(payload):
    _batches.append(_harness_json.loads(payload))

def js_stdctx_check_key(code):
    return code in _keys_down

def js_stdctx_sleep(seconds):
    _slept.append(seconds)

def js_stdaud_send(payload):
    _audio.append(_harness_json.loads(payload))

${STDCTX_WORKER_BOOTSTRAP}

_user_error = None
try:
    exec(compile(${JSON.stringify(userCode)}, 'simulation.py', 'exec'), {'__name__': '__main__'})
except BaseException as exc:
    _user_error = f'{type(exc).__name__}: {exc}'

print('@@RESULT@@' + _harness_json.dumps({
    'batches': _batches,
    'slept': _slept,
    'audio': _audio,
    'error': _user_error,
}))
`

  const dir = mkdtempSync(join(tmpdir(), 'stdctx-'))
  const file = join(dir, 'harness.py')
  try {
    writeFileSync(file, harness, 'utf8')
    const result = spawnSync('python', [file], { encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`stdctx harness failed: ${result.stderr}`)
    const marker = result.stdout.lastIndexOf('@@RESULT@@')
    if (marker < 0) throw new Error(`stdctx harness produced no result: ${result.stdout}`)
    const parsed = JSON.parse(result.stdout.slice(marker + '@@RESULT@@'.length))
    if (parsed.error) throw new Error(`user code raised ${parsed.error}`)
    return {
      batches: parsed.batches as StdctxCommand[][],
      slept: parsed.slept as number[],
      audio: parsed.audio as Array<Record<string, unknown>>,
      stdout: result.stdout.slice(0, marker),
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const flatten = (run: StdctxRun): StdctxCommand[] => run.batches.flat()

describe.skipIf(!pythonAvailable)('stdctx worker bootstrap', () => {
  it('installs sys.stdctx with the Python Sponge canvas size', () => {
    const run = runStdctx('from sys import stdctx\nprint(stdctx.width, stdctx.height)\n')
    expect(run.stdout).toContain(`${STDCTX_CANVAS_WIDTH} ${STDCTX_CANVAS_HEIGHT}`)
  })

  it('clears the canvas before the program starts', () => {
    const run = runStdctx('import sys\n')
    expect(run.batches[0]).toEqual([{ action: 'reset', clearCanvas: true }])
  })

  it('sends each draw call immediately when single buffering', () => {
    const run = runStdctx(`
from sys import stdctx
from math import pi
stdctx.fillStyle = "red"
stdctx.beginPath()
stdctx.arc(50, 50, 10, 0, pi * 2)
stdctx.fill(clearCanvas=True)
`)
    // One batch per call: reset, fillStyle, beginPath, arc, fill.
    expect(run.batches).toHaveLength(5)
    expect(run.batches.every(batch => batch.length === 1)).toBe(true)
    expect(flatten(run).map(c => c.action)).toEqual(['reset', 'fillStyle', 'beginPath', 'arc', 'fill'])
    expect(flatten(run).find(c => c.action === 'fill')).toMatchObject({ fillRule: 'nonzero', clearCanvas: true })
  })

  it('batches draw calls between present() once double buffering is on', () => {
    const run = runStdctx(`
from sys import stdctx
stdctx.present()
stdctx.fillRect(0, 0, 10, 10)
stdctx.fillRect(5, 5, 10, 10)
stdctx.present()
`)
    const batched = run.batches[run.batches.length - 1]
    expect(batched).toHaveLength(2)
    expect(batched.every(c => c.action === 'fillRect')).toBe(true)
  })

  it('reports held keys through check_key using Windows virtual key codes', () => {
    const run = runStdctx(`
from sys import stdctx
print(stdctx.check_key(39), stdctx.check_key(37), stdctx.check_key(ord("Q")))
`, { keysDown: [39, 'Q'.charCodeAt(0)] })
    expect(run.stdout).toContain('True False True')
  })

  it('routes time.sleep through the JS bridge so the worker parks instead of spinning', () => {
    const run = runStdctx('import time\ntime.sleep(0.25)\ntime.sleep(1)\n')
    expect(run.slept).toEqual([0.25, 1])
  })

  it('resizes the canvas through resize() and through width/height', () => {
    const run = runStdctx(`
from sys import stdctx
stdctx.resize(800, 600)
print(stdctx.width, stdctx.height)
stdctx.width = 320
stdctx.height = 240
print(stdctx.width, stdctx.height)
`)
    expect(run.stdout).toContain('800 600')
    expect(run.stdout).toContain('320 240')
    expect(flatten(run).filter(c => c.action === 'resize')).toEqual([
      { action: 'resize', width: 800, height: 600 },
      { action: 'resize', width: 320, height: 600 },
      { action: 'resize', width: 320, height: 240 },
    ])
  })

  it('starts at the Python Sponge default size so an unresized program is unchanged', () => {
    const run = runStdctx('from sys import stdctx\nstdctx.fillRect(0, 0, 1, 1)\n')
    expect(flatten(run).some(c => c.action === 'resize')).toBe(false)
  })

  it('installs sys.stdaud and reports load/play in order', () => {
    const run = runStdctx(`
from sys import stdaud
stdaud.load("spooky.mp3")
stdaud.play()
`)
    expect(run.audio).toEqual([
      { action: 'load', source: 'spooky.mp3' },
      { action: 'play' },
    ])
  })

  it('records style assignments as commands and keeps them readable back', () => {
    const run = runStdctx(`
from sys import stdctx
stdctx.font = "30px Arial"
stdctx.lineWidth = 8
print(stdctx.font, stdctx.lineWidth)
`)
    expect(run.stdout).toContain('30px Arial 8')
    expect(flatten(run)).toEqual(expect.arrayContaining([
      { action: 'font', value: '30px Arial' },
      { action: 'lineWidth', value: 8 },
    ]))
  })
})

describe('codeUsesStdctx', () => {
  it('detects the Python Sponge import form', () => {
    expect(codeUsesStdctx('from sys import stdctx\n')).toBe(true)
    expect(codeUsesStdctx('import sys\nsys.stdctx.fillRect(0,0,1,1)\n')).toBe(true)
  })

  it('ignores unrelated code', () => {
    expect(codeUsesStdctx('import turtle\nturtle.forward(10)\n')).toBe(false)
    expect(codeUsesStdctx('print("stdout")\n')).toBe(false)
  })
})

describe('codeUsesStdaud / codeUsesSpongeLibs', () => {
  it('detects stdaud on its own and alongside stdctx', () => {
    expect(codeUsesStdaud('from sys import stdaud\n')).toBe(true)
    expect(codeUsesStdctx('from sys import stdaud\n')).toBe(false)
    // An audio-only program still needs the bootstrap, but no Canvas tab.
    expect(codeUsesSpongeLibs('from sys import stdaud\n')).toBe(true)
    expect(codeUsesSpongeLibs('from sys import stdctx\n')).toBe(true)
    expect(codeUsesSpongeLibs('print("hi")\n')).toBe(false)
  })
})

describe('processAudioCommand', () => {
  const makeAudio = () => {
    const calls: string[] = []
    const audio = {
      src: '',
      load: () => calls.push('load()'),
      play: () => { calls.push('play()'); return Promise.resolve() },
    } as unknown as HTMLAudioElement
    return { audio, calls }
  }

  it('loads a resolved source and plays it', () => {
    const { audio, calls } = makeAudio()
    processAudioCommand(audio, { action: 'load', source: 'spooky.mp3' }, () => 'blob:resolved')
    processAudioCommand(audio, { action: 'play' }, s => s)
    expect(audio.src).toBe('blob:resolved')
    expect(calls).toEqual(['load()', 'play()'])
  })

  it('swallows an autoplay rejection rather than failing the run', () => {
    const calls: string[] = []
    const audio = {
      src: '',
      load: () => calls.push('load()'),
      play: () => Promise.reject(new Error('NotAllowedError')),
    } as unknown as HTMLAudioElement
    expect(() => processAudioCommand(audio, { action: 'play' }, s => s)).not.toThrow()
  })
})

describe('keyToVirtualKeyCode', () => {
  it('maps arrow keys and letters the way Python Sponge did', () => {
    expect(keyToVirtualKeyCode('ArrowLeft')).toBe(37)
    expect(keyToVirtualKeyCode('ArrowRight')).toBe(39)
    expect(keyToVirtualKeyCode(' ')).toBe(32)
    expect(keyToVirtualKeyCode('q')).toBe('Q'.charCodeAt(0))
    expect(keyToVirtualKeyCode('F13')).toBeUndefined()
  })
})

describe('processCanvasCommand', () => {
  const makeContext = () => {
    const calls: string[] = []
    const canvas = { width: 500, height: 400 }
    const context = {
      canvas,
      fillStyle: '',
      lineWidth: 0,
      clearRect: (...args: number[]) => calls.push(`clearRect(${args.join(',')})`),
      fillRect: (...args: number[]) => calls.push(`fillRect(${args.join(',')})`),
      beginPath: () => calls.push('beginPath()'),
      arc: (...args: unknown[]) => calls.push(`arc(${args.join(',')})`),
      fill: (rule?: string) => calls.push(`fill(${rule})`),
      fillText: (...args: unknown[]) => calls.push(`fillText(${args.join(',')})`),
    } as unknown as CanvasRenderingContext2D
    return { context, calls, canvas }
  }

  it('replays draw commands onto the 2D context', () => {
    const { context, calls } = makeContext()
    processCanvasCommand(context, { action: 'beginPath' })
    processCanvasCommand(context, { action: 'arc', x: 1, y: 2, radius: 3, startAngle: 0, endAngle: 6, counterclockwise: false })
    processCanvasCommand(context, { action: 'fill', fillRule: 'nonzero' })
    expect(calls).toEqual(['beginPath()', 'arc(1,2,3,0,6,false)', 'fill(nonzero)'])
  })

  it('honours clearCanvas before running the command', () => {
    const { context, calls } = makeContext()
    processCanvasCommand(context, { action: 'fillRect', x: 0, y: 0, width: 4, height: 5, clearCanvas: true })
    expect(calls).toEqual(['clearRect(0,0,500,400)', 'fillRect(0,0,4,5)'])
  })

  it('omits maxWidth from fillText when the program did not pass one', () => {
    const { context, calls } = makeContext()
    processCanvasCommand(context, { action: 'fillText', text: 'hi', x: 1, y: 2, maxWidth: '' })
    expect(calls).toEqual(['fillText(hi,1,2)'])
  })

  it('applies style assignments', () => {
    const { context } = makeContext()
    processCanvasCommand(context, { action: 'fillStyle', color: '#abc' })
    processCanvasCommand(context, { action: 'lineWidth', value: 7 })
    expect(context.fillStyle).toBe('#abc')
    expect(context.lineWidth).toBe(7)
  })

  it('applies a resize to the canvas element', () => {
    const { context, canvas } = makeContext()
    processCanvasCommand(context, { action: 'resize', width: 800, height: 600 })
    expect(canvas).toMatchObject({ width: 800, height: 600 })
  })

  it('survives a malformed command without throwing', () => {
    const { context } = makeContext()
    expect(() => processCanvasCommand(context, { action: 'lineTo', x: 1, y: 2 })).not.toThrow()
    expect(() => processCanvasCommand(context, { action: 'nonsense' })).not.toThrow()
  })
})

describe('processCanvasCommand drawImage', () => {
  // jsdom's Image never loads anything, so drive onload/onerror by hand.
  class FakeImage {
    onload: (() => void) | null = null
    onerror: ((event?: Event) => void) | null = null
    src = ''
    constructor() { images.push(this) }
  }

  const images: FakeImage[] = []

  const makeContext = () => {
    const drawn: unknown[][] = []
    const context = {
      canvas: { width: 500, height: 400 },
      drawImage: (...args: unknown[]) => drawn.push(args),
    } as unknown as CanvasRenderingContext2D
    return { context, drawn }
  }

  const draw = (context: CanvasRenderingContext2D, uri: string, resolve?: (u: string) => string | Promise<string>) =>
    processCanvasCommand(context, { action: 'drawImage', imageURI: uri, dx: 0, dy: 0, dwidth: 64, dheight: 64 }, resolve)

  afterEach(() => {
    clearStdctxImageCache()
    images.length = 0
    vi.unstubAllGlobals()
  })

  const useFakeImage = () => vi.stubGlobal('Image', FakeImage)

  it('uses the URI as-is when no resolver is supplied', () => {
    useFakeImage()
    const { context } = makeContext()
    draw(context, 'https://example.com/sprite.png')
    expect(images).toHaveLength(1)
    expect(images[0].src).toBe('https://example.com/sprite.png')
  })

  it('assigns a synchronous resolver result immediately', () => {
    useFakeImage()
    const { context } = makeContext()
    draw(context, 'sprite.png', () => 'blob:mock/0')
    expect(images[0].src).toBe('blob:mock/0')
  })

  it('defers the src assignment for a promise-returning resolver', async () => {
    useFakeImage()
    const { context } = makeContext()
    draw(context, 'sprite.png', () => Promise.resolve('blob:mock/1'))
    expect(images[0].src).toBe('')
    await Promise.resolve()
    await Promise.resolve()
    expect(images[0].src).toBe('blob:mock/1')
  })

  it('caches by the original URI, so a loaded image is not resolved again', () => {
    useFakeImage()
    const { context, drawn } = makeContext()
    const resolver = vi.fn(() => 'blob:mock/2')

    draw(context, 'sprite.png', resolver)
    expect(resolver).toHaveBeenCalledTimes(1)
    images[0].onload?.()
    expect(drawn).toHaveLength(1)

    draw(context, 'sprite.png', resolver)
    expect(resolver).toHaveBeenCalledTimes(1)
    expect(images).toHaveLength(1)
    expect(drawn).toHaveLength(2)
  })

  // An animation loop calling drawImage every frame used to start a fresh
  // download per frame until the first one landed.
  it('starts only one load while an image is still in flight', () => {
    useFakeImage()
    const { context } = makeContext()
    const resolver = vi.fn(() => 'blob:mock/3')
    for (let frame = 0; frame < 30; frame++) draw(context, 'sprite.png', resolver)
    expect(images).toHaveLength(1)
    expect(resolver).toHaveBeenCalledTimes(1)
  })

  it('gives up on an image that fails to load instead of retrying every frame', () => {
    useFakeImage()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { context, drawn } = makeContext()
    const resolver = vi.fn(() => 'missing.png')

    draw(context, 'missing.png', resolver)
    images[0].onerror?.()
    for (let frame = 0; frame < 10; frame++) draw(context, 'missing.png', resolver)

    expect(images).toHaveLength(1)
    expect(resolver).toHaveBeenCalledTimes(1)
    expect(drawn).toHaveLength(0)
    expect(warn).toHaveBeenCalled()
  })

  it('tombstones an image whose resolver rejects', async () => {
    useFakeImage()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { context } = makeContext()
    const resolver = vi.fn(() => Promise.reject(new Error('nope')))

    draw(context, 'sprite.png', resolver)
    await Promise.resolve()
    await Promise.resolve()
    draw(context, 'sprite.png', resolver)
    expect(resolver).toHaveBeenCalledTimes(1)
  })

  it('reloads after the cache is cleared for a new run', () => {
    useFakeImage()
    const { context } = makeContext()
    const resolver = vi.fn(() => 'blob:mock/4')
    draw(context, 'sprite.png', resolver)
    images[0].onload?.()

    clearStdctxImageCache()
    draw(context, 'sprite.png', resolver)
    expect(resolver).toHaveBeenCalledTimes(2)
    expect(images).toHaveLength(2)
  })
})
