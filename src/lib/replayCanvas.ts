/**
 * Drawing the win-probability replay onto a 2D canvas.
 *
 * Every function here is pure: a context, a size, and a cursor position go in;
 * pixels come out. Nothing reads the clock, React state, or the DOM beyond the
 * canvas it is handed. That is deliberate — a frame is fully determined by the
 * play cursor, so the same code renders the running animation, a paused frame,
 * and any position a scrubber is later dragged to.
 *
 * All coordinates below are CSS pixels. `resizeCanvas` folds the device-pixel
 * ratio into the context transform once per resize, so no drawing code has to
 * think about it.
 */

import { withAlpha } from '@/lib/colors'
import type { ChartPoint } from '@/lib/winprob'

/** Room around the plot for the axis labels, in CSS pixels. */
const PAD = { top: 12, right: 14, bottom: 24, left: 40 }

/**
 * Retina is worth paying for; a 3x phone screen is not. Backing-store pixels
 * grow with the square of this number, and the third multiple buys nothing the
 * eye can resolve on a two-pixel line.
 */
const MAX_DPR = 2

const COLOR = {
  grid: '#262626', // neutral-800
  even: '#525252', // neutral-600 — the 50% line
  label: '#737373', // neutral-500
  cursorLine: '#404040', // neutral-700
  surface: '#0a0a0a', // the page behind the card, used as the cursor dot's ring
}

const Y_TICKS = [0, 0.25, 0.5, 0.75, 1]
const LABEL_FONT = '11px ui-sans-serif, system-ui, sans-serif'

export interface Size {
  width: number
  height: number
}

/** The rectangle the curve lives inside, inset from the canvas by PAD. */
export interface Plot {
  x: number
  y: number
  width: number
  height: number
}

export function plotArea(size: Size): Plot {
  return {
    x: PAD.left,
    y: PAD.top,
    width: Math.max(1, size.width - PAD.left - PAD.right),
    height: Math.max(1, size.height - PAD.top - PAD.bottom),
  }
}

/**
 * Play index -> x. The axis is play order rather than elapsed time: several
 * plays legitimately share one timestamp (a kickoff and the snap after it are
 * both logged at 15:00), so time collides points that play order separates.
 * See `quarterBoundaries` in lib/winprob.ts.
 */
export function xForIndex(index: number, lastIndex: number, plot: Plot): number {
  if (lastIndex <= 0) return plot.x + plot.width / 2
  return plot.x + (index / lastIndex) * plot.width
}

/** Probability 0..1 -> y, with 1 at the top. Clamped, so bad data cannot draw off-canvas. */
export function yForProb(prob: number, plot: Plot): number {
  const clamped = Math.min(1, Math.max(0, prob))
  return plot.y + (1 - clamped) * plot.height
}

/**
 * Home win probability at a fractional play position.
 *
 * The cursor advances continuously while plays are discrete, so the tip of the
 * revealed line is interpolated between the play it has passed and the one it
 * is heading for. Without this the line would grow in visible steps.
 */
export function probAt(points: ChartPoint[], cursor: number): number {
  if (points.length === 0) return 0.5
  const lastIndex = points.length - 1
  const at = Math.min(lastIndex, Math.max(0, cursor))
  const whole = Math.floor(at)
  const here = points[whole].homeWinProb
  if (whole >= lastIndex) return here
  return here + (points[whole + 1].homeWinProb - here) * (at - whole)
}

/** A whole-pixel coordinate for a 1px line, so it lands on one pixel instead of straddling two. */
function crisp(value: number): number {
  return Math.round(value) + 0.5
}

/**
 * Match the backing store to the element's rendered size and the display's
 * pixel ratio, then scale the context so callers keep working in CSS pixels.
 *
 * Returns the CSS size, which is what every other function here expects.
 * Assigning to `canvas.width` clears the canvas, so it is guarded: this runs on
 * every frame and an unguarded assignment would wipe the drawing each time.
 */
export function resizeCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Size {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
  const rect = canvas.getBoundingClientRect()
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  const backingWidth = Math.round(width * dpr)
  const backingHeight = Math.round(height * dpr)

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth
    canvas.height = backingHeight
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { width, height }
}

/** Grid, percentage labels, the even-odds line, and the quarter dividers. */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  plot: Plot,
  marks: { at: number; label: string }[],
  lastIndex: number,
): void {
  ctx.save()
  ctx.font = LABEL_FONT
  ctx.lineWidth = 1

  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (const tick of Y_TICKS) {
    const y = crisp(yForProb(tick, plot))
    const even = tick === 0.5
    ctx.beginPath()
    ctx.moveTo(plot.x, y)
    ctx.lineTo(plot.x + plot.width, y)
    ctx.setLineDash(even ? [3, 3] : [])
    ctx.strokeStyle = even ? COLOR.even : COLOR.grid
    ctx.stroke()
    ctx.fillStyle = COLOR.label
    ctx.fillText(`${Math.round(tick * 100)}%`, plot.x - 6, y)
  }
  ctx.setLineDash([])

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  marks.forEach((mark, i) => {
    const x = crisp(xForIndex(mark.at, lastIndex, plot))
    // The first mark sits on the y axis, which is already a line.
    if (i > 0) {
      ctx.beginPath()
      ctx.moveTo(x, plot.y)
      ctx.lineTo(x, plot.y + plot.height)
      ctx.strokeStyle = COLOR.grid
      ctx.stroke()
    }
    ctx.fillStyle = COLOR.label
    ctx.fillText(mark.label, x, plot.y + plot.height + 7)
  })

  ctx.restore()
}

/** Trace the revealed part of the curve, ending at the interpolated cursor. */
function tracePath(
  ctx: CanvasRenderingContext2D,
  points: ChartPoint[],
  cursor: number,
  lastIndex: number,
  plot: Plot,
): void {
  const whole = Math.floor(cursor)
  ctx.beginPath()
  ctx.moveTo(xForIndex(0, lastIndex, plot), yForProb(points[0].homeWinProb, plot))
  for (let i = 1; i <= whole; i++) {
    ctx.lineTo(xForIndex(i, lastIndex, plot), yForProb(points[i].homeWinProb, plot))
  }
  if (cursor > whole) {
    ctx.lineTo(xForIndex(cursor, lastIndex, plot), yForProb(probAt(points, cursor), plot))
  }
}

/** The completed line segment, over a fill that fades toward the floor. */
function drawCurve(
  ctx: CanvasRenderingContext2D,
  points: ChartPoint[],
  cursor: number,
  lastIndex: number,
  plot: Plot,
  color: string,
): void {
  ctx.save()

  const fill = ctx.createLinearGradient(0, plot.y, 0, plot.y + plot.height)
  fill.addColorStop(0, withAlpha(color, 0.22))
  fill.addColorStop(1, withAlpha(color, 0))
  tracePath(ctx, points, cursor, lastIndex, plot)
  ctx.lineTo(xForIndex(cursor, lastIndex, plot), plot.y + plot.height)
  ctx.lineTo(xForIndex(0, lastIndex, plot), plot.y + plot.height)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()

  tracePath(ctx, points, cursor, lastIndex, plot)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()

  ctx.restore()
}

/** Where the replay currently is: a dropped vertical line and a dot on the curve. */
function drawCursor(
  ctx: CanvasRenderingContext2D,
  cursor: number,
  prob: number,
  lastIndex: number,
  plot: Plot,
  color: string,
): void {
  const x = xForIndex(cursor, lastIndex, plot)
  const y = yForProb(prob, plot)

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(crisp(x), plot.y)
  ctx.lineTo(crisp(x), plot.y + plot.height)
  ctx.strokeStyle = COLOR.cursorLine
  ctx.lineWidth = 1
  ctx.stroke()

  // Ringed in the surface color so the dot stays legible where the line
  // doubles back over itself.
  ctx.beginPath()
  ctx.arc(x, y, 4.5, 0, Math.PI * 2)
  ctx.fillStyle = COLOR.surface
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y, 3.5, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()
}

export interface FrameOptions {
  points: ChartPoint[]
  marks: { at: number; label: string }[]
  /** Fractional play index revealed so far, 0..points.length - 1. */
  cursor: number
  /** The home team's accent, already checked for contrast by `accentOn`. */
  color: string
  size: Size
}

/** One complete frame. Clears first, so it is safe to call at any cursor in any order. */
export function drawFrame(ctx: CanvasRenderingContext2D, options: FrameOptions): void {
  const { points, marks, color, size } = options
  const plot = plotArea(size)
  const lastIndex = Math.max(0, points.length - 1)
  const cursor = Math.min(lastIndex, Math.max(0, options.cursor))

  ctx.clearRect(0, 0, size.width, size.height)
  drawBackground(ctx, plot, marks, lastIndex)
  if (points.length === 0) return
  drawCurve(ctx, points, cursor, lastIndex, plot, color)
  drawCursor(ctx, cursor, probAt(points, cursor), lastIndex, plot, color)
}
