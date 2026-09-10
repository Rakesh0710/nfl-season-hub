/**
 * The depth chart, grouped into offense, defense and special teams.
 *
 * Positions are listed in on-field order rather than alphabetically, and any
 * position the dataset introduces that this app does not know about is
 * collected into a final group instead of being dropped.
 */

import { DEPTH_UNITS } from '@/lib/football'
import PlayerChip from '@/components/PlayerChip'
import type { Player } from '@/types/nfl'

export default function DepthChart({ chart }: { chart: Record<string, Player[]> }) {
  const positions = Object.keys(chart)
  if (positions.length === 0) {
    return <p className="text-sm text-neutral-400">No depth chart published for this team.</p>
  }

  const known = new Set(DEPTH_UNITS.flatMap((u) => u.positions))
  const units = [
    ...DEPTH_UNITS.map((u) => ({
      unit: u.unit,
      positions: u.positions.filter((p) => chart[p]?.length),
    })),
    { unit: 'Other', positions: positions.filter((p) => !known.has(p)).sort() },
  ].filter((u) => u.positions.length > 0)

  return (
    <div className="space-y-6">
      {units.map(({ unit, positions: list }) => (
        <section key={unit}>
          <h3 className="mb-2 text-[11px] font-semibold tracking-widest text-neutral-500 uppercase">
            {unit}
          </h3>
          <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((position) => (
              <div
                key={position}
                className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3"
              >
                <h4 className="mb-1 text-xs font-semibold text-neutral-300">{position}</h4>
                <ol className="divide-y divide-neutral-800/60">
                  {(chart[position] ?? []).map((player, index) => (
                    <li key={`${player.id}-${index}`}>
                      <PlayerChip player={player} rank={index + 1} />
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
