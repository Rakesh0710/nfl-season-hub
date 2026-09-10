/**
 * The drawing module, tested without a real canvas.
 *
 * Every function here is pure — a context, a size and a cursor go in, pixels
 * come out — so a recording context is enough to assert what would have been
 * drawn. jsdom implements no 2D context at all, which is the other reason.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  applyCanvasSize,
  CARD_SURFACE,
  drawFrame,
  indexAtOffset,
  PLOT_PADDING,
  plotArea,
  probAt,
  xForIndex,
  yForProb,
  type Size,
} from '@/lib/replayCanvas'
import { toChartPoints } from '@/lib/winprob'
import { makeGame, makePlay } from '@/test/fixtures'

type Call = { method: string; args: number[] }

/** A stand-in context that records the geometry it is asked to draw. */
function recordingContext() {
  const calls: Call[] = []
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args: args.filter((a): a is number => typeof a === 'number') })
    }
  const ctx = {
    calls,
    save: record('save'),
    restore: record('restore'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    fill: record('fill'),
    stroke: record('stroke'),
    fillText: record('fillText'),
    clearRect: record('clearRect'),
    setLineDash: record('setLineDash'),
    setTransform: record('setTransform'),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'round',
    lineCap: 'round',
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
  }
  return ctx as unknown as CanvasRenderingContext2D & { calls: Call[] }
}

const size: Size = { width: 640, height: 320 }
const plot = plotArea(size)

describe('plotArea', () => {
  it('insets the plot by the axis padding', () => {
    expect(plot).toEqual({
      x: PLOT_PADDING.left,
      y: PLOT_PADDING.top,
      width: 640 - PLOT_PADDING.left - PLOT_PADDING.right,
      height: 320 - PLOT_PADDING.top - PLOT_PADDING.bottom,
    })
  })

  it('never collapses to a negative rectangle on a tiny canvas', () => {
    const tiny = plotArea({ width: 10, height: 10 })
    expect(tiny.width).toBeGreaterThan(0)
    expect(tiny.height).toBeGreaterThan(0)
  })
})

describe('xForIndex', () => {
  it('puts the first play on the left edge and the last on the right', () => {
    expect(xForIndex(0, 100, plot)).toBe(plot.x)
    expect(xForIndex(100, 100, plot)).toBe(plot.x + plot.width)
  })

  it('centres a one-play game rather than dividing by zero', () => {
    expect(xForIndex(0, 0, plot)).toBe(plot.x + plot.width / 2)
  })

  it('is monotonic in the play index', () => {
    let previous = -Infinity
    for (let i = 0; i <= 200; i++) {
      const x = xForIndex(i, 200, plot)
      expect(x).toBeGreaterThan(previous)
      previous = x
    }
  })
})

describe('yForProb', () => {
  it('puts certainty at the top and zero at the bottom', () => {
    expect(yForProb(1, plot)).toBe(plot.y)
    expect(yForProb(0, plot)).toBe(plot.y + plot.height)
    expect(yForProb(0.5, plot)).toBe(plot.y + plot.height / 2)
  })

  it('clamps bad data inside the plot instead of drawing off-canvas', () => {
    expect(yForProb(-3, plot)).toBe(plot.y + plot.height)
    expect(yForProb(42, plot)).toBe(plot.y)
  })
})

describe('probAt', () => {
  const points = toChartPoints(
    makeGame({
      plays: [
        makePlay({ homeWinProb: 0.4 }),
        makePlay({ homeWinProb: 0.6 }),
        makePlay({ homeWinProb: 0.9 }),
      ],
    }),
  )

  it('returns the exact value on a whole play', () => {
    expect(probAt(points, 0)).toBe(0.4)
    expect(probAt(points, 2)).toBe(0.9)
  })

  it('interpolates between plays, so the line grows smoothly', () => {
    expect(probAt(points, 0.5)).toBeCloseTo(0.5)
    expect(probAt(points, 1.25)).toBeCloseTo(0.675)
  })

  it('clamps a cursor outside the series', () => {
    expect(probAt(points, -5)).toBe(0.4)
    expect(probAt(points, 99)).toBe(0.9)
  })

  it('gives even odds for an empty series', () => {
    expect(probAt([], 3)).toBe(0.5)
  })

  it('reads a non-finite cursor as the opening kickoff rather than returning NaN', () => {
    // NaN survives Math.min/Math.max, and a NaN coordinate makes the canvas
    // skip the path without error — the curve would vanish instead of pausing.
    expect(probAt(points, Number.NaN)).toBe(0.4)
    expect(probAt(points, Infinity)).toBe(0.4)
  })
})

describe('indexAtOffset', () => {
  it('inverts xForIndex for every play, at several canvas widths', () => {
    for (const width of [320, 640, 1024]) {
      const at: Size = { width, height: 320 }
      const area = plotArea(at)
      const lastIndex = 173
      for (let i = 0; i <= lastIndex; i++) {
        expect(indexAtOffset(xForIndex(i, lastIndex, area), lastIndex, at)).toBe(i)
      }
    }
  })

  it('returns null outside the plot', () => {
    expect(indexAtOffset(-40, 100, size)).toBeNull()
    expect(indexAtOffset(size.width + 40, 100, size)).toBeNull()
  })

  it('tolerates a pointer a hair past either end, which rounding puts there', () => {
    expect(indexAtOffset(plot.x - 1, 100, size)).toBe(0)
    expect(indexAtOffset(plot.x + plot.width + 1, 100, size)).toBe(100)
  })

  it('has nothing to point at in a one-play game', () => {
    expect(indexAtOffset(100, 0, size)).toBeNull()
  })
})

describe('applyCanvasSize', () => {
  it('caps the backing store at 2x, so a 3x phone does not pay for pixels it cannot show', () => {
    const canvas = document.createElement('canvas')
    const ctx = recordingContext()
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)

    applyCanvasSize(canvas, ctx, size)

    expect(canvas.width).toBe(1280)
    expect(canvas.height).toBe(640)
    expect(ctx.calls.filter((c) => c.method === 'setTransform')[0]?.args).toEqual([
      2, 0, 0, 2, 0, 0,
    ])
    vi.restoreAllMocks()
  })

  it('does not touch canvas.width when the size is unchanged, which would clear the frame', () => {
    const canvas = document.createElement('canvas')
    const ctx = recordingContext()
    applyCanvasSize(canvas, ctx, size)

    let writes = 0
    let stored = canvas.width
    Object.defineProperty(canvas, 'width', {
      get: () => stored,
      set: (value: number) => {
        writes++
        stored = value
      },
    })

    applyCanvasSize(canvas, ctx, size)
    expect(writes).toBe(0)

    applyCanvasSize(canvas, ctx, { width: 800, height: 320 })
    expect(writes).toBe(1)
  })
})

describe('drawFrame', () => {
  const game = makeGame()
  const points = toChartPoints(game)
  const options = {
    points,
    marks: [{ at: 0, label: 'Q1' }],
    keyIndices: [2, 3, 4],
    hover: null,
    color: '#E31837',
    size,
  }

  it('clears before drawing, so any cursor can be rendered in any order', () => {
    const ctx = recordingContext()
    drawFrame(ctx, { ...options, cursor: 3 })
    expect(ctx.calls[0]?.method).toBe('clearRect')
  })

  it('reveals only the plays the cursor has reached', () => {
    const early = recordingContext()
    const late = recordingContext()
    drawFrame(early, { ...options, cursor: 1 })
    drawFrame(late, { ...options, cursor: 5 })

    const lines = (ctx: typeof early) => ctx.calls.filter((c) => c.method === 'lineTo').length
    expect(lines(early)).toBeLessThan(lines(late))
  })

  it('draws a key-play bead only once the cursor has passed it', () => {
    // Beads are arcs of radius 3; the cursor dot is 4.5 and 3.5.
    const beads = (cursor: number) => {
      const ctx = recordingContext()
      drawFrame(ctx, { ...options, cursor })
      return ctx.calls.filter((c) => c.method === 'arc' && c.args[2] === 3).length
    }
    expect(beads(1)).toBe(0)
    expect(beads(2)).toBe(1)
    expect(beads(5)).toBe(3)
  })

  it('keeps everything it draws inside the canvas', () => {
    const ctx = recordingContext()
    drawFrame(ctx, { ...options, cursor: 4.3, hover: 2 })
    for (const call of ctx.calls) {
      if (call.method !== 'moveTo' && call.method !== 'lineTo' && call.method !== 'arc') continue
      const [x, y] = call.args
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(size.width)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(size.height)
    }
  })

  it('still draws the axes for a game with no plays, rather than throwing', () => {
    const ctx = recordingContext()
    expect(() =>
      drawFrame(ctx, { ...options, points: [], keyIndices: [], cursor: 0 }),
    ).not.toThrow()
    expect(ctx.calls.some((c) => c.method === 'fillText')).toBe(true)
  })

  it('draws a real frame for a non-finite cursor instead of a blank canvas', () => {
    const ctx = recordingContext()
    drawFrame(ctx, { ...options, cursor: Number.NaN })
    const coordinates = ctx.calls
      .filter((c) => c.method === 'moveTo' || c.method === 'lineTo' || c.method === 'arc')
      .flatMap((c) => c.args)
    expect(coordinates.length).toBeGreaterThan(0)
    expect(coordinates.every((n) => Number.isFinite(n))).toBe(true)
  })

  it('ignores a hover index outside the series', () => {
    const withHover = recordingContext()
    const without = recordingContext()
    drawFrame(withHover, { ...options, cursor: 5, hover: 999 })
    drawFrame(without, { ...options, cursor: 5, hover: null })
    expect(withHover.calls.length).toBe(without.calls.length)
  })

  it('punches the cursor dot in the card colour, not the page colour', () => {
    // Measuring the curve against the page rather than the card is the exact
    // mistake that left three teams under 3:1 in Stage 5.
    expect(CARD_SURFACE).toBe('#0f0f0f')
  })
})
