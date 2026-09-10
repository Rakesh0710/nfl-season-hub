/**
 * One player, rendered the same way wherever they appear.
 *
 * Every optional field is genuinely optional in the data — 163 players have no
 * age and 182 no college — so each is dropped from the line rather than
 * rendered as a placeholder, and the line degrades to just a name.
 */

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
          className={`w-4 shrink-0 text-xs tabular-nums ${rank === 1 ? 'font-bold text-emerald-400' : 'text-neutral-600'}`}
          title={rank === 1 ? 'Starter' : `Depth ${rank}`}
        >
          {rank}
        </span>
      )}
      <span className="w-7 shrink-0 text-xs text-neutral-500 tabular-nums">
        {player.number !== undefined ? `#${player.number}` : ''}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-sm text-neutral-100">{player.name}</span>
        {details.length > 0 && (
          <span className="ml-2 text-xs break-words text-neutral-500">{details.join(' · ')}</span>
        )}
      </span>
    </div>
  )
}
