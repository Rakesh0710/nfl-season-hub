/**
 * The roster, grouped by position.
 *
 * nflverse returns the whole season's roster, not the 53-man active list — a
 * team carries 95-110 names including released, reserve and practice-squad
 * players. Active is therefore the default view, with the full list one click
 * away, so the page opens on something a person would recognise as the roster.
 *
 * The grid is `items-start`: without it a one-player group such as Kickers is
 * stretched to the height of the tallest group in its row, leaving a card of
 * dead space.
 */

import { useMemo, useState } from 'react'
import { groupByPosition, isActive, POSITION_GROUP_LABELS } from '@/lib/football'
import PlayerChip from '@/components/PlayerChip'
import type { Player } from '@/types/nfl'

export default function Roster({ players }: { players: readonly Player[] }) {
  const [activeOnly, setActiveOnly] = useState(true)

  const activeCount = useMemo(() => players.filter(isActive).length, [players])
  const shown = useMemo(
    () => (activeOnly ? players.filter(isActive) : players),
    [players, activeOnly],
  )
  const groups = useMemo(() => groupByPosition(shown), [shown])

  if (players.length === 0) {
    return <p className="text-sm text-neutral-400">No roster available for this team.</p>
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="text-sm text-neutral-400">
          {shown.length} of {players.length} players
        </p>
        <div className="flex gap-1 rounded-lg border border-neutral-800 p-1">
          {[
            { label: `Active (${activeCount})`, value: true },
            { label: `All (${players.length})`, value: false },
          ].map((option) => (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={activeOnly === option.value}
              onClick={() => setActiveOnly(option.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
                activeOnly === option.value
                  ? 'bg-neutral-100 text-neutral-900'
                  : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-neutral-400">No players match this filter.</p>
      ) : (
        <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(([position, list]) => (
            <section
              key={position}
              className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3"
            >
              <h3 className="mb-1 flex items-baseline justify-between gap-2 text-xs font-semibold text-neutral-300">
                <span>{POSITION_GROUP_LABELS[position] ?? position}</span>
                <span className="text-muted tabular-nums">{list.length}</span>
              </h3>
              <ul className="divide-y divide-neutral-800/60">
                {list.map((player) => (
                  <li key={player.id}>
                    <PlayerChip player={player} showStatus={!activeOnly} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
