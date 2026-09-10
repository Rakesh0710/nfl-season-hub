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
 *
 * There is exactly one playback position: `cursor`, a fractional play index.
 * The canvas, the scrubber thumb, the readout and every transport action read
 * and write that one ref. Nothing derives position from a frame count, so
 * dropped frames slow the replay down rather than pushing it out of step.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useReducedMotion } from 'framer-motion'
import { applyCanvasSize, drawFrame, type Size } from '@/lib/replayCanvas'
import { quarterBoundaries, toChartPoints } from '@/lib/winprob'
import type { Game } from '@/types/nfl'

/**
 * Plays revealed per second. A typical 170-play game runs a little over twenty
 * seconds at this rate — long enough to read the swings, short enough to watch
 * twice. Playback is paced by plays rather than by a fixed total duration, so a
 * long game genuinely feels long.
 */
export const PLAYS_PER_SECOND = 8

/** Offered playback rates, as multiples of PLAYS_PER_SECOND. */
export const SPEEDS = [0.5, 1, 2] as const
export type Speed = (typeof SPEEDS)[number]

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
  /** The scrubber. Its value is written imperatively, once per frame. */
  sliderRef: React.RefObject<HTMLInputElement | null>
  playing: boolean
  /** Index of the play the cursor is on. Updated per play, never per frame. */
  playIndex: number
  lastIndex: number
  speed: Speed
  setSpeed: (speed: Speed) => void
  play: () => void
  pause: () => void
  toggle: () => void
  restart: () => void
  /** Jump to a fractional play index. Never changes whether the replay is running. */
  seek: (position: number) => void
  /** Move by whole plays from the current one — what the arrow keys do. */
  nudge: (plays: number) => void
  /** Continue from the cursor, without the Play button's rewind-when-finished rule. */
  resume: () => void
}

export function useReplay(game: Game, color: string): Replay {
  const reduceMotion = useReducedMotion()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sliderRef = useRef<HTMLInputElement>(null)

  const points = useMemo(() => toChartPoints(game), [game])
  const marks = useMemo(() => quarterBoundaries(game), [game])
  const lastIndex = Math.max(0, points.length - 1)

  const [playing, setPlaying] = useLoopValue(false)
  const [playIndex, setPlayIndex] = useLoopValue(0)
  const [speed, setSpeed] = useState<Speed>(1)

  const cursor = useRef(0)
  // Measured by the ResizeObserver, never inside a frame. See applyCanvasSize.
  const size = useRef<Size>({ width: 0, height: 0 })
  const sliderAt = useRef(-1)
  const frame = useRef(0)
  const previousFrameTime = useRef<number | null>(null)

  // What to draw, mirrored into a ref so the loop can read the current game and
  // color without being torn down and rebuilt mid-playback. Declared before
  // every other effect so it is already current by the time they run.
  const scene = useRef({ points, marks, color, lastIndex, speed })
  useEffect(() => {
    scene.current = { points, marks, color, lastIndex, speed }
  })

  /**
   * Put the cursor on screen: repaint the canvas, move the scrubber thumb and
   * refill its track. All three read `cursor.current` and nothing else, so the
   * three can never disagree.
   *
   * The thumb is set imperatively rather than as a React value because it
   * tracks the cursor at 60fps, and routing that through React would mean a
   * render per frame — the one thing this design exists to avoid.
   */
  const render = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx && size.current.width > 0 && size.current.height > 0) {
      applyCanvasSize(canvas, ctx, size.current)
      const { points: p, marks: m, color: c } = scene.current
      drawFrame(ctx, { points: p, marks: m, cursor: cursor.current, color: c, size: size.current })
    }
    const slider = sliderRef.current
    if (slider) {
      const end = scene.current.lastIndex
      const fraction = end > 0 ? cursor.current / end : 0
      // Moving the thumb relayouts the control and refilling the track
      // restyles it, together the most expensive thing outside the canvas.
      // Writes the eye cannot see are skipped: a thousandth of the track is
      // under a pixel wide at any width this control is ever given, and at 1x
      // the cursor crosses one of those steps about 37 times a second rather
      // than 60.
      const stop = Math.round(fraction * 1000)
      if (stop !== sliderAt.current) {
        sliderAt.current = stop
        slider.value = String(cursor.current)
        slider.style.setProperty('--progress', `${fraction * 100}%`)
      }
    }
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
      const next = cursor.current + (delta / 1000) * PLAYS_PER_SECOND * scene.current.speed

      if (next >= end) {
        cursor.current = end
        render()
        setPlayIndex(end)
        stop()
        setPlaying(false)
        return
      }
      cursor.current = next
      render()
      setPlayIndex(Math.floor(next))
      frame.current = requestAnimationFrame(advance)
    },
    [render, setPlayIndex, setPlaying, stop],
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

  /**
   * Move the playback position. Deliberately says nothing about whether the
   * replay is running: seeking while paused stays paused, and seeking while
   * playing carries straight on from the new position, because the loop reads
   * the same cursor on its next frame.
   */
  const seek = useCallback(
    (position: number) => {
      const end = scene.current.lastIndex
      const wanted = Number.isFinite(position) ? position : 0
      cursor.current = Math.min(end, Math.max(0, wanted))
      setPlayIndex(Math.floor(cursor.current))
      render()
    },
    [render, setPlayIndex],
  )

  /**
   * Move by whole plays from the one currently showing. Counting from the
   * floor rather than from the fractional cursor means a press always lands on
   * a play boundary, so repeated presses walk the plays one at a time instead
   * of accumulating a fraction.
   */
  const nudge = useCallback(
    (plays: number) => {
      seek(Math.floor(cursor.current) + plays)
    },
    [seek],
  )

  const toggle = useCallback(() => {
    if (playing) pause()
    else play()
  }, [pause, play, playing])

  /** Carry on from the cursor. Unlike `play`, a finished replay stays finished. */
  const resume = useCallback(() => {
    if (cursor.current >= scene.current.lastIndex) return
    start()
  }, [start])

  const restart = useCallback(() => {
    stop()
    cursor.current = 0
    setPlayIndex(0)
    render()
    start()
  }, [render, setPlayIndex, start, stop])

  // The only place the canvas is measured. ResizeObserver reports the initial
  // size when it begins observing, which is also the first moment the canvas
  // has one, so this doubles as the first paint. Device-pixel-ratio changes are
  // picked up by the next frame, since applyCanvasSize re-reads the ratio.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.contentRect
      if (!box) return
      size.current = { width: Math.round(box.width), height: Math.round(box.height) }
      render()
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [render])

  // Mount, and every change of game: rewind to the opening kickoff and run.
  // Someone who prefers reduced motion gets the finished curve immediately
  // instead, with the transport still there if they want to watch it play.
  useEffect(() => {
    stop()
    // Forget where the thumb was last written: a different game has a
    // different scale, so the skip-if-unchanged test above must not match
    // against the previous game's position.
    sliderAt.current = -1
    cursor.current = reduceMotion ? lastIndex : 0
    setPlayIndex(cursor.current)
    if (reduceMotion) {
      setPlaying(false)
      render()
    } else {
      start()
    }
    // Cancels the pending frame on unmount, and before this effect re-runs for
    // a different game. Nothing else holds a frame handle.
    return stop
  }, [game.gameId, lastIndex, reduceMotion, render, setPlayIndex, setPlaying, start, stop])

  return {
    canvasRef,
    sliderRef,
    playing,
    playIndex,
    lastIndex,
    speed,
    setSpeed,
    play,
    pause,
    toggle,
    restart,
    seek,
    nudge,
    resume,
  }
}
