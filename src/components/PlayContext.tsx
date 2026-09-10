/**
 * Where the game stands on the play the replay is showing.
 *
 * Ordered by what a reader needs first: the clock and the score, then the
 * situation, then what happened, and only then the analytics. The win
 * probability and EPA are deliberately the quietest things in the box — the
 * chart above is already about win probability, and a number that changes
 * every play should not shout over the score.
 */

import { downDistance } from '@/lib/football'
import { clockLabel, periodLabel } from '@/lib/winprob'
import type { Game, GamePlay } from '@/types/nfl'

export default function PlayContext({
  play,
  game,
  color,
}: {
  play: GamePlay
  game: Game
  color: string
}) {
  const situation = [downDistance(play), play.posteam ? `${play.posteam} ball` : null].filter(
    Boolean,
  )

  return (
    // A fixed floor, because descriptions run from four words to a full
    // sentence and a box that grows and shrinks makes the chart above it jump.
    //
    // The test id is here because this box has no role of its own and should
    // not be given one: it is a passage of text that changes with the cursor,
    // not a live region, and announcing it on every play would talk over the
    // scrubber's own value. The end-to-end suite needs a stable handle on it.
    <div
      data-testid="play-context"
      className="min-h-32 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 sm:min-h-28"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs text-neutral-400 tabular-nums">
          {periodLabel(play.quarter)} {clockLabel(play.clockSeconds)}
        </span>
        <span className="text-base font-semibold text-neutral-100 tabular-nums">
          {game.away.id} {play.scoreAway} <span className="text-muted">–</span> {play.scoreHome}{' '}
          {game.home.id}
        </span>
        {play.isKeyPlay && (
          <span className="rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-300 uppercase">
            Key play
          </span>
        )}
      </div>

      {/* Dropped entirely when the play has no down — a kickoff has none, and a
          placeholder would read as missing data rather than as inapplicable. */}
      {situation.length > 0 && (
        <p className="mt-1 text-xs text-neutral-400 tabular-nums">{situation.join(' · ')}</p>
      )}

      <p className="mt-2 text-sm break-words text-neutral-100">{play.description}</p>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted tabular-nums">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          {Math.round(play.homeWinProb * 100)}% {game.home.id} win probability
        </span>
        {play.epa !== undefined && (
          <span>
            EPA {play.epa >= 0 ? '+' : ''}
            {play.epa.toFixed(2)}
          </span>
        )}
      </p>
    </div>
  )
}
