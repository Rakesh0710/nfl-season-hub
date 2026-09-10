/**
 * The replay clock.
 *
 * This hook owns the requestAnimationFrame loop that walks the play cursor
 * forward and repaints the canvas. The split it enforces is the point of the
 * whole stage:
 *
 *   - React owns the shell, the loaded game, the accent color, and the
 *     transport state a person can see and click.
 *   - The loop owns the cursor, the previous frame's timestamp, and the pending
 *     frame handle. All three live in refs. None of them causes a render.
 *
 * A frame therefore costs one canvas repaint and nothing else. The two facts a
 * person can actually see — whether it is running, and which play it is on —
 * are published through `useLoopValue` below, which re-renders only when the
 * value changes: once per play, not once per frame.
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useReducedMotion } from 'framer-motion'
import { drawFrame, resizeCanvas } from '@/lib/replayCanvas'
import { quarterBoundaries, toChartPoints } from '@/lib/winprob'
import type { Game } from '@/types/nfl'

/**
 * Plays revealed per second. A typical 170-play game runs a little over twenty
 * seconds at this rate — long enough to read the swings, short enough to watch
 * twice. Playback is paced by plays rather than by a fixed total duration, so a
 * long game genuinely feels long.
 */
export const PLAYS_PER_SECOND = 8

/**
 * The most time a single frame may advance the cursor, in milliseconds.
 *
 * requestAnimationFrame stops firing in a background tab, so the first frame
 * after returning can carry minutes of wall time and would otherwise jump the
 * replay straight to the final whistle. Capping the step means a hidden tab
 * simply holds its place. 100ms is six frames' worth: large enough to absorb an
 * ordinary dropped frame, small enough that nothing lurches.
 */
const MAX_FRAME_MS = 100

/**
 * A value the animation loop writes and React reads.
 *
 * The loop is an external system — it runs on the browser's frame clock, not
 * on React's — so its visible state is exposed the way React asks external
 * state to be exposed, rather than mirrored into `useState`. The write is a
 * plain assignment plus a notification: safe to call from inside a frame
 * callback, and silent when the value has not actually changed.
 */
function useLoopValue<T>(initial: T): [T, (next: T) => void] {
  const value = useRef(initial)
  const listeners = useRef(new Set<() => void>())

  const subscribe = useCallback((listener: () => void) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])

  const read = useCallback(() => value.current, [])

  const write = useCallback((next: T) => {
    if (Object.is(next, value.current)) return
    value.current = next
    for (const listener of listeners.current) listener()
  }, [])

  return [useSyncExternalStore(subscribe, read), write]
}

export interface Replay {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  playing: boolean
  /** Index of the play the cursor is on. Updated per play, never per frame. */
  playIndex: number
  lastIndex: number
  play: () => void
  pause: () => void
  toggle: () => void
  restart: () => void
}

export function useReplay(game: Game, color: string): Replay {
  const reduceMotion = useReducedMotion()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const points = useMemo(() => toChartPoints(game), [game])
  const marks = useMemo(() => quarterBoundaries(game), [game])
  const lastIndex = Math.max(0, points.length - 1)

  const [playing, setPlaying] = useLoopValue(false)
  const [playIndex, setPlayIndex] = useLoopValue(0)

  const cursor = useRef(0)
  const frame = useRef(0)
  const previousFrameTime = useRef<number | null>(null)

  // What to draw, mirrored into a ref so the loop can read the current game and
  // color without being torn down and rebuilt mid-playback. Declared before
  // every other effect so it is already current by the time they run.
  const scene = useRef({ points, marks, color, lastIndex })
  useEffect(() => {
    scene.current = { points, marks, color, lastIndex }
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const size = resizeCanvas(canvas, ctx)
    const { points: p, marks: m, color: c } = scene.current
    drawFrame(ctx, { points: p, marks: m, cursor: cursor.current, color: c, size })
  }, [])

  /** Cancel any pending frame. Safe to call when none is scheduled. */
  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current)
    frame.current = 0
    previousFrameTime.current = null
  }, [])

  // A named function expression, so the body can schedule the next frame with
  // itself: `advance` is bound inside its own scope, where the `const` holding
  // an arrow function would not yet be initialized.
  const step = useCallback(
    function advance(now: number) {
      const previous = previousFrameTime.current
      previousFrameTime.current = now
      // Clamped at both ends. A frame's timestamp can predate the one that
      // scheduled it, which would run the replay backwards, and a tab returning
      // from the background reports an arbitrarily large gap.
      const delta = previous === null ? 0 : Math.min(Math.max(0, now - previous), MAX_FRAME_MS)
      const end = scene.current.lastIndex
      const next = cursor.current + (delta / 1000) * PLAYS_PER_SECOND

      if (next >= end) {
        cursor.current = end
        draw()
        setPlayIndex(end)
        stop()
        setPlaying(false)
        return
      }
      cursor.current = next
      draw()
      setPlayIndex(Math.floor(next))
      frame.current = requestAnimationFrame(advance)
    },
    [draw, setPlayIndex, setPlaying, stop],
  )

  /** Run the loop from wherever the cursor is. Never stacks two loops. */
  const start = useCallback(() => {
    stop()
    setPlaying(true)
    frame.current = requestAnimationFrame(step)
  }, [setPlaying, step, stop])

  const play = useCallback(() => {
    if (scene.current.lastIndex <= 0) return
    // Pressing play on a finished replay starts it over, which is what the
    // button offers to do at that point.
    if (cursor.current >= scene.current.lastIndex) {
      cursor.current = 0
      setPlayIndex(0)
    }
    start()
  }, [setPlayIndex, start])

  const pause = useCallback(() => {
    stop()
    setPlaying(false)
  }, [setPlaying, stop])

  const toggle = useCallback(() => {
    if (playing) pause()
    else play()
  }, [pause, play, playing])

  const restart = useCallback(() => {
    stop()
    cursor.current = 0
    setPlayIndex(0)
    draw()
    start()
  }, [draw, setPlayIndex, start, stop])

  // Repaint on resize, and once on mount: ResizeObserver reports the initial
  // size when it begins observing, which is also the first moment the canvas
  // has a measurable width. Device-pixel-ratio changes are covered too, since
  // resizeCanvas re-reads the ratio on every draw.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => draw())
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [draw])

  // Mount, and every change of game: rewind to the opening kickoff and run.
  // Someone who prefers reduced motion gets the finished curve immediately
  // instead, with the transport still there if they want to watch it play.
  useEffect(() => {
    stop()
    cursor.current = reduceMotion ? lastIndex : 0
    setPlayIndex(cursor.current)
    if (reduceMotion) {
      setPlaying(false)
      draw()
    } else {
      start()
    }
    // Cancels the pending frame on unmount, and before this effect re-runs for
    // a different game. Nothing else holds a frame handle.
    return stop
  }, [game.gameId, lastIndex, reduceMotion, draw, setPlayIndex, setPlaying, start, stop])

  return { canvasRef, playing, playIndex, lastIndex, play, pause, toggle, restart }
}
