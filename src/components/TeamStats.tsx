/**
 * Offense and defense stat lines.
 *
 * A team file carries only its own numbers, so there is no league distribution
 * to rank against. Each bar therefore uses a fixed, printed scale (defined once
 * in `lib/stats.ts`, so the comparison page cannot disagree with this one), and
 * the defensive panel says outright that lower is better — otherwise a long bar
 * would read as good on both sides. To read these against another team rather
 * than against the scale, /compare puts two of them on one axis.
 */

import StatBar from '@/components/StatBar'
import { TEAM_METRICS } from '@/lib/stats'
import type { TeamSeason, TeamStatLine } from '@/types/nfl'

/** Derived from the frozen contract rather than re-declared alongside it. */
type TeamStatsShape = TeamSeason['stats']

function Panel({
  title,
  line,
  color,
  season,
  lowerIsBetter,
}: {
  title: string
  line: TeamStatLine | undefined
  color: string
  season?: number
  lowerIsBetter?: boolean
}) {
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
        {lowerIsBetter && <span className="text-[11px] text-muted">lower is better</span>}
      </div>
      {!line ? (
        <p className="mt-3 text-sm text-neutral-400">No stats available for this team.</p>
      ) : (
        <>
          <div className="mt-2 divide-y divide-neutral-800/60">
            {TEAM_METRICS.map((metric) => (
              <StatBar
                key={metric.key}
                label={metric.label}
                value={line[metric.key]}
                domain={metric.domain}
                format={metric.format}
                color={color}
              />
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted">
            {/* Naming the season is not decoration. These are season-shaped
                figures, and a reader who assumes they are this week's is
                reading them wrong. */}
            From {line.plays.toLocaleString()} regular-season scrimmage plays
            {season ? ` in ${season}` : ''}.
          </p>
        </>
      )}
    </section>
  )
}

export default function TeamStats({
  stats,
  color,
  season,
}: {
  stats: TeamStatsShape
  color: string
  season?: number
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Offense" line={stats?.offense} color={color} season={season} />
      <Panel title="Defense" line={stats?.defense} color={color} season={season} lowerIsBetter />
    </div>
  )
}
