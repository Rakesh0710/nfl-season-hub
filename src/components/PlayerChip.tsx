/**
 * One player, rendered the same way wherever they appear.
 *
 * Every optional field is genuinely optional in the data — 163 players have no
 * age and 182 no college — so each is dropped from the line rather than
 * rendered as a placeholder, and the line degrades to just a name.
 */

import { Link } from 'react-router-dom'
import { NO_VALUE, statusLabel } from '@/lib/football'
import type { Player } from '@/types/nfl'

export default function PlayerChip({
  player,
  rank,
  showStatus = false,
}: {
  player: Player
  /** Depth position, 1 = starter. Omitted on the roster. */
  rank?: number
  showStatus?: boolean
}) {
  // Built by filtering, so a missing value leaves no separator behind.
  const details = [
    player.age !== undefined ? `Age ${player.age}` : null,
    player.college,
    showStatus && player.status ? statusLabel(player.status) : null,
  ].filter((part): part is string => Boolean(part && part !== NO_VALUE))

  return (
    <div className="flex items-baseline gap-2 py-1.5">
      {rank !== undefined && (
        <span
          className={`w-4 shrink-0 text-xs tabular-nums ${rank === 1 ? 'font-bold text-emerald-400' : 'text-muted'}`}
          title={rank === 1 ? 'Starter' : `Depth ${rank}`}
        >
          {rank}
        </span>
      )}
      <span className="w-7 shrink-0 text-xs text-muted tabular-nums">
        {player.number !== undefined ? `#${player.number}` : ''}
      </span>
      <span className="min-w-0 flex-1">
        {/* Linked only when a profile exists. The dataset records no
            production for about a third of a roster — offensive linemen most
            of all — and a page repeating this line with a photograph on it
            would be a dead end dressed up as a destination. */}
        {player.hasProfile ? (
          <Link
            to={`/player/${player.id}`}
            className="rounded-sm text-sm text-neutral-100 underline decoration-neutral-700 underline-offset-2 transition-colors hover:decoration-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            {player.name}
          </Link>
        ) : (
          <span className="text-sm text-neutral-100">{player.name}</span>
        )}
        {details.length > 0 && (
          <span className="ml-2 text-xs break-words text-muted">{details.join(' · ')}</span>
        )}
      </span>
    </div>
  )
}
