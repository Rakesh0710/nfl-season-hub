/**
 * One number, week by week.
 *
 * A list of bars rather than a canvas: there are at most eighteen of them, the
 * shape is the whole message, and every bar is also a link into that week's
 * replay — which a canvas would have to reinvent hit-testing for. The replay
 * chart earns its canvas by animating 200 points at 60fps; this does not.
 *
 * The scale is the player's own best week, printed above the bars, because
 * there is no league distribution in a player file to rank against — the same
 * reason the team stat bars print their endpoints.
 */

import { Link } from 'react-router-dom'
import { formatStat, type StatGroup } from '@/lib/playerStats'
import type { PlayerWeek } from '@/types/nfl'

export default function WeeklyTrend({
  weeks,
  group,
  color,
}: {
  weeks: readonly PlayerWeek[]
  group: StatGroup
  color: string
}) {
  const field = group.fields.find((f) => f.key === group.headline) ?? group.fields[0]
  if (!field) return null

  const values = weeks.map((w) => w.stats[field.key] ?? 0)
  const best = Math.max(...values, 0)
  const played = values.filter((v) => v > 0).length

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-100">
          {group.title} — {field.label.toLowerCase()}
        </h3>
        <p className="text-xs text-muted tabular-nums">
          best {best.toLocaleString()} · {played} of {weeks.length} weeks
        </p>
      </div>

      <ol className="mt-3 space-y-1">
        {weeks.map((week) => {
          const value = week.stats[field.key]
          const share = best > 0 && value !== undefined ? (value / best) * 100 : 0
          const row = (
            <>
              <span className="w-10 shrink-0 text-xs text-muted tabular-nums">Wk {week.week}</span>
              <span className="w-10 shrink-0 text-xs text-neutral-400">
                {week.opponent ? `v ${week.opponent}` : ''}
              </span>
              <span className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-800">
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${share}%`, backgroundColor: color }}
                />
              </span>
              <span className="w-14 shrink-0 text-right text-sm font-semibold text-neutral-100 tabular-nums">
                {formatStat(week.stats, field)}
              </span>
            </>
          )

          return (
            <li key={`${week.season}-${week.week}`}>
              {week.gameId ? (
                <Link
                  to={`/game/${week.gameId}`}
                  className="flex items-center gap-2.5 rounded-md px-1 py-1 transition-colors hover:bg-neutral-800/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-400"
                  aria-label={`Week ${week.week} against ${week.opponent}, ${formatStat(week.stats, field)} ${field.label.toLowerCase()} — open the replay`}
                >
                  {row}
                </Link>
              ) : (
                <div className="flex items-center gap-2.5 px-1 py-1">{row}</div>
              )}
            </li>
          )
        })}
      </ol>

      <p className="mt-3 text-[11px] text-muted">
        Scaled to this player&rsquo;s best week, not the league&rsquo;s. Every week opens that
        game&rsquo;s replay.
      </p>
    </div>
  )
}
