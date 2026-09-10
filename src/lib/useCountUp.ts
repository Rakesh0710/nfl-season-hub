/**
 * Counts a number up to its final value once, on mount.
 *
 * Only the animation's progress lives in state; the displayed figure is
 * derived during render. The final value is returned immediately when the
 * visitor prefers reduced motion, so the number is always readable even if
 * nothing ever animates.
 */

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

/** Decelerating ease, so the figure becomes legible almost at once. */
const easeOut = (t: number) => 1 - (1 - t) ** 3

export function useCountUp(target: number, durationMs = 650): number {
  const reduceMotion = useReducedMotion()
  const [progress, setProgress] = useState(reduceMotion ? 1 : 0)
  const frame = useRef(0)

  useEffect(() => {
    if (reduceMotion) return
    const start = performance.now()
    const tick = (now: number) => {
      // Clamped at both ends. requestAnimationFrame reports the frame's start
      // time, which can predate the performance.now() captured above, and a
      // negative fraction briefly rendered a negative figure - "-0.1" points
      // per game - before the count-up climbed.
      const elapsed = Math.max(0, Math.min(1, (now - start) / durationMs))
      setProgress(easeOut(elapsed))
      if (elapsed < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [durationMs, reduceMotion])

  if (reduceMotion || !Number.isFinite(target)) return target
  return target * progress
}
