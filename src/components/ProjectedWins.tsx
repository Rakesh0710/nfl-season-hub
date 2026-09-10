/**
 * Projected wins on a 0-17 scale, with last season's actual wins marked for
 * comparison.
 *
 * Every value is printed as well as plotted, and the markers are positioned
 * with CSS rather than by animation, so the whole thing is readable from the
 * first painted frame and stays correct if nothing ever animates.
 */

import { m, useReducedMotion } from 'framer-motion'
import { num } from '@/lib/football'
import { useCountUp } from '@/lib/useCountUp'
import type { TeamRecord } from '@/types/nfl'

const MAX_WINS = 17

export default function ProjectedWins({
  projected,
  lastSeason,
  color,
}: {
  projected: number
  lastSeason: TeamRecord
  color: string
}) {
  const reduceMotion = useReducedMotion()
  const known = Number.isFinite(projected)
  const animated = useCountUp(known ? projected : 0)
  const pct = (v: number) => (Math.max(0, Math.min(MAX_WINS, v)) / MAX_WINS) * 100
  const actual = lastSeason.wins
  const delta = known ? projected - actual : null

  return (
    <section
      aria-label="Projected wins"
      className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[11px] font-semibold tracking-widest text-muted uppercase">
          Projected wins
        </h2>
        <p className="text-sm text-neutral-400">
          {/* The same split StatBar uses: the animated digits are hidden from
              assistive technology, which is handed the settled figure, because
              mid-count-up the DOM reads a number that was never true. */}
          <span className="text-2xl font-bold text-neutral-100 tabular-nums">
            <span aria-hidden="true">{known ? num(animated, 1) : num(projected, 1)}</span>
            <span className="sr-only">{num(projected, 1)}</span>
          </span>
          <span className="ml-2">
            vs {actual} actual
            {delta !== null && (
              <span className={delta >= 0 ? 'text-emerald-400' : 'text-amber-400'}>
                {' '}
                ({delta >= 0 ? '+' : ''}
                {num(delta, 1)})
              </span>
            )}
          </span>
        </p>
      </div>

      <div className="relative mt-4 mb-6 h-3">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-neutral-800" />
        {known && (
          <m.div
            className="absolute top-1/2 left-0 h-2 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: color }}
            initial={{ width: reduceMotion ? `${pct(projected)}%` : 0 }}
            animate={{ width: `${pct(projected)}%` }}
            transition={{ duration: reduceMotion ? 0 : 0.6, ease: 'easeOut' }}
          />
        )}

        {/* Last season's actual wins, as a tick the projection is read against. */}
        <div
          className="absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-neutral-300"
          style={{ left: `${pct(actual)}%` }}
          aria-hidden
        />
        <span
          className="absolute top-full mt-1 -translate-x-1/2 text-[10px] whitespace-nowrap text-neutral-400 tabular-nums"
          style={{ left: `${pct(actual)}%` }}
        >
          {actual} last yr
        </span>
      </div>

      <div className="flex justify-between text-[10px] text-muted tabular-nums">
        <span>0</span>
        <span>{MAX_WINS} games</span>
      </div>
    </section>
  )
}
