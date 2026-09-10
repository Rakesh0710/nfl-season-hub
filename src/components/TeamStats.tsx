/**
 * Offense and defense stat lines.
 *
 * A team file carries only its own numbers, so there is no league distribution
 * to rank against. Each bar therefore uses a fixed, printed scale chosen to
 * span the realistic range, and the defensive panel says outright that lower
 * is better — otherwise a long bar would read as good on both sides.
 */

import { num, percent } from '@/lib/football'
import StatBar from '@/components/StatBar'
import type { Team, TeamStatLine } from '@/types/nfl'

/** Derived from the frozen contract rather than re-declared alongside it. */
type TeamStatsShape = Team['stats']

type Metric = {
  key: keyof TeamStatLine
  label: string
  domain: [number, number]
  format: (v: number) => string
}

const METRICS: Metric[] = [
  { key: 'epaPerPlay', label: 'EPA per play', domain: [-0.25, 0.25], format: (v) => v.toFixed(3) },
  { key: 'pointsPerGame', label: 'Points per game', domain: [0, 35], format: (v) => num(v, 1) },
  { key: 'yardsPerGame', label: 'Yards per game', domain: [0, 450], format: (v) => num(v, 0) },
  { key: 'successRate', label: 'Success rate', domain: [0.3, 0.55], format: (v) => percent(v, 1) },
  {
    key: 'explosiveRate',
    label: 'Explosive rate',
    domain: [0, 0.12],
    format: (v) => percent(v, 1),
  },
]

function Panel({
  title,
  line,
  color,
  lowerIsBetter,
}: {
  title: string
  line: TeamStatLine | undefined
  color: string
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
            {METRICS.map((metric) => (
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
            From {line.plays.toLocaleString()} regular-season scrimmage plays.
          </p>
        </>
      )}
    </section>
  )
}

export default function TeamStats({ stats, color }: { stats: TeamStatsShape; color: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Offense" line={stats?.offense} color={color} />
      <Panel title="Defense" line={stats?.defense} color={color} lowerIsBetter />
    </div>
  )
}
